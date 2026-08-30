import { useEffect, useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Screen } from '@/components/screens'
import { describeError, errorCode } from '@/lib/errors'
import {
  SESSION_COOKIE,
  clearPendingSessionToken,
  getOrCreatePendingSessionToken,
  hasPendingSessionToken,
  persistSession,
  readCookie,
} from '@/lib/session'

// Public. Rendering never consumes the invite; only the Join button does, via
// a mutation — so link-preview bots (Signal, WhatsApp, Partiful) can't burn it.
export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(
        api.invites.peek,
        peekArgs(params.token, context.sessionToken),
      ),
    )
    if (context.sessionToken) {
      await context.queryClient.ensureQueryData(
        convexQuery(api.users.me, { sessionToken: context.sessionToken }),
      )
    }
  },
  component: InvitePage,
})

// The cookie, if any, lets `peek` recognise the link's owner.
const peekArgs = (token: string, sessionToken: string | null) =>
  sessionToken ? { token, sessionToken } : { token }

type Peek = typeof api.invites.peek._returnType
type AvailableInvite = Extract<Peek, { status: 'available' }>

function InvitePage() {
  const { token } = Route.useParams()
  const { sessionToken } = Route.useRouteContext()
  const { data: invite } = useSuspenseQuery(
    convexQuery(api.invites.peek, peekArgs(token, sessionToken)),
  )
  // Once Join is tapped the live `peek` flips to "claimed" as soon as the
  // mutation commits; keep the form up until we've navigated away.
  const [joining, setJoining] = useState<AvailableInvite | null>(null)
  const shown = joining ?? invite

  if (shown.status === 'invalid') {
    return (
      <Screen
        title="This link isn't valid"
        description="Check that it was copied in full, or ask for a new one."
      />
    )
  }
  if (shown.status === 'claimed')
    return <ClaimedScreen token={token} mine={shown.mine} />
  if (shown.kind === 'existing' && shown.mine) {
    return (
      <Screen
        title="This link is for another device"
        description="You're already signed in here. Open it on the phone or laptop you want to sign in."
      >
        <Button asChild>
          <Link to="/">Open the app</Link>
        </Button>
      </Screen>
    )
  }
  return (
    <ClaimForm
      token={token}
      invite={shown}
      sessionToken={sessionToken}
      onJoinStart={() => setJoining(shown)}
      onJoinFail={() => setJoining(null)}
    />
  )
}

// After these the pending secret is useless; forget it so a retry starts clean.
const terminal = new Set([
  'INVITE_CLAIMED',
  'INVALID_INVITE',
  'INVALID_SESSION_TOKEN',
])
const COOKIES_BLOCKED =
  'Your browser is blocking cookies or storage. Enable them for this site and try again.'
const NOT_SAVED =
  "Joined, but the sign-in couldn't be saved. Check your connection and try again."

function useJoin(token: string) {
  const router = useRouter()
  const navigate = useNavigate()
  const claim = useMutation(api.invites.claim)
  const persist = useServerFn(persistSession)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join(name?: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    const fail = (message: string) => {
      setError(message)
      setBusy(false)
      return false
    }

    const secret = getOrCreatePendingSessionToken(token)
    if (!secret) return fail(COOKIES_BLOCKED)
    try {
      await claim({ token, name, sessionToken: secret })
    } catch (caught) {
      const code = errorCode(caught)
      if (code && terminal.has(code)) clearPendingSessionToken(token)
      return fail(describeError(caught))
    }
    // Committed. The pending secret stays until the cookie provably holds it,
    // so a retry re-enters the idempotent path instead of burning the link.
    try {
      await persist({ data: { sessionToken: secret } })
    } catch {
      return fail(NOT_SAVED)
    }
    if (readCookie(SESSION_COOKIE) !== secret) return fail(COOKIES_BLOCKED)
    clearPendingSessionToken(token)
    await router.invalidate()
    await navigate({ to: '/' })
    return true
  }

  return { join, busy, error }
}

function ClaimForm({
  token,
  invite,
  sessionToken,
  onJoinStart,
  onJoinFail,
}: {
  token: string
  invite: AvailableInvite
  sessionToken: string | null
  onJoinStart: () => void
  onJoinFail: () => void
}) {
  const { join, busy, error } = useJoin(token)
  const [name, setName] = useState(
    invite.kind === 'new' ? (invite.label ?? '') : invite.name,
  )

  async function submit() {
    onJoinStart()
    const joined = await join(invite.kind === 'new' ? name : undefined)
    if (!joined) onJoinFail()
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {invite.kind === 'new' && invite.label
            ? `${invite.label}, you're invited`
            : "You're invited"}
        </h1>
        <p className="text-muted-foreground">
          {invite.kind === 'new'
            ? 'Tap join and this browser becomes your ticket in — no password, nothing to remember.'
            : `This link signs this device in as ${invite.name}.`}
        </p>
      </div>
      {sessionToken && <SignedInNotice sessionToken={sessionToken} />}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {invite.kind === 'new' && (
          <div className="space-y-2">
            <Label htmlFor="name">Your name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="name"
              required
            />
          </div>
        )}
        <Button
          type="submit"
          disabled={busy || (invite.kind === 'new' && !name.trim())}
        >
          {busy ? 'Joining…' : sessionToken ? 'Switch and join' : 'Join'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </div>
  )
}

function SignedInNotice({ sessionToken }: { sessionToken: string }) {
  const { data: me } = useSuspenseQuery(
    convexQuery(api.users.me, { sessionToken }),
  )
  if (!me) return null
  return (
    <Alert>
      <AlertTitle>This browser is already signed in as {me.name}</AlertTitle>
      <AlertDescription>
        Joining switches this browser to the new invite.{' '}
        <Link to="/" className="underline">
          Stay as {me.name}
        </Link>
      </AlertDescription>
    </Alert>
  )
}

function ClaimedScreen({ token, mine }: { token: string; mine: boolean }) {
  const { join, busy, error } = useJoin(token)
  // sessionStorage is client-only; decide after hydration to avoid a mismatch.
  const [pending, setPending] = useState(false)
  useEffect(() => setPending(hasPendingSessionToken(token)), [token])

  if (mine) {
    return (
      <Screen
        title="You're in"
        description="This link was used on this browser — you're signed in."
      >
        <Button asChild>
          <Link to="/">Open the app</Link>
        </Button>
      </Screen>
    )
  }
  if (pending) {
    return (
      <Screen
        title="Almost there"
        description="Your last attempt to join didn't finish. Tap below to complete it."
      >
        <Button disabled={busy} onClick={() => void join()}>
          {busy ? 'Joining…' : 'Finish joining'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Screen>
    )
  }
  return (
    <Screen
      title="This link was already used"
      description="Invite links work once. If you joined on another device or browser, ask for a new link."
    />
  )
}
