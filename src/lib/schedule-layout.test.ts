import { describe, expect, test } from 'vitest'
import { layoutDay } from './schedule-layout'

const at = (start: number, end: number, ribbon = false, name = '') => ({
  start,
  end,
  ribbon,
  name,
})
const open = (start: number, end: number) => ({ ...at(start, end), open: true })

describe('layoutDay', () => {
  test('non-overlapping blocks each get the full width', () => {
    const { blocks, ribbonColumns } = layoutDay([
      at(600, 660, false, 'a'),
      at(660, 720, false, 'b'),
    ])
    expect(ribbonColumns).toBe(0)
    expect(blocks.map((b) => [b.item.name, b.lane, b.lanes])).toEqual([
      ['a', 0, 1],
      ['b', 0, 1],
    ])
  })

  test('overlapping blocks share the width evenly, longer first', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'short'),
      at(600, 720, false, 'long'),
    ])
    expect(blocks.map((b) => [b.item.name, b.lane, b.lanes])).toEqual([
      ['long', 0, 2],
      ['short', 1, 2],
    ])
  })

  test('two simultaneous ribbons take two columns from overlapping blocks only', () => {
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
    expect(circling).toMatchObject({ lanes: 1, ribbonColumns: 2 })
    const fusion = blocks.find((b) => b.item.name === 'fusion')!
    expect(fusion).toMatchObject({ lanes: 1, ribbonColumns: 0 })
  })

  test('a block only narrows for the blocks it shares minutes with', () => {
    // Sunday: 12 Levers 10:00-12:00 with Yoga 11:00-11:30 inside it, then
    // Media potluck 11:30-13:00. Levers is squeezed by both; Yoga and the
    // potluck never meet, so each is half width, not a third.
    const { blocks } = layoutDay([
      at(600, 720, false, 'levers'),
      at(660, 690, false, 'yoga'),
      at(690, 780, false, 'potluck'),
    ])
    expect(blocks.map((b) => [b.item.name, b.lane, b.lanes])).toEqual([
      ['levers', 0, 2],
      ['yoga', 1, 2],
      ['potluck', 1, 2],
    ])
  })

  test('a block after an overlap chain gets the full width back', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'a'),
      at(630, 700, false, 'c'),
      at(700, 760, false, 'b'),
    ])
    expect(blocks.map((b) => [b.item.name, b.lane, b.lanes])).toEqual([
      ['a', 0, 2],
      ['c', 1, 2],
      ['b', 0, 1],
    ])
  })

  test('an open slot takes the last lane of the activities it shares a slot with', () => {
    // Sunday: "?" 13:00-15:00 sorts before "REAL Jam Session" by title and
    // starts with Levers, but must never sit left of a real activity.
    const { blocks } = layoutDay([
      open(780, 900),
      at(780, 900, false, 'levers'),
      at(780, 900, false, 'jam'),
      open(900, 1080),
      at(900, 1080, false, 'hanabi'),
    ])
    expect(blocks.map((b) => [b.item.name, b.lane, b.lanes])).toEqual([
      ['levers', 0, 3],
      ['jam', 1, 3],
      ['', 2, 3],
      ['hanabi', 0, 2],
      ['', 1, 2],
    ])
  })
})
