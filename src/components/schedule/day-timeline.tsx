import { useState } from 'react'
import type { api } from '../../../convex/_generated/api'
import { formatMinutes } from '../../../convex/lib/schedule'
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

// One day as a vertical timeline: hour axis down the left, frames as tinted
// bands, activities in lanes sized by duration, long come-and-go activities as
// narrow ribbons on the right. Lanes come from src/lib/schedule-layout.ts;
// this file only paints.
//
// Every vertical edge is a whole pixel: times are multiples of 30 minutes and
// PX_PER_HOUR is even, so a block's top and bottom border sit exactly on the
// hour and half-hour lines.
const PX_PER_HOUR = 88 // a 30-minute block is a 44px tap target
const LANE_LEFT = 44 // the axis column: labels plus half-hour ticks
const LABEL_WIDTH = 34
const TICK = 6
const GUTTER = 6 // between side-by-side lanes
const RIBBON_WIDTH = 24
const RIBBON_GAP = 6 // between two ribbons
const RIBBON_MARGIN = 8 // between the lanes and the first ribbon
const BAND_LABEL_WIDTH = 64 // kept free inside a frame so its label reads

export function DayTimeline({ day }: { day: Day }) {
  const [open, setOpen] = useState<Entry | null>(null)
  const dayStart = Math.floor(Math.min(...day.entries.map((e) => e.start)) / 60)
  const dayEnd = Math.ceil(Math.max(...day.entries.map((e) => e.end)) / 60)
  const y = (minutes: number) =>
    Math.round(((minutes - dayStart * 60) / 60) * PX_PER_HOUR)
  const height = y(dayEnd * 60) + 1

  const frames = day.entries.filter((e) => e.kind === 'frame')
  const layout = layoutDay(day.entries.filter((e) => e.kind === 'activity'))
  const ribbonsWidth = (columns: number) =>
    columns > 0
      ? columns * RIBBON_WIDTH + (columns - 1) * RIBBON_GAP + RIBBON_MARGIN
      : 0

  const hours = Array.from(
    { length: dayEnd - dayStart + 1 },
    (_, i) => dayStart + i,
  )
  const halfHours = hours.slice(0, -1).map((h) => h * 60 + 30)
  const rule = 'bg-border absolute h-px'

  return (
    <>
      <div className="relative" style={{ height }}>
        {frames.map((entry) => (
          <ScheduleBand
            key={entry._id}
            entry={entry}
            style={{
              left: LANE_LEFT,
              top: y(entry.start),
              height: y(entry.end) - y(entry.start),
            }}
          />
        ))}

        {hours.map((h) => (
          <div
            key={h}
            className="absolute inset-x-0"
            style={{ top: y(h * 60) }}
          >
            <div
              className="text-muted-foreground absolute left-0 -mt-[7px] text-right text-[11px] leading-[14px] font-semibold tabular-nums"
              style={{ width: LABEL_WIDTH }}
            >
              {formatMinutes(h * 60)}
            </div>
            <div className={cn(rule, 'right-0')} style={{ left: LANE_LEFT }} />
          </div>
        ))}
        {halfHours.map((m) => (
          <div
            key={m}
            className={rule}
            style={{ left: LANE_LEFT - TICK, width: TICK, top: y(m) }}
          />
        ))}

        {layout.blocks.map(({ item, lane, lanes, ribbonColumns }) => {
          // Ribbons and a frame's label column come off the lane area first;
          // the rest is split evenly between the lanes running at once.
          const inFrame = frames.some(
            (f) => f.start <= item.start && item.end <= f.end,
          )
          const taken =
            LANE_LEFT +
            ribbonsWidth(ribbonColumns) +
            (inFrame ? BAND_LABEL_WIDTH : 0) +
            GUTTER * (lanes - 1)
          const laneWidth = `(100% - ${taken}px) / ${lanes}`
          return (
            <ScheduleBlock
              key={item._id}
              entry={item}
              onOpen={() => setOpen(item)}
              style={{
                left: `calc(${LANE_LEFT + lane * GUTTER}px + ${lane} * ${laneWidth})`,
                width: `calc(${laneWidth})`,
                top: y(item.start),
                height: y(item.end) - y(item.start) + 1,
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
              right:
                (layout.ribbonColumns - 1 - column) *
                (RIBBON_WIDTH + RIBBON_GAP),
              width: RIBBON_WIDTH,
              top: y(item.start),
              height: y(item.end) - y(item.start) + 1,
            }}
          />
        ))}
      </div>

      <EntryDialog entry={open} onClose={() => setOpen(null)} />
    </>
  )
}

// A meal, the opening, the party: a tinted band with a hairline on each edge
// and a small label top right.
function ScheduleBand({
  entry,
  style,
}: {
  entry: Entry
  style: React.CSSProperties
}) {
  return (
    <div
      className="bg-accent absolute right-0 border-y border-border"
      style={style}
    >
      <span className="text-muted-foreground absolute top-[7px] right-[10px] text-[11px] leading-4 font-bold tracking-[0.08em] uppercase">
        {entry.title}
      </span>
    </div>
  )
}

const voted = (entry: Entry) => entry.myVote !== null

const blockClass = (entry: Entry) =>
  cn(
    'font-display text-foreground hover:text-primary absolute overflow-hidden rounded-[4px] border text-left font-bold transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
    voted(entry) ? 'bg-vote-fill border-vote-line' : 'bg-card border-input',
  )

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
        blockClass(entry),
        'flex items-start px-[10px] py-2 text-sm leading-4',
      )}
      style={style}
    >
      {entry.title}
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
        blockClass(entry),
        'flex items-start justify-center py-2 text-xs leading-[22px] whitespace-nowrap',
      )}
      style={style}
    >
      <span className="[writing-mode:vertical-rl]">{entry.title}</span>
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
            <DialogHeader className="gap-1">
              <DialogTitle className="font-display pr-6 text-base leading-5 font-bold">
                {entry.title}
              </DialogTitle>
              <DialogDescription className="text-foreground text-[13px] leading-[18px] font-bold">
                {formatMinutes(entry.start)}–{formatMinutes(entry.end)}
                {entry.facilitatorNames.length > 0 &&
                  ` · ${entry.facilitatorNames.join(', ')}`}
              </DialogDescription>
              {entry.note && (
                <p className="text-[13px] leading-[18px] font-semibold">
                  {entry.note}
                </p>
              )}
            </DialogHeader>
            {entry.description && (
              <div className="max-h-[60vh] space-y-2 overflow-y-auto text-[13px] leading-[19px]">
                {entry.description.split(/\n{2,}/).map((paragraph, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {paragraph}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
