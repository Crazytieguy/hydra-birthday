import { describe, expect, test } from 'vitest'
import { assignWashes, layoutDay, overlaps } from './schedule-layout'

const at = (start: number, end: number, ribbon = false, name = '') => ({
  start,
  end,
  ribbon,
  name,
  title: name,
})
const open = (start: number, end: number) => ({ ...at(start, end), open: true })
const wide = (start: number, end: number, name: string) => ({
  ...at(start, end, true, name),
  wide: true,
})

describe('layoutDay', () => {
  test('non-overlapping blocks each get the full width', () => {
    const { blocks, ribbonColumns } = layoutDay([
      at(600, 660, false, 'a'),
      at(660, 720, false, 'b'),
    ])
    expect(ribbonColumns).toBe(0)
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['a', 0, 1, 1],
      ['b', 0, 1, 1],
    ])
  })

  test('overlapping blocks share the width evenly, longer first', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'short'),
      at(600, 720, false, 'long'),
    ])
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['long', 0, 1, 2],
      ['short', 1, 1, 2],
    ])
  })

  test('two simultaneous ribbons take two columns from overlapping blocks only', () => {
    // Saturday: Hot seat + PDT ribbons 14:00-18:30; Circling 14:00-15:30;
    // party blocks after 20:00 untouched. PDT has sub-spans, so it takes the
    // inner column (1) even though it is listed first; Hot seat sits on the
    // right edge (column 0).
    const { blocks, ribbons, ribbonColumns } = layoutDay([
      wide(840, 1110, 'pdt'),
      at(840, 1110, true, 'hot seat'),
      at(840, 930, false, 'circling'),
      at(1200, 1260, false, 'fusion'),
    ])
    expect(ribbonColumns).toBe(2)
    expect(ribbons.map((r) => [r.item.name, r.column])).toEqual([
      ['hot seat', 0],
      ['pdt', 1],
    ])
    const circling = blocks.find((b) => b.item.name === 'circling')!
    expect(circling).toMatchObject({ columns: 1, ribbonColumns: 2 })
    const fusion = blocks.find((b) => b.item.name === 'fusion')!
    expect(fusion).toMatchObject({ columns: 1, ribbonColumns: 0 })
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
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['levers', 0, 1, 2],
      ['yoga', 1, 1, 2],
      ['potluck', 1, 1, 2],
    ])
  })

  test('a block after an overlap chain gets the full width back', () => {
    const { blocks } = layoutDay([
      at(600, 660, false, 'a'),
      at(630, 700, false, 'c'),
      at(700, 760, false, 'b'),
    ])
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['a', 0, 1, 2],
      ['c', 1, 1, 2],
      ['b', 0, 1, 1],
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
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['jam', 0, 1, 3],
      ['levers', 1, 1, 3],
      ['', 2, 1, 3],
      ['hanabi', 0, 1, 2],
      ['', 1, 1, 2],
    ])
  })

  // Two blocks sharing a minute must not share a column, and a block alone
  // in its minutes covers every column of its run.
  const expectNoCollisions = (
    blocks: ReturnType<typeof layoutDay<ReturnType<typeof at>>>['blocks'],
  ) => {
    for (const a of blocks) {
      const alone = !blocks.some((b) => b !== a && overlaps(a.item, b.item))
      if (alone) expect(a.span).toBe(a.columns)
      for (const b of blocks) {
        if (a === b || !overlaps(a.item, b.item)) continue
        const apart =
          a.column + a.span <= b.column || b.column + b.span <= a.column
        expect(apart, `${a.item.name} and ${b.item.name} collide`).toBe(true)
      }
    }
  }

  test('staggered overlaps never collide', () => {
    // A 10:00-11:00, B 10:30-12:00, C and D 11:00-12:00: three columns for
    // the whole run. A used to take a half while B took a third, and the
    // two crossed.
    const { blocks } = layoutDay([
      at(600, 660, false, 'a'),
      at(630, 720, false, 'b'),
      at(660, 720, false, 'c'),
      at(660, 720, false, 'd'),
    ])
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['a', 0, 1, 3],
      ['b', 1, 1, 3],
      ['c', 0, 1, 3],
      ['d', 2, 1, 3],
    ])
    expectNoCollisions(blocks)
  })

  test('a block that only touches the next pair keeps the full width', () => {
    // Saturday: Circling A 14:00-15:30 alone, then Circling B beside Improv,
    // then Circling C beside Utopia. Touching end-to-start is not
    // overlapping, so each row is its own run.
    const { blocks } = layoutDay([
      at(840, 930, false, 'circling a'),
      at(930, 1020, false, 'circling b'),
      at(930, 1020, false, 'improv'),
      at(1020, 1110, false, 'circling c'),
      at(1020, 1110, false, 'utopia'),
    ])
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['circling a', 0, 1, 1],
      ['circling b', 0, 1, 2],
      ['improv', 1, 1, 2],
      ['circling c', 0, 1, 2],
      ['utopia', 1, 1, 2],
    ])
    expectNoCollisions(blocks)
  })

  test('a block widens into columns nothing it overlaps is using', () => {
    // Three blocks start at 10:00; two end at 10:30 and a fourth follows
    // them. It takes the second column and widens into the third, which is
    // free for its whole time; the long block stays in the first column.
    const { blocks } = layoutDay([
      at(600, 660, false, 'long'),
      at(600, 630, false, 'p'),
      at(600, 630, false, 'q'),
      at(630, 660, false, 'wide'),
    ])
    expect(
      blocks.map((b) => [b.item.name, b.column, b.span, b.columns]),
    ).toEqual([
      ['long', 0, 1, 3],
      ['p', 1, 1, 3],
      ['q', 2, 1, 3],
      ['wide', 1, 2, 3],
    ])
    expectNoCollisions(blocks)
  })
})

describe('assignWashes', () => {
  const e = (
    _id: string,
    title: string,
    start: number,
    end: number,
    extra: Partial<{ ribbon: boolean; open: boolean }> = {},
  ) => ({ _id, title, start, end, ribbon: false, ...extra })
  const wash = (entries: ReturnType<typeof e>[]) =>
    assignWashes(layoutDay(entries).blocks)

  test('blocks side by side differ', () => {
    const w = wash([
      e('a', 'Circling B', 930, 1020),
      e('b', 'Improv', 930, 1020),
    ])
    expect(w.get('a')).not.toBe(w.get('b'))
  })

  test('the two washes checkerboard down two columns', () => {
    const w = wash([
      e('l1', '12 Levers', 780, 900),
      e('r1', 'Jam', 780, 900),
      e('l2', 'Hanabi', 900, 1080),
      e('r2', 'Making art', 900, 1080),
    ])
    expect(w.get('l1')).toBe(0)
    expect(w.get('r1')).toBe(1)
    expect(w.get('l2')).toBe(1)
    expect(w.get('r2')).toBe(0)
  })

  test('a full-width block above two columns pushes both away from its wash when it can', () => {
    const w = wash([
      e('a', 'Circling A', 840, 930),
      e('b', 'Circling B', 930, 1020),
      e('i', 'Improv', 930, 1020),
    ])
    expect(w.get('a')).toBe(0)
    expect(w.get('b')).toBe(1)
    expect(w.get('i')).toBe(0)
  })

  test('stacked solo blocks alternate', () => {
    const w = wash([
      e('a', 'Osho', 600, 660),
      e('b', 'Karaoke', 660, 780),
      e('c', 'Librish', 780, 870),
    ])
    expect([w.get('a'), w.get('b'), w.get('c')]).toEqual([0, 1, 0])
  })

  test('ribbons and open slots get no wash', () => {
    const w = wash([
      e('r', 'Hot seat', 840, 1110, { ribbon: true }),
      e('q', '?', 600, 780, { open: true }),
      e('x', 'Yoga', 600, 630),
    ])
    expect(w.has('r')).toBe(false)
    expect(w.has('q')).toBe(false)
    expect(w.get('x')).toBe(0)
  })
})
