import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { NAME_MAX_LENGTH } from '../../convex/lib/names'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorText, Screen } from '@/components/screens'
import { useAsyncAction } from '@/lib/actions'
import { UserFacingError, errorCode } from '@/lib/errors'
import {
  SESSION_COOKIE,
  clearPendingSessionToken,
  getOrCreatePendingSessionToken,
  persistSession,
  readCookie,
} from '@/lib/session'

// Public. Rendering never joins; only the Join button does, via a mutation,
// so link-preview bots (Signal, WhatsApp, Partiful) never sign anyone in.
// A link is never used up: it signs in every browser it is opened on until
// an admin revokes it.
export const Route = createFileRoute('/invite/$token')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      peekQuery(params.token, context.sessionToken),
    )
  },
  component: InvitePage,
})

// The cookie, if any, lets `peek` say who's looking and recognise their links.
const peekQuery = (token: string, sessionToken: string | null) =>
  convexQuery(
    api.invites.peek,
    sessionToken ? { token, sessionToken } : { token },
  )

type Peek = typeof api.invites.peek._returnType
type AvailableInvite = Extract<Peek, { status: 'available' }>

function InvitePage() {
  const { token } = Route.useParams()
  const { sessionToken } = Route.useRouteContext()
  const { data: invite } = useSuspenseQuery(peekQuery(token, sessionToken))
  // Once Join is tapped the live `peek` flips from a first-time link to an
  // existing-account one as soon as the mutation commits; keep the form up
  // until we've navigated away.
  const [joining, setJoining] = useState<AvailableInvite | null>(null)
  const shown = joining ?? invite

  if (shown.status === 'invalid') {
    return (
      <Screen
        title="This link isn't valid"
        description="Make sure the whole link made it over, or ask for a new one."
      />
    )
  }
  if (shown.kind === 'existing' && shown.mine) {
    return (
      <Screen
        title="You're already signed in here"
        description="Open this same link on any other phone or laptop to sign that one in too."
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
      onJoinStart={() => setJoining(shown)}
      onJoinFail={() => setJoining(null)}
    />
  )
}

// After these the pending secret is useless; forget it so a retry starts clean.
const terminal = new Set(['INVALID_INVITE', 'INVALID_SESSION_TOKEN'])
const COOKIES_BLOCKED =
  'Your browser is blocking cookies or storage. Enable them for this site and try again.'
const NOT_SAVED =
  "You joined, but this browser couldn't save the sign-in. Check your connection and try again."

function useJoin(token: string) {
  const navigate = useNavigate()
  const claim = useMutation(api.invites.claim)
  const persist = useServerFn(persistSession)

  return useAsyncAction(async (name?: string) => {
    const secret = getOrCreatePendingSessionToken(token)
    if (!secret) throw new UserFacingError(COOKIES_BLOCKED)
    try {
      await claim({ token, name, sessionToken: secret })
    } catch (caught) {
      const code = errorCode(caught)
      if (code && terminal.has(code)) clearPendingSessionToken(token)
      throw caught
    }
    // Committed. The pending secret stays until the cookie provably holds it,
    // so a retry re-enters the idempotent path with the same secret.
    try {
      await persist({ data: { sessionToken: secret } })
    } catch {
      throw new UserFacingError(NOT_SAVED)
    }
    if (readCookie(SESSION_COOKIE) !== secret)
      throw new UserFacingError(COOKIES_BLOCKED)
    clearPendingSessionToken(token)
    // Navigation re-runs the root beforeLoad, which picks up the new cookie.
    await navigate({ to: '/' })
    return true
  })
}

function ClaimForm({
  token,
  invite,
  onJoinStart,
  onJoinFail,
}: {
  token: string
  invite: AvailableInvite
  onJoinStart: () => void
  onJoinFail: () => void
}) {
  const join = useJoin(token)
  const [name, setName] = useState(
    invite.kind === 'new' ? invite.label : invite.name,
  )
  const { viewer } = invite

  async function submit() {
    onJoinStart()
    const joined = await join.run(invite.kind === 'new' ? name : undefined)
    if (!joined) onJoinFail()
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {invite.kind === 'new'
            ? `${invite.label}, you're invited`
            : "You're invited"}
        </h1>
        <p className="text-muted-foreground">
          {invite.kind === 'new'
            ? 'Tap join to get started.'
            : `This signs this device in as ${invite.name}. Your link works on every device you open it on.`}
        </p>
      </div>
      {viewer && (
        <Alert>
          <AlertTitle>
            This browser is already signed in as {viewer.name}
          </AlertTitle>
          <AlertDescription>
            Joining switches this browser to the new invite.{' '}
            <Link to="/" className="underline">
              Stay as {viewer.name}
            </Link>
          </AlertDescription>
        </Alert>
      )}
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
              maxLength={NAME_MAX_LENGTH}
              autoComplete="name"
              required
            />
          </div>
        )}
        <Button
          type="submit"
          disabled={join.busy || (invite.kind === 'new' && !name.trim())}
        >
          {join.busy ? 'Joining…' : viewer ? 'Switch and join' : 'Join'}
        </Button>
        <ErrorText message={join.error} />
      </form>
    </div>
  )
}
