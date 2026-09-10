// Geometry for one day of the timeline: which column each block goes in and
// how wide it is. Pure, so it's unit-tested without React. Units are minutes
// (time) and fractions of the lane area (x, width); the component turns
// fractions into pixels.

export type Placed = {
  start: number
  end: number
  ribbon: boolean
}

export type Layout<T extends Placed> = {
  // Activity blocks: x and width are fractions of the lane area left after
  // `gutterColumns` ribbon columns are taken off the right. The gutter is
  // decided per overlap cluster, so blocks in one cluster always line up.
  blocks: Array<{ item: T; x: number; width: number; gutterColumns: number }>
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

// Connected components of the overlap graph over time, so a block is only
// squeezed by blocks it actually shares minutes with.
function clusters<T extends Placed>(items: Array<T>): Array<Array<T>> {
  const out: Array<{ items: Array<T>; end: number }> = []
  for (const item of items) {
    const last = out.at(-1)
    if (last && item.start < last.end) {
      last.items.push(item)
      last.end = Math.max(last.end, item.end)
    } else out.push({ items: [item], end: item.end })
  }
  return out.map((cluster) => cluster.items)
}

export function layoutDay<T extends Placed>(entries: Array<T>): Layout<T> {
  const byStart = [...entries].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  )
  const ribbonLanes = assignLanes(byStart.filter((entry) => entry.ribbon))
  const ribbonColumns = ribbonLanes.reduce(
    (max, { lane }) => Math.max(max, lane + 1),
    0,
  )
  const blocks: Layout<T>['blocks'] = []
  for (const cluster of clusters(byStart.filter((entry) => !entry.ribbon))) {
    const span = {
      start: Math.min(...cluster.map((item) => item.start)),
      end: Math.max(...cluster.map((item) => item.end)),
      ribbon: false,
    }
    // Every ribbon column alive during this cluster takes its width away.
    const gutterColumns = ribbonLanes
      .filter(({ item }) => overlaps(item, span))
      .reduce((max, { lane }) => Math.max(max, lane + 1), 0)
    const lanes = assignLanes(cluster)
    const laneCount = lanes.reduce(
      (max, { lane }) => Math.max(max, lane + 1),
      0,
    )
    const width = 1 / laneCount
    for (const { item, lane } of lanes)
      blocks.push({ item, x: lane * width, width, gutterColumns })
  }
  return {
    blocks,
    ribbons: ribbonLanes.map(({ item, lane }) => ({ item, column: lane })),
    ribbonColumns,
  }
}
