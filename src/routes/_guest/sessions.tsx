import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { STRONG_VOTE_TARGET } from '../../../convex/lib/slots'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HeartVote, nextVote } from '@/components/heart-vote'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'

export const Route = createFileRoute('/_guest/sessions')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.partySessions.list, {}, context.sessionToken),
    )
  },
  component: SessionsPage,
})

type SessionItem =
  (typeof api.partySessions.list._returnType)['sessions'][number]

function SessionsPage() {
  const navigate = useNavigate()
  const { data } = useSessionQuery(api.partySessions.list, {})
  const confirm = useSessionAction(api.partySessions.confirmVotes)
  const strongCount = data.sessions.filter((s) => s.myVote === 'strong').length
  const firstPass = data.votesConfirmedAt === null

  async function doneVoting() {
    const result = await confirm.run({})
    if (result !== undefined) void navigate({ to: '/availability' })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-6">
      <div className="mx-auto max-w-2xl space-y-2 lg:mx-0 lg:max-w-none">
        <div className="flex items-baseline justify-between">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/">← Back</Link>
          </Button>
          {firstPass && (
            <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
              Step 1 of 2
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Pick your sessions
        </h1>
        <p className="text-muted-foreground">
          Vote for sessions you'd attend, and strong vote for sessions you'd{' '}
          <em>really</em> want to attend (aim for up to {STRONG_VOTE_TARGET})
        </p>
        {strongCount > STRONG_VOTE_TARGET && (
          <p className="text-primary text-sm font-bold">
            Ideally try to stick to less than {STRONG_VOTE_TARGET + 1} strong
            votes
          </p>
        )}
      </div>

      <div className="mx-auto max-w-2xl gap-x-12 lg:mx-0 lg:max-w-none lg:columns-2 xl:columns-3">
        {data.sessions.map((session) => (
          <SessionRow key={session._id} session={session} />
        ))}
      </div>

      <div className="mx-auto max-w-2xl space-y-2 lg:mx-0 lg:max-w-none">
        {firstPass ? (
          <Button
            size="lg"
            className="rounded-full px-8"
            disabled={confirm.busy}
            onClick={() => void doneVoting()}
          >
            Done voting
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Votes are in. You can keep changing them until Tuesday Sep 8.
          </p>
        )}
        <ErrorText message={confirm.error} />
      </div>
    </div>
  )
}

function SessionRow({ session }: { session: SessionItem }) {
  const [expanded, setExpanded] = useState(false)
  const setVote = useSessionAction(api.partySessions.setVote)
  const expandable = session.description !== null

  return (
    <div className="border-border break-inside-avoid border-b py-2.5">
      <div className="flex items-center gap-3">
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${session.title}: ${expanded ? 'hide' : 'show'} description`}
            className="min-w-0 flex-grow py-1 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <RowHeading session={session} chevron={expanded ? '▴' : '▾'} />
          </button>
        ) : (
          <div className="min-w-0 flex-grow py-1">
            <RowHeading session={session} />
          </div>
        )}
        <HeartVote
          vote={session.myVote}
          disabled={setVote.busy}
          onCycle={() =>
            void setVote.run({
              partySessionId: session._id,
              strength: nextVote(session.myVote),
            })
          }
        />
      </div>
      {expanded && session.description !== null && (
        <div className="space-y-2 pt-1 pb-2 text-sm leading-relaxed whitespace-pre-wrap">
          {session.description}
          {session.needsFacilitator && (
            <p className="text-muted-foreground">
              Let Yoav, Guy, or Libi know if you'd like to facilitate!
            </p>
          )}
        </div>
      )}
      <ErrorText message={setVote.error} />
    </div>
  )
}

function RowHeading({
  session,
  chevron,
}: {
  session: SessionItem
  chevron?: string
}) {
  return (
    <>
      <h2 className="font-display text-[17px] leading-tight font-bold">
        {session.title}
        {chevron && (
          <span className="text-muted-foreground ml-1.5 text-sm">
            {chevron}
          </span>
        )}
      </h2>
      <p className="text-muted-foreground text-xs">
        {session.facilitatorNames.join(', ')}
        {session.needsFacilitator && (
          <Badge
            variant="secondary"
            className="ml-1 rounded-full text-[10px] tracking-wide uppercase"
          >
            needs a facilitator
          </Badge>
        )}
      </p>
    </>
  )
}
