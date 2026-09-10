#!/usr/bin/env bun
// Push the organizers' board onto the guest schedule.
//
//   bun run schedule:sync <placements.json> [--prod] [--dry-run] [--strict]
//                         [--manifest prod-partysessions.json] [--acts board-data.json]
//
// <placements.json> is the board's saved state ({placements: [...]}, e.g.
// scratch/db/board/current.json). Board activities are prod partySession ids;
// each is resolved on the target deployment by id, else by catalogKey through
// --manifest (a `convex data partySessions --prod` dump), else by a unique
// title (manifest or --acts, the board's data file). Anything unresolved is
// written title-only with a warning; --strict makes warnings fatal. The
// guest-facing renames, ribbons, merges and extras live in
// data/schedule-overrides.ts. Replaces the whole schedule in one transaction.
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { formatMinutes, hoursToMinutes } from '../convex/lib/schedule'
import {
  dayDates,
  extras,
  frameLabels,
  placementOverrides,
  titleRenames,
} from '../data/schedule-overrides'
import { convexRunJson } from './config'

const USAGE = `usage: bun run schedule:sync <placements.json> [--prod] [--dry-run] [--strict] [--manifest <path>] [--acts <path>]
  --prod            write to the production deployment (default: your dev deployment)
  --dry-run         print the entries that would be written, write nothing
  --strict          exit non-zero on any warning (use for prod)
  --manifest <path> source deployment's partySessions dump, for id → catalogKey/title
                    (default: scratch/prod-partysessions.json)
  --acts <path>     the board's data file, for id → title of activities not in the
                    manifest (default: scratch/board-data.json)`

let parsed: ReturnType<typeof parseArgs<typeof spec>>
const spec = {
  options: {
    prod: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    strict: { type: 'boolean', default: false },
    manifest: { type: 'string', default: 'scratch/prod-partysessions.json' },
    acts: { type: 'string', default: 'scratch/board-data.json' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: true,
} as const
try {
  parsed = parseArgs(spec)
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
  )
  process.exit(2)
}
const { values: flags, positionals } = parsed
if (flags.help || positionals.length !== 1) {
  console.log(USAGE)
  process.exit(flags.help ? 0 : 2)
}

type Placement = {
  id: string
  act: string
  day: string
  start: number
  len: number
}
type Entry = {
  day: string
  start: number
  end: number
  kind: 'activity' | 'frame'
  partySessionId?: string
  title?: string
  frameLabel?: string
  ribbon?: boolean
  note?: string
}

const board = JSON.parse(readFileSync(positionals[0], 'utf8')) as {
  placements: Array<Placement>
}
type SourceRow = { _id: string; catalogKey?: string | null; title: string }
const manifest = JSON.parse(
  readFileSync(flags.manifest, 'utf8'),
) as Array<SourceRow>
const acts = JSON.parse(readFileSync(flags.acts, 'utf8')) as {
  acts: Array<{ id: string; t: string }>
}
const source = new Map<string, SourceRow>()
for (const act of acts.acts) source.set(act.id, { _id: act.id, title: act.t })
for (const row of manifest) source.set(row._id, row)

const target = convexRunJson(
  'schedule:listForSync',
  undefined,
  flags.prod,
) as Array<{ _id: string; catalogKey: string | null; title: string }>
const targetById = new Map(target.map((row) => [row._id, row]))
const only = <T>(rows: Array<T>) => (rows.length === 1 ? rows[0] : undefined)

// Board id → target row: same deployment, else the catalog key, else a title
// nobody else shares. Returns the source title too, for the snapshot.
function resolve(boardId: string) {
  const src = source.get(boardId)
  const direct = targetById.get(boardId)
  if (direct) return { row: direct, title: src?.title ?? direct.title }
  if (!src) return null
  const byKey = src.catalogKey
    ? only(target.filter((row) => row.catalogKey === src.catalogKey))
    : undefined
  const byTitle = only(target.filter((row) => row.title === src.title))
  return { row: byKey ?? byTitle, title: src.title }
}

const warnings: Array<string> = []
const entries: Array<Entry> = []

for (const placement of board.placements) {
  const day = dayDates[placement.day]
  if (!day) {
    warnings.push(
      `skipped placement ${placement.id}: unknown day ${placement.day}`,
    )
    continue
  }
  const override = placementOverrides[placement.id] ?? {}
  if (override.drop) continue
  const startHours = override.start ?? placement.start
  const lenHours = override.len ?? placement.len
  const time = {
    day,
    start: hoursToMinutes(startHours),
    end: hoursToMinutes(startHours + lenHours),
  }
  if (placement.act.startsWith('frame:')) {
    const frameLabel = frameLabels[placement.act]
    if (!frameLabel) {
      warnings.push(`skipped ${placement.act}: no label in schedule-overrides`)
      continue
    }
    entries.push({ ...time, kind: 'frame', frameLabel })
    continue
  }
  const resolved = resolve(placement.act)
  if (!resolved) {
    warnings.push(
      `skipped placement ${placement.id}: activity ${placement.act} is in neither the manifest nor --acts`,
    )
    continue
  }
  const { row, title } = resolved
  if (!row)
    warnings.push(
      `"${title}" has no unique match on the target; written title-only`,
    )
  entries.push({
    ...time,
    kind: 'activity',
    partySessionId: row?._id,
    title: override.title ?? titleRenames[title] ?? title,
    ribbon: override.ribbon || undefined,
    note: override.note,
  })
}

for (const extra of extras) {
  const day = dayDates[extra.day]
  if (!day) throw new Error(`extra with unknown day ${extra.day}`)
  const time = {
    day,
    start: hoursToMinutes(extra.start),
    end: hoursToMinutes(extra.start + extra.len),
  }
  entries.push(
    extra.kind === 'frame'
      ? { ...time, kind: 'frame', frameLabel: extra.frameLabel }
      : { ...time, kind: 'activity', title: extra.title, note: extra.note },
  )
}

entries.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start)

for (const warning of warnings) console.error(`warning: ${warning}`)
for (const entry of entries) {
  const label =
    entry.kind === 'frame'
      ? `[${entry.frameLabel}]`
      : `${entry.title}${entry.partySessionId ? '' : ' (title only)'}${entry.ribbon ? ' (ribbon)' : ''}`
  console.error(
    `${entry.day} ${formatMinutes(entry.start)}-${formatMinutes(entry.end)}  ${label}`,
  )
}
if (flags.strict && warnings.length > 0) {
  console.error(`${warnings.length} warning(s) with --strict; nothing written`)
  process.exit(1)
}

if (flags['dry-run']) {
  console.log(JSON.stringify(entries, null, 2))
  process.exit(0)
}
const result = convexRunJson('schedule:replaceAll', { entries }, flags.prod)
console.error(JSON.stringify(result))
