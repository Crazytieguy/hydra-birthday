// Geometry for one day of the timeline: which lane each block goes in and
// how many lanes it shares its width with. Pure, so it's unit-tested without
// React. Units are minutes; the component turns lanes into pixels.

export type Placed = {
  start: number
  end: number
  ribbon: boolean
  // An open slot ("?"): placed after the real activities it starts with, so
  // it takes the rightmost lane.
  open?: boolean
  // A ribbon with labelled sub-spans beside its title: placed after the plain
  // ribbons it starts with, so it takes the inner column, next to the lanes.
  wide?: boolean
}

export type Layout<T extends Placed> = {
  // Activity blocks. A block is 1/`lanes` of the lane area, where `lanes` is
  // the most lane blocks running at once during its own span, so a block
  // only narrows for blocks it actually shares minutes with.
  // `ribbonColumns` is how many ribbon columns (counted from the right) are
  // alive during the block and must be subtracted from the lane area first.
  blocks: Array<{ item: T; lane: number; lanes: number; ribbonColumns: number }>
  // Ribbons, each in its own column counted from the right: column 0 sits on
  // the day's right edge.
  ribbons: Array<{ item: T; column: number }>
  ribbonColumns: number
}

const overlaps = (a: Placed, b: Placed) => a.start < b.end && b.start < a.end

// Greedy first-fit lanes: items sorted by start, each takes the first lane
// whose last item ended by the time this one starts.
function assignLanes<T extends Placed>(items: Array<T>) {
  const laneEnds: Array<number> = []
  return items.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) lane = laneEnds.push(item.end) - 1
    laneEnds[lane] = item.end
    return { item, lane }
  })
}

const columnCount = (placed: Array<{ lane: number }>) =>
  placed.reduce((max, { lane }) => Math.max(max, lane + 1), 0)

export function layoutDay<T extends Placed>(entries: Array<T>): Layout<T> {
  const byStart = [...entries].sort(
    (a, b) =>
      a.start - b.start ||
      Number(a.open === true) - Number(b.open === true) ||
      Number(a.wide === true) - Number(b.wide === true) ||
      b.end - b.start - (a.end - a.start),
  )
  const ribbonLanes = assignLanes(byStart.filter((entry) => entry.ribbon))
  const laneBlocks = byStart.filter((entry) => !entry.ribbon)
  const blocks = assignLanes(laneBlocks).map(({ item, lane }) => {
    // Concurrency only changes where some block starts, so those instants
    // (plus the block's own start) are the only ones worth counting.
    const lanes = laneBlocks
      .filter((other) => overlaps(item, other))
      .map((other) => Math.max(other.start, item.start))
      .reduce(
        (max, t) =>
          Math.max(
            max,
            laneBlocks.filter((other) => other.start <= t && t < other.end)
              .length,
          ),
        1,
      )
    const ribbonColumns = columnCount(
      ribbonLanes.filter((ribbon) => overlaps(ribbon.item, item)),
    )
    return { item, lane, lanes, ribbonColumns }
  })
  return {
    blocks,
    ribbons: ribbonLanes.map(({ item, lane }) => ({ item, column: lane })),
    ribbonColumns: columnCount(ribbonLanes),
  }
}

// One soft wash per activity so the day reads as many things, not one thing.
// Assigned in start order: a block takes the first wash no overlapping or
// touching neighbour already has, and a repeated title (Circling A/B/C) keeps
// its wash. The static schedule images run the same rule, so they match.
export const WASH_COUNT = 6

export type Washable = {
  _id: string
  title: string
  start: number
  end: number
  kind: string
  open?: boolean
}

const baseTitle = (title: string) => title.replace(/\s[ABC]$/, '')

export function assignWashes(entries: Array<Washable>): Map<string, number> {
  const items = entries
    .filter((e) => e.kind === 'activity' && !e.open)
    .sort(
      (a, b) =>
        a.start - b.start || a.end - b.end || a.title.localeCompare(b.title),
    )
  const byTitle = new Map<string, number>()
  const out = new Map<string, number>()
  for (const item of items) {
    const base = baseTitle(item.title)
    const known = byTitle.get(base)
    if (known !== undefined) {
      out.set(item._id, known)
      continue
    }
    const taken = new Set(
      items
        .filter(
          (o) => out.has(o._id) && o.start <= item.end && item.start <= o.end,
        )
        .map((o) => out.get(o._id)),
    )
    let pick = Array.from({ length: WASH_COUNT }, (_, i) => i).find(
      (i) => !taken.has(i),
    )
    if (pick === undefined) pick = byTitle.size % WASH_COUNT
    byTitle.set(base, pick)
    out.set(item._id, pick)
  }
  return out
}
