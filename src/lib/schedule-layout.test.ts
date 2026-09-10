import { describe, expect, test } from 'vitest'
import { layoutDay } from './schedule-layout'

const at = (start: number, end: number, ribbon = false, name = '') => ({
  start,
  end,
  ribbon,
  name,
})

describe('layoutDay', () => {
  test('non-overlapping blocks each get the full width', () => {
    const { blocks, ribbonColumns } = layoutDay([
      at(600, 660, false, 'a'),
      at(660, 720, false, 'b'),
    ])
    expect(ribbonColumns).toBe(0)
    expect(blocks.map((b) => [b.item.name, b.x, b.width])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  test('overlapping blocks share the width evenly, longer first', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'short'),
      at(600, 720, false, 'long'),
    ])
    expect(blocks.map((b) => [b.item.name, b.x, b.width])).toEqual([
      ['long', 0, 0.5],
      ['short', 0.5, 0.5],
    ])
  })

  test('two simultaneous ribbons take two columns from overlapping clusters only', () => {
    // Saturday: Hot seat + PDT ribbons 14:00-18:30; Circling 14:00-15:30;
    // party blocks after 20:00 untouched.
    const { blocks, ribbons, ribbonColumns } = layoutDay([
      at(840, 1110, true, 'hot seat'),
      at(840, 1110, true, 'pdt'),
      at(840, 930, false, 'circling'),
      at(1200, 1260, false, 'fusion'),
    ])
    expect(ribbonColumns).toBe(2)
    expect(ribbons.map((r) => [r.item.name, r.column])).toEqual([
      ['hot seat', 0],
      ['pdt', 1],
    ])
    const circling = blocks.find((b) => b.item.name === 'circling')!
    expect(circling).toMatchObject({ width: 1, gutterColumns: 2 })
    const fusion = blocks.find((b) => b.item.name === 'fusion')!
    expect(fusion).toMatchObject({ width: 1, gutterColumns: 0 })
  })

  test('a block in the gutter of a ribbon it does not overlap still lines up with its cluster', () => {
    const { blocks } = layoutDay([
      at(840, 900, true, 'ribbon'),
      at(840, 930, false, 'a'),
      at(920, 960, false, 'b'),
    ])
    expect(blocks.map((b) => b.gutterColumns)).toEqual([1, 1])
  })

  test('overlap chains through a middle block into one cluster', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'a'),
      at(660, 720, false, 'b'),
      at(630, 700, false, 'c'),
    ])
    // a and c overlap; b overlaps c, so all three chain into one cluster of
    // two lanes.
    expect(blocks.every((b) => b.width === 0.5)).toBe(true)
  })
})
