import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { dayHourKeys, enabledDays } from '../../../convex/lib/slots'
import { Button } from '@/components/ui/button'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'

export const Route = createFileRoute('/_guest/availability')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.availability.mine, {}, context.sessionToken),
    )
  },
  component: AvailabilityPage,
})

function AvailabilityPage() {
  const { data: mine } = useSessionQuery(api.availability.mine, {})
  const save = useSessionAction(api.availability.save)
  // Local mirror of the crossed-out set: taps feel instant, every change is
  // saved (unconfirmed) right away, and Confirm marks the grid reviewed.
  const [blocked, setBlocked] = useState(
    () => new Set(mine?.blockedHours ?? []),
  )
  const confirmed = mine !== null && mine.confirmedAt !== null

  function toggle(hour: string) {
    const next = new Set(blocked)
    if (next.has(hour)) next.delete(hour)
    else next.add(hour)
    setBlocked(next)
    void save.run({ blockedHours: [...next], confirm: false })
  }

  return (
    <div className="space-y-6 py-8">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/">← Back</Link>
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">
          When can you come?
        </h1>
        <p className="text-muted-foreground">
          Cross out the hours you can't make. Whatever stays open is fair game
          for scheduling. It is not a promise to show up for all of it; nobody
          attends 28 hours of festival.
        </p>
      </div>

      <div className="space-y-6">
        {enabledDays().map((day) => (
          <div key={day.date} className="space-y-2">
            <h2 className="font-semibold">{day.label}</h2>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {dayHourKeys(day).map((hour) => {
                const isBlocked = blocked.has(hour)
                return (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => toggle(hour)}
                    className={`rounded-md border px-2 py-2 text-sm tabular-nums transition-colors ${
                      isBlocked
                        ? 'bg-muted text-muted-foreground line-through'
                        : 'bg-background hover:bg-accent'
                    }`}
                  >
                    {hour.slice(11)}:00
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {confirmed ? (
          <p className="text-sm text-muted-foreground">
            Confirmed. You can keep editing until Tuesday Sep 8.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Done crossing out? Confirm, so we know this is your real weekend
              and not an untouched page.
            </p>
            <Button
              disabled={save.busy}
              onClick={() =>
                void save.run({ blockedHours: [...blocked], confirm: true })
              }
            >
              Confirm my hours
            </Button>
          </>
        )}
        <ErrorText message={save.error} />
      </div>
    </div>
  )
}
