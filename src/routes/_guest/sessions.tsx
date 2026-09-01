import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import {
  EDIT_DEADLINE_LABEL,
  STRONG_VOTE_TARGET,
} from '../../../convex/lib/slots'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HEART, HeartVote, nextVote } from '@/components/heart-vote'
import { ErrorText, StepHeader } from '@/components/screens'
import { cn } from '@/lib/utils'
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
  const setVote = useSessionAction(
    api.partySessions.setVote,
    (localStore, { sessionToken, partySessionId, strength }) => {
      const current = localStore.getQuery(api.partySessions.list, {
        sessionToken,
      })
      if (!current) return
      localStore.setQuery(
        api.partySessions.list,
        { sessionToken },
        {
          ...current,
          sessions: current.sessions.map((session) =>
            session._id === partySessionId
              ? { ...session, myVote: strength }
              : session,
          ),
        },
      )
    },
  )
  const confirm = useSessionAction(
    api.partySessions.confirmVotes,
    (localStore, { sessionToken }) => {
      const current = localStore.getQuery(api.partySessions.list, {
        sessionToken,
      })
      if (current && current.votesConfirmedAt === null) {
        localStore.setQuery(
          api.partySessions.list,
          { sessionToken },
          { ...current, votesConfirmedAt: Date.now() },
        )
      }
    },
  )
  const strongCount = data.sessions.filter((s) => s.myVote === 'strong').length
  const votedAt = data.votesConfirmedAt
  const firstPass = votedAt === null
  // Sessions that arrived after the guest finished their first voting pass
  // (proposals mostly) get pulled into their own section up top so they're
  // hard to miss. The baseline is write-once, so the section only grows;
  // the per-user shuffle holds within each group.
  const isNew = (session: SessionItem) =>
    votedAt !== null && session.addedAt > votedAt
  const newSessions = data.sessions.filter(isNew)
  const mainSessions = data.sessions.filter((session) => !isNew(session))

  const renderRow = (session: SessionItem, className?: string) => (
    <SessionRow
      key={session._id}
      session={session}
      className={className}
      onCycle={() =>
        void setVote.run({
          partySessionId: session._id,
          strength: nextVote(session.myVote),
        })
      }
    />
  )
  // A fixed split (not CSS columns) so expanding a description never
  // reshuffles rows between columns.
  const twoColumns = (
    sessions: Array<SessionItem>,
    rowClassName?: (columnIndex: number) => string,
  ) => {
    const mid = Math.ceil(sessions.length / 2)
    return [sessions.slice(0, mid), sessions.slice(mid)].map(
      (column, columnIndex) => (
        <div key={columnIndex}>
          {column.map((session) =>
            renderRow(session, rowClassName?.(columnIndex)),
          )}
        </div>
      ),
    )
  }

  async function doneVoting() {
    const result = await confirm.run({})
    if (result !== undefined) void navigate({ to: '/availability' })
  }

  return (
    // The extra bottom padding lets the page scroll until the floating
    // strong-vote pill sits below the Done button, covering nothing.
    <div className="mx-auto max-w-4xl space-y-6 py-6 pb-24">
      <div className="mx-auto max-w-2xl space-y-2 lg:mx-0 lg:max-w-none">
        <StepHeader step={1} badge={firstPass} />
        <h1 className="text-3xl font-bold tracking-tight">
          Express interest in sessions
        </h1>
        <p>
          Tap <InlineHeart /> for sessions you'd attend, and tap again for
          sessions you'd <em>really</em> want to attend (aim for up to{' '}
          {STRONG_VOTE_TARGET})
        </p>
      </div>

      {newSessions.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-1 lg:mx-0 lg:max-w-none">
          <h2 className="font-display text-primary text-xl font-bold">
            New <Sparkle />
          </h2>
          {/* The rules are the tinted band's own borders so the fill meets
              them exactly; rows against the closing rule drop their divider
              since the rule draws it (on mobile the columns stack, so only
              the truly last row qualifies). 1-2 new items stay single-column
              so a half-empty right column never shows. */}
          <div className="bg-card border-t-primary/60 border-x-primary/30 border-b-primary/30 rounded-lg border-x border-t-2 border-b px-3">
            {newSessions.length > 2 ? (
              <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-12">
                {twoColumns(newSessions, (columnIndex) =>
                  columnIndex === 0 ? 'lg:last:border-b-0' : 'last:border-b-0',
                )}
              </div>
            ) : (
              <div>
                {newSessions.map((session) =>
                  renderRow(session, 'last:border-b-0'),
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-x-12">
        {twoColumns(mainSessions)}
      </div>
      <ErrorText message={setVote.error} />

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
            Votes are in. You can keep changing them until {EDIT_DEADLINE_LABEL}
            .
          </p>
        )}
        <ErrorText message={confirm.error} />
      </div>

      {strongCount > STRONG_VOTE_TARGET && (
        <div className="bg-primary text-primary-foreground fixed bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold shadow-lg">
          Ideally try to stick to less than {STRONG_VOTE_TARGET + 1} strong
          votes
        </div>
      )}
    </div>
  )
}

function Sparkle() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="fill-primary inline-block align-[-2px]"
    >
      <path d="M10.5 4 Q11.8 10.5 19.5 13 Q11.8 15.5 10.5 22 Q9.2 15.5 1.5 13 Q9.2 10.5 10.5 4 Z" />
      <path d="M19.5 2 Q20.1 4.4 22.5 5 Q20.1 5.6 19.5 8 Q18.9 5.6 16.5 5 Q18.9 4.4 19.5 2 Z" />
    </svg>
  )
}

function InlineHeart() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      aria-label="the heart button"
      className="fill-primary inline-block align-[-2px]"
    >
      <path d={HEART} />
    </svg>
  )
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  )
}

function SessionRow({
  session,
  className,
  onCycle,
}: {
  session: SessionItem
  className?: string
  onCycle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const expandable = session.description !== null

  return (
    <div className={cn('border-border border-b py-2.5', className)}>
      <div className="flex items-center gap-3">
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${session.title}: ${expanded ? 'hide' : 'show'} description`}
            className="flex min-w-0 flex-grow items-center gap-2.5 py-1 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            <Chevron expanded={expanded} />
            <RowHeading session={session} />
          </button>
        ) : (
          <div className="flex min-w-0 flex-grow items-center gap-2.5 py-1">
            <div className="w-[18px] shrink-0" />
            <RowHeading session={session} />
          </div>
        )}
        <HeartVote vote={session.myVote} onCycle={onCycle} />
      </div>
      {expanded && session.description !== null && (
        <div className="space-y-2 pt-1 pb-2 pl-8 text-sm leading-relaxed whitespace-pre-wrap">
          {session.description}
          {session.needsFacilitator && (
            <p className="text-muted-foreground">
              Let Yoav, Guy, or Libi know if you'd like to facilitate!
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RowHeading({ session }: { session: SessionItem }) {
  return (
    <div className="min-w-0">
      <h2 className="font-display text-[17px] leading-tight font-bold">
        {session.title}
      </h2>
      {(session.facilitatorNames.length > 0 || session.needsFacilitator) && (
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
      )}
    </div>
  )
}
