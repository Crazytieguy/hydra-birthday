// Geometry for one day of the timeline: which column each block starts in
// and how many it covers. Pure, so it's unit-tested without React. Units are
// minutes; the component turns columns into pixels.

export type Placed = {
  start: number
  end: number
  ribbon: boolean
  // An open slot ("?"): placed after the real activities it starts with, so
  // it takes the rightmost column.
  open?: boolean
  // A ribbon with labelled sub-spans beside its title: placed after the plain
  // ribbons it starts with, so it takes the inner column, next to the blocks.
  wide?: boolean
}

export type Layout<T extends Placed> = {
  // Activity blocks. A block's run (the blocks it overlaps, directly or
  // through others) splits the lane area into `columns` equal columns; the
  // block starts at `column` and covers `span` of them, having grown
  // rightward into every column free for its whole time. So a block alone
  // in its minutes spans the full width, and two blocks sharing a minute
  // never share a column.
  // `ribbonColumns` is how many ribbon columns (counted from the right) are
  // alive during the block and must be subtracted from the lane area first.
  blocks: Array<{
    item: T
    column: number
    span: number
    columns: number
    ribbonColumns: number
  }>
  // Ribbons, each in its own column counted from the right: column 0 sits on
  // the day's right edge.
  ribbons: Array<{ item: T; column: number }>
  ribbonColumns: number
}

type Span = { start: number; end: number }

export const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

// Greedy first-fit columns: items sorted by start, each takes the first
// column whose last item ended by the time this one starts.
function assignColumns<T extends Placed>(items: Array<T>) {
  const columnEnds: Array<number> = []
  return items.map((item) => {
    let column = columnEnds.findIndex((end) => end <= item.start)
    if (column === -1) column = columnEnds.push(item.end) - 1
    columnEnds[column] = item.end
    return { item, column }
  })
}

const columnCount = (placed: Array<{ column: number }>) =>
  placed.reduce((max, { column }) => Math.max(max, column + 1), 0)

// Runs of blocks that overlap, directly or through others. Items are sorted
// by start, so a run ends at the first block starting after every end so far.
function overlapRuns<T extends Placed>(items: Array<T>): Array<Array<T>> {
  const runs: Array<Array<T>> = []
  let runEnd = -Infinity
  for (const item of items) {
    if (item.start >= runEnd) runs.push([])
    runs[runs.length - 1].push(item)
    runEnd = Math.max(runEnd, item.end)
  }
  return runs
}

// The calendar algorithm: columns within a run, then each block widens into
// the columns to its right until one holds a block it shares a minute with.
function layoutRun<T extends Placed>(run: Array<T>) {
  const placed = assignColumns(run)
  const columns = columnCount(placed)
  return placed.map(({ item, column }) => {
    let span = 1
    while (
      column + span < columns &&
      !placed.some(
        (other) => other.column === column + span && overlaps(other.item, item),
      )
    )
      span++
    return { item, column, span, columns }
  })
}

export function layoutDay<T extends Placed>(entries: Array<T>): Layout<T> {
  const byStart = [...entries].sort(
    (a, b) =>
      a.start - b.start ||
      Number(a.open === true) - Number(b.open === true) ||
      Number(a.wide === true) - Number(b.wide === true) ||
      b.end - b.start - (a.end - a.start),
  )
  const ribbonColumns = assignColumns(byStart.filter((entry) => entry.ribbon))
  const blocks = overlapRuns(byStart.filter((entry) => !entry.ribbon))
    .flatMap(layoutRun)
    .map((block) => ({
      ...block,
      ribbonColumns: columnCount(
        ribbonColumns.filter((ribbon) => overlaps(ribbon.item, block.item)),
      ),
    }))
  return {
    blocks,
    ribbons: ribbonColumns,
    ribbonColumns: columnCount(ribbonColumns),
  }
}

// Two soft washes so the day reads as many things, not one thing. Assigned
// in start order, two tiers: blocks running side by side must differ (hard),
// and a block should differ from the one it touches end-to-start when it
// can (soft). A block takes the first wash clear of both, else the first
// clear of its neighbours beside it, else they alternate. Repeats of one
// activity (Circling A/B/C share a partySession) keep its wash. Ribbons,
// open slots and frames get none: thin verticals side by side would read as
// stripes. The static schedule images run the same rule, so they match.
export const WASH_COUNT = 2

export type Washable = {
  _id: string
  partySessionId: string | null
  title: string
  start: number
  end: number
  kind: string
  ribbon?: boolean
  open?: boolean
}

export function assignWashes(entries: Array<Washable>): Map<string, number> {
  const items = entries
    .filter((e) => e.kind === 'activity' && !e.open && !e.ribbon)
    .sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.title.localeCompare(b.title) ||
        a._id.localeCompare(b._id),
    )
  const byActivity = new Map<string, number>()
  const out = new Map<string, number>()
  const washes = Array.from({ length: WASH_COUNT }, (_, i) => i)
  for (const item of items) {
    const activity = item.partySessionId ?? item._id
    const known = byActivity.get(activity)
    if (known !== undefined) {
      out.set(item._id, known)
      continue
    }
    const placed = items.filter((o) => out.has(o._id))
    const washesOf = (neighbours: Array<Washable>) =>
      new Set(neighbours.map((o) => out.get(o._id)))
    const hard = washesOf(placed.filter((o) => overlaps(o, item)))
    const soft = washesOf(
      placed.filter((o) => o.end === item.start || item.end === o.start),
    )
    const pick =
      washes.find((i) => !hard.has(i) && !soft.has(i)) ??
      washes.find((i) => !hard.has(i)) ??
      byActivity.size % WASH_COUNT
    byActivity.set(activity, pick)
    out.set(item._id, pick)
  }
  return out
}
