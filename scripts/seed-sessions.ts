#!/usr/bin/env bun
// Seed the session catalog (data/catalog.ts) into a deployment.
//
//   bun run seed [--prod] [--dry-run] [--base <url>]
//
// Create-only: sessions already seeded are skipped, so rerunning is safe.
// Facilitators without accounts get one plus an invite link, printed as
// "name<TAB>url" like `bun run invite`. Always --dry-run first on prod.
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { invitePath } from '../src/lib/invites'
import { siteOrigin } from './config'

const USAGE = `usage: bun run seed [--prod] [--dry-run] [--base <url>]
  --prod        seed the production deployment (default: your dev deployment)
  --dry-run     print what a seed would do without writing anything
  --base <url>  site origin for printed facilitator links`

let parsed: ReturnType<typeof parseArgs<typeof spec>>
const spec = {
  options: {
    prod: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    base: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
} as const
try {
  parsed = parseArgs(spec)
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : String(error)}\n${USAGE}`,
  )
  process.exit(2)
}
const { values: flags } = parsed
if (flags.help) {
  console.log(USAGE)
  process.exit(0)
}

function convexRun(fn: string) {
  const args = ['convex', 'run', fn]
  if (flags.prod) args.push('--prod')
  const result = spawnSync('bunx', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
  return JSON.parse(result.stdout) as unknown
}

if (flags['dry-run']) {
  const report = convexRun('catalog:seedPreflight') as {
    wouldCreateSessions: Array<string>
    wouldCreateFacilitators: Array<string>
    ambiguousFacilitators: Array<string>
    alreadySeeded: number
  }
  console.log(`already seeded: ${report.alreadySeeded}`)
  console.log(`would create ${report.wouldCreateSessions.length} sessions:`)
  for (const title of report.wouldCreateSessions) console.log(`  ${title}`)
  console.log(
    `would create ${report.wouldCreateFacilitators.length} facilitator accounts (with invite links):`,
  )
  for (const name of report.wouldCreateFacilitators) console.log(`  ${name}`)
  if (report.ambiguousFacilitators.length > 0) {
    console.error(
      `AMBIGUOUS facilitator names (several users match; a real seed will refuse):`,
    )
    for (const name of report.ambiguousFacilitators) console.error(`  ${name}`)
    process.exit(1)
  }
} else {
  const result = convexRun('catalog:seed') as {
    createdSessions: Array<string>
    alreadySeeded: number
    newFacilitatorLinks: Array<{ label: string; token: string }>
  }
  const origin = (flags.base ?? siteOrigin(flags.prod)).replace(/\/$/, '')
  console.log(
    `created ${result.createdSessions.length} sessions (${result.alreadySeeded} already seeded)`,
  )
  if (result.newFacilitatorLinks.length > 0) {
    console.log('new facilitator invite links (printed only once):')
    for (const { label, token } of result.newFacilitatorLinks)
      console.log(`${label}\t${origin}${invitePath(token)}`)
  }
}
