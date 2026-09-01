import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CopyButton } from '@/components/copy-button'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useMe,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/')({
  loader: async ({ context }) => {
    const { sessionToken } = context
    await Promise.all([
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.partySessions.list, {}, sessionToken),
      ),
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.availability.mine, {}, sessionToken),
      ),
    ])
  },
  component: Home,
})

function Home() {
  const me = useMe()
  const { data: sessionData } = useSessionQuery(api.partySessions.list, {})
  const { data: mine } = useSessionQuery(api.availability.mine, {})

  const voteCount = sessionData.sessions.filter((s) => s.myVote !== null).length
  const doneVoting = sessionData.votesConfirmedAt !== null
  const doneAvailability = mine !== null && mine.confirmedAt !== null
  const done = doneVoting && doneAvailability

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Hi, {me.name}</h1>
        {done ? (
          sessionData.myFacilitatedSession ? (
            <p>
              Thanks! Your votes and hours are in, and{' '}
              {sessionData.myFacilitatedSession.title} is on the list.
            </p>
          ) : (
            <p>
              Thanks! Your votes and hours are in. Have an idea for a session?
              Propose it below.
            </p>
          )
        ) : (
          <p>
            Help us plan by telling us which sessions you like and when you're
            available, we'll crunch the data and post a final schedule by Wed
            Sep 9th!
          </p>
        )}
        {me.isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Admin</Link>
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <Step
          number={1}
          title="Express interest in sessions"
          detail={
            voteCount === 0
              ? 'Vote for what you want to happen.'
              : `${voteCount} vote${voteCount === 1 ? '' : 's'} in so far.`
          }
          to="/sessions"
          state={doneVoting ? 'done' : 'current'}
        />
        <Step
          number={2}
          title="When can't you come?"
          detail="Cross out the hours you can't make it."
          lockedDetail="After the votes."
          to="/availability"
          state={doneAvailability ? 'done' : doneVoting ? 'current' : 'locked'}
        />
        <Step
          number={3}
          title="Propose a session"
          detail={
            sessionData.myFacilitatedSession
              ? `You're running ${sessionData.myFacilitatedSession.title}.`
              : 'Optional. Put your own idea on the list.'
          }
          lockedDetail="After the hours."
          to="/propose"
          state={
            sessionData.myFacilitatedSession
              ? 'done'
              : done
                ? 'current'
                : 'locked'
          }
        />
      </div>

      <DeviceLinkCard />
    </div>
  )
}

// One row of the guided flow: votes first, hours locked until Done voting;
// after that both steps stay freely navigable, just marked done.
function Step({
  number,
  title,
  detail,
  lockedDetail,
  to,
  state,
}: {
  number: number
  title: string
  detail: string
  lockedDetail?: string
  to: '/sessions' | '/availability' | '/propose'
  state: 'done' | 'current' | 'locked'
}) {
  const body = (
    <div className="flex items-center gap-4 py-4">
      <div
        className={`font-display flex size-9 shrink-0 items-center justify-center rounded-full border text-lg font-bold ${
          state === 'current'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border text-muted-foreground'
        }`}
      >
        {state === 'done' ? '✓' : number}
      </div>
      <div className="min-w-0 flex-grow">
        <h2
          className={`font-display text-lg font-bold ${state === 'locked' ? 'text-muted-foreground' : ''}`}
        >
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">
          {state === 'locked' ? (lockedDetail ?? detail) : detail}
        </p>
      </div>
      {state !== 'locked' && <span className="text-muted-foreground">→</span>}
    </div>
  )
  if (state === 'locked')
    return <div className="border-border border-b opacity-70">{body}</div>
  return (
    <Link to={to} className="border-border hover:bg-accent/40 block border-b">
      {body}
    </Link>
  )
}

function DeviceLinkCard() {
  const createForSelf = useSessionAction(api.invites.createForSelf)
  const [link, setLink] = useState<string | null>(null)

  async function create() {
    const minted = await createForSelf.run({})
    if (minted) setLink(inviteUrl(minted.token))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Use another device</CardTitle>
        <CardDescription>
          Make a one-time link that signs another phone or laptop into this same
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {link ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
              {link}
            </code>
            <CopyButton text={link} />
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={createForSelf.busy}
            onClick={() => void create()}
          >
            Create link
          </Button>
        )}
        <ErrorText message={createForSelf.error} />
      </CardContent>
    </Card>
  )
}
