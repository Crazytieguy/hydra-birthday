import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { DayTimeline } from '@/components/schedule/day-timeline'
import { sessionQueryOptions, useSessionQuery } from '@/lib/guest'

export const Route = createFileRoute('/_guest/schedule')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.schedule.forGuest, {}, context.sessionToken),
    )
  },
  component: SchedulePage,
})

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })

function SchedulePage() {
  const { data: days } = useSessionQuery(api.schedule.forGuest, {})
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6 pb-24">
      <div className="mx-auto max-w-2xl space-y-2 lg:mx-0 lg:max-w-none">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/">← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Tentative Schedule
        </h1>
        <p>
          Activities will likely be added as more votes come in, and things
          might still shift around.
        </p>
      </div>
      {days.length === 0 ? (
        <p className="text-muted-foreground mx-auto max-w-2xl lg:mx-0">
          Nothing is placed yet. Check back soon.
        </p>
      ) : (
        <div className="mx-auto max-w-2xl space-y-10 lg:mx-0 lg:grid lg:max-w-none lg:grid-cols-2 lg:gap-x-12 lg:space-y-0">
          {days.map((day) => (
            <section key={day.date} className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-primary text-xl font-bold">
                  {day.label}
                </h2>
                <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
                  {shortDate(day.date)}
                </span>
              </div>
              <DayTimeline day={day} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
