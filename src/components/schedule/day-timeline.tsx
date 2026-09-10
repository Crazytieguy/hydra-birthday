import { useMemo, useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'
import type { api } from '../../../convex/_generated/api'
import { formatMinutes } from '../../../convex/lib/schedule'
import { assignWashes, layoutDay, overlaps } from '@/lib/schedule-layout'
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
//
// A 30-minute block is 32px: a one-line title (16px) with 8px above and
// below, measured from the grid lines. Taller blocks keep the title at the
// top with the same 8px.
const PX_PER_HOUR = 64
const TITLE_PAD = 7 // plus the 1px border makes the 8px
const LANE_LEFT = 44 // the axis column, for the hour labels
const LABEL_WIDTH = 34
// The hour label sits on the same 16px line box as a block title that starts
// on that hour, so the two read as one row.
const LABEL_TOP = TITLE_PAD + 1
const GUTTER = 6 // between side-by-side lanes
const RIBBON_WIDTH = 24
const WIDE_RIBBON_WIDTH = 60 // a ribbon with labelled segments beside its title
const RIBBON_TITLE_WIDTH = 22 // the vertical title column on the right of a wide ribbon
const RIBBON_GAP = 6 // between two ribbons
const RIBBON_MARGIN = 8 // between the lanes and the first ribbon
const BAND_LABEL_WIDTH = 64 // kept free inside a frame so its label reads

const ribbonWidth = (entry: Entry) =>
  entry.segments.length > 0 ? WIDE_RIBBON_WIDTH : RIBBON_WIDTH

// The pure part of a day's geometry: washes, lanes, and ribbon column
// widths (each column is as wide as its widest ribbon).
function planDay(day: Day) {
  const washes = assignWashes(day.entries)
  const layout = layoutDay(
    day.entries
      .filter((e) => e.kind === 'activity')
      .map((e) => ({ ...e, wide: e.segments.length > 0 })),
  )
  const columnWidths = Array.from({ length: layout.ribbonColumns }, (_, c) =>
    Math.max(
      RIBBON_WIDTH,
      ...layout.ribbons
        .filter((r) => r.column === c)
        .map((r) => ribbonWidth(r.item)),
    ),
  )
  return { washes, layout, columnWidths }
}

export function DayTimeline({ day }: { day: Day }) {
  const [open, setOpen] = useState<Entry | null>(null)
  const dayStart = Math.floor(Math.min(...day.entries.map((e) => e.start)) / 60)
  const dayEnd = Math.ceil(Math.max(...day.entries.map((e) => e.end)) / 60)
  const y = (minutes: number) =>
    Math.round(((minutes - dayStart * 60) / 60) * PX_PER_HOUR)
  const height = y(dayEnd * 60) + 1

  const frames = day.entries.filter((e) => e.kind === 'frame')
  const { washes, layout, columnWidths } = useMemo(() => planDay(day), [day])
  const sumWidths = (from: number, to: number) =>
    columnWidths.slice(from, to).reduce((sum, w) => sum + w, 0)
  const ribbonsWidth = (columns: number) =>
    columns > 0
      ? sumWidths(0, columns) + (columns - 1) * RIBBON_GAP + RIBBON_MARGIN
      : 0

  const reserved = ({
    item,
    ribbonColumns,
  }: {
    item: Entry
    ribbonColumns: number
  }) =>
    ribbonsWidth(ribbonColumns) +
    (frames.some((frame) => overlaps(frame, item)) ? BAND_LABEL_WIDTH : 0)

  const hours = Array.from(
    { length: dayEnd - dayStart + 1 },
    (_, i) => dayStart + i,
  )
  const halfHours = hours.slice(0, -1).map((h) => h * 60 + 30)
  const rule = 'bg-border absolute right-0 h-px'

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
              // One extra pixel, like a block, so the bottom hairline sits on
              // the grid line rather than the row above it.
              height: y(entry.end) - y(entry.start) + 1,
            }}
          />
        ))}

        {hours.map((h) => (
          <div
            key={h}
            className="absolute inset-x-0"
            style={{ top: y(h * 60) }}
          >
            {/* The closing line gets no label: nothing starts there. */}
            {h < dayEnd && (
              <div
                className="text-ink-dim absolute left-0 text-right text-[13px] leading-4 font-bold tabular-nums"
                style={{ width: LABEL_WIDTH, top: LABEL_TOP }}
              >
                {formatMinutes(h * 60)}
              </div>
            )}
            <div className={rule} style={{ left: 0 }} />
          </div>
        ))}
        {halfHours.map((m) => (
          <div
            key={m}
            className={cn(rule, 'opacity-40')}
            style={{ left: 0, top: y(m) }}
          />
        ))}

        {layout.blocks.map(({ item, lane, lanes }) => {
          // Ribbons and a frame's label column come off the lane area first;
          // the rest is split evenly between the lanes running at once. A
          // block gives up as much as any block it runs beside, so lane
          // edges line up even when only one of them sits in a band.
          const taken =
            LANE_LEFT +
            Math.max(
              ...layout.blocks
                .filter((b) => overlaps(b.item, item))
                .map((b) => reserved(b)),
            ) +
            GUTTER * (lanes - 1)
          const laneWidth = `(100% - ${taken}px) / ${lanes}`
          return (
            <ScheduleBlock
              key={item._id}
              entry={item}
              wash={washes.get(item._id)}
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
            wash={washes.get(item._id)}
            y={y}
            onOpen={() => setOpen(item)}
            style={{
              right: sumWidths(0, column) + column * RIBBON_GAP,
              width: ribbonWidth(item),
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
      className="bg-frame-fill border-border absolute right-0 border-y"
      style={style}
    >
      <span className="text-ink-dim absolute top-[4px] right-[8px] text-[11px] leading-4 font-bold tracking-[0.08em] uppercase">
        {entry.title}
      </span>
    </div>
  )
}

const voted = (entry: Entry) => entry.myVote !== null

// Blocks and ribbons are buttons that open the detail sheet. Hover lifts
// them (firmer outline, soft shadow, pink title); on touch the chevron says
// "more" and the pressed state repeats the hover outline. Quieter than the
// voted highlight, which keeps its pink outline and title either way.
const blockClass = (entry: Entry) =>
  cn(
    'font-display text-foreground hover:text-primary absolute cursor-pointer overflow-hidden rounded-[4px] border text-left font-bold transition-[color,background-color,border-color,box-shadow] hover:shadow-[0_1px_2px_rgba(0,0,0,0.1)] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none active:shadow-none',
    voted(entry)
      ? 'border-vote-line text-primary hover:border-primary/70 active:border-primary/70'
      : 'border-input hover:border-muted-foreground active:border-muted-foreground',
    // An open slot ("?") is a promise, not an activity: a big question mark
    // on a soft wash, dashed.
    entry.open && 'text-muted-foreground bg-slot-fill border-dashed',
  )

// The "tap for more" mark in a block's corner.
const Chevron = ({ className }: { className?: string }) => (
  <ChevronRightIcon
    aria-hidden
    className={cn('absolute size-3 opacity-60', className)}
  />
)

const washStyle = (wash: number | undefined): React.CSSProperties =>
  wash === undefined ? {} : { backgroundColor: `var(--wash-${wash + 1})` }

function ScheduleBlock({
  entry,
  wash,
  onOpen,
  style,
}: {
  entry: Entry
  wash: number | undefined
  onOpen: () => void
  style: React.CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={entry.open ? 'Open slot' : undefined}
      className={cn(
        blockClass(entry),
        'flex items-start pl-2 pr-6 text-sm leading-4',
      )}
      style={{ ...style, ...washStyle(wash), paddingTop: TITLE_PAD }}
    >
      {entry.open ? (
        <span className="absolute inset-0 flex items-center justify-center text-[28px] leading-none">
          ?
        </span>
      ) : (
        entry.title
      )}
      <Chevron className="top-[9px] right-[5px]" />
    </button>
  )
}

function ScheduleRibbon({
  entry,
  wash,
  y,
  onOpen,
  style,
}: {
  entry: Entry
  wash: number | undefined
  y: (minutes: number) => number
  onOpen: () => void
  style: React.CSSProperties
}) {
  const wide = entry.segments.length > 0
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        blockClass(entry),
        'flex items-stretch text-[13px] whitespace-nowrap',
      )}
      style={{ ...style, ...washStyle(wash) }}
    >
      {wide && (
        // Sub-spans stacked to scale, split by hairlines that land on the
        // grid: the first is one pixel short of its span because the
        // ribbon's own top border takes that row, the rest carry their
        // divider as a top border.
        <span className="flex min-w-0 flex-1 flex-col border-r border-inherit">
          {entry.segments.map((segment, i) => (
            <span
              key={segment.label}
              className={cn(
                'block overflow-hidden px-[2px] text-center leading-4',
                i > 0 && 'border-t border-inherit',
                i === entry.segments.length - 1 && 'flex-1',
              )}
              style={{
                paddingTop: TITLE_PAD,
                height: y(segment.end) - y(segment.start) - (i === 0 ? 1 : 0),
              }}
            >
              {segment.label}
            </span>
          ))}
        </span>
      )}
      <span
        className="relative flex shrink-0 items-center pt-[10px] pb-[6px] leading-[22px] [writing-mode:vertical-rl]"
        style={{ width: wide ? RIBBON_TITLE_WIDTH : '100%' }}
      >
        {entry.title}
        <Chevron className="bottom-[5px] left-1/2 -ml-[6px]" />
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
