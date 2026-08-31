import { useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import {
  EDIT_DEADLINE_LABEL,
  enabledDays,
  hourKey,
} from '../../../convex/lib/slots'
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

const busySlash = {
  backgroundImage:
    'linear-gradient(135deg, transparent 45%, var(--input) 45%, var(--input) 55%, transparent 55%)',
}

function AvailabilityPage() {
  const navigate = useNavigate()
  const { data: mine } = useSessionQuery(api.availability.mine, {})
  const save = useSessionAction(
    api.availability.save,
    (localStore, { sessionToken, blockedHours, confirm }) => {
      const current = localStore.getQuery(api.availability.mine, {
        sessionToken,
      })
      localStore.setQuery(
        api.availability.mine,
        { sessionToken },
        {
          blockedHours: [...new Set(blockedHours)].sort(),
          confirmedAt: current?.confirmedAt ?? (confirm ? Date.now() : null),
        },
      )
    },
  )
  // Local mirror of the crossed-out set: taps and drags feel instant; the
  // whole set is saved (unconfirmed) when the gesture ends. The ref is
  // updated synchronously in `apply` — persisting can happen in the same
  // event tick as the last edit, before React re-renders.
  const [blocked, setBlocked] = useState(
    () => new Set(mine?.blockedHours ?? []),
  )
  const blockedRef = useRef(blocked)
  // While a paint gesture is live, every cell entered is set to this state.
  const paintTo = useRef<boolean | null>(null)
  const confirmed = mine !== null && mine.confirmedAt !== null
  const firstPass = !confirmed

  function apply(hour: string, target: boolean) {
    if (blockedRef.current.has(hour) === target) return
    const next = new Set(blockedRef.current)
    if (target) next.add(hour)
    else next.delete(hour)
    blockedRef.current = next
    setBlocked(next)
  }

  function persist() {
    void save.run({ blockedHours: [...blockedRef.current], confirm: false })
  }

  function startPaint(hour: string) {
    paintTo.current = !blockedRef.current.has(hour)
    apply(hour, paintTo.current)
  }

  function movePaint(e: React.PointerEvent) {
    if (paintTo.current === null) return
    const hour = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest('[data-hour]')
      ?.getAttribute('data-hour')
    if (hour) apply(hour, paintTo.current)
  }

  function endPaint() {
    if (paintTo.current === null) return
    paintTo.current = null
    persist()
  }

  const days = enabledDays()
  const hourCount = Math.max(...days.map((d) => d.endHour - d.startHour))

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/">← Back</Link>
          </Button>
          {firstPass && (
            <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
              Step 2 of 2
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          When can you come?
        </h1>
        <p>
          Cross out the hours you can't make — tap, or drag across a range.
          We'll try to avoid scheduling your voted sessions for those hours!
          Leaving hours open isn't taken as a commitment, just information
        </p>
      </div>

      <div
        className="select-none"
        onPointerMove={movePaint}
        onPointerUp={endPaint}
        onPointerCancel={endPaint}
      >
        <div
          className="grid gap-x-2 gap-y-1"
          style={{
            gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {days.map((day) => (
            <div
              key={day.date}
              className="font-display pb-1 text-center font-bold"
            >
              {day.label.slice(0, 3)} {Number(day.date.slice(8))}
            </div>
          ))}
          {Array.from({ length: hourCount }, (_, i) => {
            const cells = days.map((day) => {
              const hour = day.startHour + i
              return hour < day.endHour
                ? { day, key: hourKey(day.date, hour) }
                : null
            })
            const label = cells.find(Boolean)
            return [
              <div
                key={`label-${i}`}
                className="text-muted-foreground flex items-center text-xs tabular-nums"
              >
                {label ? `${label.day.startHour + i}:00` : ''}
              </div>,
              ...cells.map((cell, dayIndex) => {
                if (!cell) return <div key={`empty-${dayIndex}-${i}`} />
                const isBlocked = blocked.has(cell.key)
                return (
                  <button
                    key={cell.key}
                    type="button"
                    data-hour={cell.key}
                    aria-pressed={isBlocked}
                    aria-label={`${cell.day.label} ${cell.day.startHour + i}:00, ${isBlocked ? 'busy' : 'could make it'}`}
                    className={`h-9 touch-none rounded-lg border transition-colors ${
                      isBlocked
                        ? 'border-border bg-muted'
                        : 'border-border bg-card hover:border-primary/40'
                    }`}
                    style={isBlocked ? busySlash : undefined}
                    onPointerDown={() => startPaint(cell.key)}
                    onClick={(e) => {
                      // Pointer events already handled the tap; this path is
                      // keyboard activation only.
                      if (e.detail === 0) {
                        apply(cell.key, !blocked.has(cell.key))
                        persist()
                      }
                    }}
                  />
                )
              }),
            ]
          })}
        </div>
        <div className="text-muted-foreground flex items-center gap-4 pt-2 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-card border-border inline-block size-3.5 rounded-sm border" />
            could make it
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="bg-muted border-border inline-block size-3.5 rounded-sm border"
              style={busySlash}
            />
            busy
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {confirmed ? (
          <p className="text-muted-foreground text-sm">
            Confirmed. You can keep editing until {EDIT_DEADLINE_LABEL}.
          </p>
        ) : (
          <Button
            size="lg"
            className="rounded-full px-8"
            disabled={save.busy}
            onClick={() =>
              void save
                .run({ blockedHours: [...blockedRef.current], confirm: true })
                .then((result) => {
                  if (result !== undefined) void navigate({ to: '/' })
                })
            }
          >
            Confirm my hours
          </Button>
        )}
        <ErrorText message={save.error} />
      </div>
    </div>
  )
}
