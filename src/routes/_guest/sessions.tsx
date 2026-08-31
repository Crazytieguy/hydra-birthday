import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { STRONG_VOTE_TARGET } from '../../../convex/lib/slots'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  const { data } = useSessionQuery(api.partySessions.list, {})
  const confirm = useSessionAction(api.partySessions.confirmVotes)
  const strongCount = data.sessions.filter((s) => s.myVote === 'strong').length

  return (
    <div className="space-y-6 py-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/">← Back</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground">
          Vote for sessions you'd attend, and strong vote for sessions you'd{' '}
          <em>really</em> want to attend (aim for up to {STRONG_VOTE_TARGET})
        </p>
      </div>

      {strongCount > STRONG_VOTE_TARGET && (
        <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
          Ideally try to stick to less than {STRONG_VOTE_TARGET + 1} strong
          votes
        </p>
      )}

      <div className="space-y-3">
        {data.sessions.map((session) => (
          <SessionCard key={session._id} session={session} />
        ))}
      </div>

      <div className="space-y-2">
        {data.votesConfirmedAt === null ? (
          <Button disabled={confirm.busy} onClick={() => void confirm.run({})}>
            Done voting
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Votes are in. You can keep changing them until Tuesday Sep 8.
          </p>
        )}
        <ErrorText message={confirm.error} />
      </div>
    </div>
  )
}

function SessionCard({ session }: { session: SessionItem }) {
  const [expanded, setExpanded] = useState(false)
  const setVote = useSessionAction(api.partySessions.setVote)

  const vote = (strength: 'regular' | 'strong') =>
    void setVote.run({
      partySessionId: session._id,
      // Tapping the active option again clears the vote.
      strength: session.myVote === strength ? null : strength,
    })

  const expandable = session.description !== null
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => expandable && setExpanded(!expanded)}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">{session.title}</h2>
              <p className="text-sm text-muted-foreground">
                {session.facilitatorNames.join(', ')}
                {session.needsFacilitator && (
                  <Badge variant="secondary" className="ml-1">
                    needs a facilitator
                  </Badge>
                )}
                {!expandable && (
                  <span className="ml-1 italic">Description TBD</span>
                )}
              </p>
            </div>
            {expandable && (
              <span className="text-muted-foreground">
                {expanded ? '▴' : '▾'}
              </span>
            )}
          </div>
        </button>
        {expanded && session.description !== null && (
          <div className="space-y-2 text-sm whitespace-pre-wrap">
            {session.description}
            {session.needsFacilitator && (
              <p className="text-muted-foreground">
                Let Yoav, Guy, or Libi know if you'd like to facilitate!
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant={session.myVote === 'regular' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={session.myVote === 'regular'}
            disabled={setVote.busy}
            onClick={() => vote('regular')}
          >
            Vote
          </Button>
          <Button
            variant={session.myVote === 'strong' ? 'default' : 'outline'}
            size="sm"
            aria-pressed={session.myVote === 'strong'}
            disabled={setVote.busy}
            onClick={() => vote('strong')}
          >
            Strong vote
          </Button>
        </div>
        <ErrorText message={setVote.error} />
      </CardContent>
    </Card>
  )
}
