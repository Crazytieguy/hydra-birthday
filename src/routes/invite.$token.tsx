import { useState } from 'react'
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Screen } from '@/components/screens'
import { errorCode } from '@/lib/errors'
import {
  clearPendingSessionToken,
  getOrCreatePendingSessionToken,
  writeSessionCookie,
} from '@/lib/session'

// Public. Rendering never consumes the invite; only the Join button does, via
// a mutation — so link-preview bots (Signal, WhatsApp, Partiful) can't burn it.
export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.invites.peek, { token: params.token }),
    )
    if (context.sessionToken) {
      await context.queryClient.ensureQueryData(
        convexQuery(api.users.me, { sessionToken: context.sessionToken }),
      )
    }
  },
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useParams()
  const { sessionToken } = Route.useRouteContext()
  const { data: invite } = useSuspenseQuery(
    convexQuery(api.invites.peek, { token }),
  )

  if (invite.status === 'invalid') {
    return (
      <Screen
        title="This link isn't valid"
        description="Check that it was copied in full, or ask for a new one."
      />
    )
  }
  if (invite.status === 'claimed') {
    return (
      <Screen
        title="This link was already used"
        description="Invite links work once. If that was you on this device, you're already in."
      >
        <Button asChild>
          <Link to="/">Open the app</Link>
        </Button>
      </Screen>
    )
  }
  return <ClaimForm token={token} invite={invite} sessionToken={sessionToken} />
}

type AvailableInvite = Extract<
  typeof api.invites.peek._returnType,
  { status: 'available' }
>

const messages: Record<string, string> = {
  INVITE_CLAIMED: 'Someone already used this link.',
  INVALID_INVITE: "This link isn't valid anymore.",
  INVALID_NAME: 'Please enter a name (up to 60 characters).',
}
// After these the pending secret is useless; forget it so a retry starts clean.
const terminal = new Set([
  'INVITE_CLAIMED',
  'INVALID_INVITE',
  'INVALID_SESSION_TOKEN',
])
const GENERIC_ERROR = 'Something went wrong — please try again.'
const COOKIES_BLOCKED =
  'Your browser is blocking cookies or storage. Enable them for this site and try again.'

function ClaimForm({
  token,
  invite,
  sessionToken,
}: {
  token: string
  invite: AvailableInvite
  sessionToken: string | null
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const claim = useMutation(api.invites.claim)
  const [name, setName] = useState(
    invite.kind === 'new' ? (invite.label ?? '') : invite.name,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setBusy(true)
    setError(null)
    const fail = (message: string) => {
      setError(message)
      setBusy(false)
    }

    const secret = getOrCreatePendingSessionToken(token)
    if (!secret) return fail(COOKIES_BLOCKED)
    try {
      await claim({
        token,
        name: invite.kind === 'new' ? name : undefined,
        sessionToken: secret,
      })
    } catch (caught) {
      const code = errorCode(caught)
      if (code && terminal.has(code)) clearPendingSessionToken(token)
      return fail(messages[code ?? ''] ?? GENERIC_ERROR)
    }
    // Committed. The pending secret stays until the cookie provably holds it,
    // so a retry re-enters the idempotent path instead of burning the link.
    if (!writeSessionCookie(secret)) return fail(COOKIES_BLOCKED)
    clearPendingSessionToken(token)
    await router.invalidate()
    await navigate({ to: '/' })
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
          void join()
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
          {busy ? 'Joining…' : 'Join'}
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
