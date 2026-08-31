#!/usr/bin/env bun
// Seed the session catalog (data/catalog.ts) into a deployment.
//
//   bun run seed [--prod] [--dry-run] [--base <url>]
//
// Create-only: sessions already seeded are skipped, so rerunning is safe.
// Facilitators without accounts get one plus an invite link, printed as
// "name<TAB>url" like `bun run invite`. Always --dry-run first on prod.
import { parseArgs } from 'node:util'
import { convexRunJson, printInviteLinks, siteOrigin } from './config'

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

if (flags['dry-run']) {
  const report = convexRunJson(
    'catalog:seedPreflight',
    undefined,
    flags.prod,
  ) as {
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
  const result = convexRunJson('catalog:seed', undefined, flags.prod) as {
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
    printInviteLinks(result.newFacilitatorLinks, origin)
  }
}
