// Geometry for one day of the timeline: which lane each block goes in and
// how many lanes it shares its width with. Pure, so it's unit-tested without
// React. Units are minutes; the component turns lanes into pixels.

export type Placed = {
  start: number
  end: number
  ribbon: boolean
}

export type Layout<T extends Placed> = {
  // Activity blocks. A block is 1/`lanes` of the lane area, where `lanes` is
  // the most lane blocks running at once during its own span, so a block
  // only narrows for blocks it actually shares minutes with.
  // `ribbonColumns` is how many ribbon columns (counted from the right) are
  // alive during the block and must be subtracted from the lane area first.
  blocks: Array<{ item: T; lane: number; lanes: number; ribbonColumns: number }>
  // Ribbons, each in its own column counted from the right.
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
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
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
