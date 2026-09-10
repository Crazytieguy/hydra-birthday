import { useState } from 'react'
import type { api } from '../../../convex/_generated/api'
import { formatMinutes, formatRange } from '../../../convex/lib/schedule'
import { layoutDay } from '@/lib/schedule-layout'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Day = (typeof api.schedule.forGuest._returnType)[number]
type Entry = Day['entries'][number]

// One day as a vertical timeline: hour axis down the left, frames as
// full-width bands, activities in lanes sized by duration, long come-and-go
// activities as narrow ribbons on the right. Geometry lives in
// src/lib/schedule-layout.ts; this file only paints.
const PX_PER_HOUR = 88
const AXIS_WIDTH = 44
const RIBBON_WIDTH = 46
const GAP = 4

export function DayTimeline({ day }: { day: Day }) {
  const [open, setOpen] = useState<Entry | null>(null)
  const dayStart = Math.floor(Math.min(...day.entries.map((e) => e.start)) / 60)
  const dayEnd = Math.ceil(Math.max(...day.entries.map((e) => e.end)) / 60)
  const y = (minutes: number) => ((minutes - dayStart * 60) / 60) * PX_PER_HOUR
  const height = (dayEnd - dayStart) * PX_PER_HOUR

  const frames = day.entries.filter((e) => e.kind === 'frame')
  const activities = day.entries.filter((e) => e.kind === 'activity')
  // Lanes are fractions of whatever is left beside the ribbons; ribbons are a
  // fixed pixel width, so the subtraction happens in CSS calc().
  const layout = layoutDay(activities)

  const hours = Array.from(
    { length: dayEnd - dayStart + 1 },
    (_, i) => dayStart + i,
  )

  return (
    <>
      <div className="relative" style={{ height: height + 20 }}>
        {hours.map((h) => (
          <div
            key={h}
            className="absolute right-0 left-0"
            style={{ top: y(h * 60) }}
          >
            <div className="text-muted-foreground absolute -top-2 left-0 text-xs font-extrabold tabular-nums">
              {formatMinutes(h * 60)}
            </div>
            <div
              className="border-border absolute right-0 border-t"
              style={{ left: AXIS_WIDTH }}
            />
          </div>
        ))}

        {frames.map((entry) => (
          <ScheduleBand
            key={entry._id}
            entry={entry}
            style={{
              left: AXIS_WIDTH,
              top: y(entry.start),
              height: y(entry.end) - y(entry.start),
            }}
          />
        ))}

        <div
          className="absolute right-0"
          style={{ left: AXIS_WIDTH + 8, top: 0, bottom: 0 }}
        >
          {layout.blocks.map(({ item, x, width, gutterColumns }) => {
            const gutter = gutterColumns * (RIBBON_WIDTH + GAP)
            const startsWithFrame = frames.some((f) => f.start === item.start)
            const inset = startsWithFrame ? 20 : 0
            return (
              <ScheduleBlock
                key={item._id}
                entry={item}
                onOpen={() => setOpen(item)}
                style={{
                  left: `calc((100% - ${gutter}px) * ${x} + ${x > 0 ? GAP / 2 : 0}px)`,
                  width: `calc((100% - ${gutter}px) * ${width} - ${GAP}px)`,
                  top: y(item.start) + 2 + inset,
                  height: y(item.end) - y(item.start) - 4 - inset,
                }}
              />
            )
          })}
          {layout.ribbons.map(({ item, column }) => (
            <ScheduleRibbon
              key={item._id}
              entry={item}
              onOpen={() => setOpen(item)}
              style={{
                right: column * (RIBBON_WIDTH + GAP),
                width: RIBBON_WIDTH,
                top: y(item.start) + 2,
                height: y(item.end) - y(item.start) - 4,
              }}
            />
          ))}
        </div>
      </div>

      <EntryDialog entry={open} onClose={() => setOpen(null)} />
    </>
  )
}

// A meal, the opening, the party: a tinted band with a small label.
function ScheduleBand({
  entry,
  style,
}: {
  entry: Entry
  style: React.CSSProperties
}) {
  return (
    <div
      className="bg-accent text-muted-foreground absolute right-0 rounded-md px-2 py-1 text-[11px] font-bold tracking-widest uppercase"
      style={style}
    >
      {entry.title}
    </div>
  )
}

const voted = (entry: Entry) => entry.myVote !== null

function ScheduleBlock({
  entry,
  onOpen,
  style,
}: {
  entry: Entry
  onOpen: () => void
  style: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'absolute flex flex-col overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-colors',
        voted(entry)
          ? 'border-primary/50 bg-primary/8 text-primary hover:bg-primary/12'
          : 'border-border bg-card hover:bg-accent/60',
      )}
      style={style}
    >
      <span className="font-display text-[13px] leading-tight font-bold">
        {entry.title}
      </span>
    </button>
  )
}

function ScheduleRibbon({
  entry,
  onOpen,
  style,
}: {
  entry: Entry
  onOpen: () => void
  style: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'absolute flex items-start justify-center overflow-hidden rounded-lg border py-2 text-left transition-colors',
        voted(entry)
          ? 'border-primary/50 bg-primary/8 text-primary hover:bg-primary/12'
          : 'border-border bg-accent hover:bg-accent/60',
      )}
      style={style}
    >
      <span
        className="font-display text-[13px] leading-none font-bold whitespace-nowrap"
        style={{ writingMode: 'vertical-rl' }}
      >
        {entry.title}
      </span>
    </button>
  )
}

function EntryDialog({
  entry,
  onClose,
}: {
  entry: Entry | null
  onClose: () => void
}) {
  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(isOpen) => !isOpen && onClose()}
    >
      <DialogContent className="max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display pr-6 text-xl">
                {entry.title}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                {formatRange(entry.start, entry.end)}
                {entry.facilitatorNames.length > 0 &&
                  ` · ${entry.facilitatorNames.join(', ')}`}
              </DialogDescription>
            </DialogHeader>
            {entry.note && <p className="text-sm">{entry.note}</p>}
            {entry.description && (
              <p className="max-h-[60vh] overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
                {entry.description}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
