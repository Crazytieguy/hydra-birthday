import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { sessionQueryOptions, useMe, useSessionQuery } from '@/lib/guest'

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
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.food.list, {}, sessionToken),
      ),
    ])
  },
  component: Home,
})

function Home() {
  const me = useMe()
  const { data: sessionData } = useSessionQuery(api.partySessions.list, {})
  const { data: mine } = useSessionQuery(api.availability.mine, {})
  const { data: food } = useSessionQuery(api.food.list, {})

  const voteCount = sessionData.sessions.filter((s) => s.myVote !== null).length
  const doneVoting = sessionData.votesConfirmedAt !== null
  const doneAvailability = mine !== null && mine.confirmedAt !== null
  const done = doneVoting && doneAvailability

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Hi, {me.name}</h1>
        {done ? (
          <p>Thanks!</p>
        ) : (
          <p>
            Vote on activities and tell us when you're around. The schedule
            gets built from that.
          </p>
        )}
        <p className="text-sm">
          <a
            href="https://partiful.com/e/bNjOWHJiDhX7CWV7twHK"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            RSVP on Partiful ↗
          </a>
        </p>
      </div>

      <Link
        to="/schedule"
        className="border-primary bg-primary/8 hover:bg-primary/12 flex items-center gap-4 rounded-xl border px-4 py-4 transition-colors"
      >
        <CalendarGlyph />
        <div className="min-w-0 flex-grow">
          <h2 className="font-display text-primary text-lg font-bold">
            Tentative schedule
          </h2>
          <p className="text-sm">
            What's on, and when. More gets added as votes come in.
          </p>
        </div>
        <span className="text-primary">→</span>
      </Link>

      {/* Rows touch: each one's top padding owns the space below the
          previous divider, so the hover fill reaches it. */}
      <div className="-mt-4">
        <Step
          number={1}
          title="Express interest in activities"
          detail={
            voteCount === 0
              ? 'Vote for what you want to happen.'
              : `${voteCount} vote${voteCount === 1 ? '' : 's'} in so far.`
          }
          to="/activities"
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
          title="Propose an activity"
          detail={
            sessionData.myFacilitatedSession
              ? `You've proposed ${sessionData.myFacilitatedSession.title}.`
              : 'Up to one proposal per attendee'
          }
          lockedDetail="Fill availability first."
          to="/propose"
          state={
            sessionData.myFacilitatedSession
              ? 'done'
              : done
                ? 'current'
                : 'locked'
          }
        />
        <Step
          number={4}
          title="Bring food?"
          detail={
            food.myCount === 0
              ? 'Offer a vegan dish for one of the meals. Optional.'
              : `You're bringing ${food.myCount} dish${food.myCount === 1 ? '' : 'es'}.`
          }
          to="/food"
          state={food.myCount > 0 ? 'done' : 'current'}
        />
      </div>
    </div>
  )
}

function CalendarGlyph() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-primary shrink-0"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

// One row of the guided flow: votes first, hours locked until Done voting;
// after that both steps stay freely navigable, just marked done. Food is
// never locked.
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
  to: '/activities' | '/availability' | '/propose' | '/food'
  state: 'done' | 'current' | 'locked'
}) {
  const detailText = state === 'locked' ? (lockedDetail ?? detail) : detail
  const body = (
    <div className="flex items-center gap-4 pt-8 pb-4">
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
        <p className="text-muted-foreground text-sm">{detailText}</p>
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
