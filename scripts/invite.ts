#!/usr/bin/env bun
// Mint one-time invite links.
//
//   bun run invite [--prod] [--admin] [--base <url>] [--file names.txt] [name ...]
//
// Names come from arguments, --file (one per line), or stdin. Prints one
// "name<TAB>url" line per invite, ready to paste into a spreadsheet or a
// message. Links are only ever printed once — they are stored hashed.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { invitePath } from '../src/lib/invites'
import { siteOrigin } from './config'

const USAGE = `usage: bun run invite [--prod] [--admin] [--base <url>] [--file names.txt] [name ...]
  --prod        mint on the production deployment (default: your dev deployment)
  --admin       the accounts created from these links are admins
  --base <url>  site origin for the printed links (default: ${siteOrigin(true)} with --prod,
                ${siteOrigin(false)} otherwise)
  --file <path> read names from a file, one per line (stdin is read when no names are given)`

let parsed: ReturnType<typeof parseArgs<typeof spec>>
const spec = {
  options: {
    prod: { type: 'boolean', default: false },
    admin: { type: 'boolean', default: false },
    base: { type: 'string' },
    file: { type: 'string' },
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
const { values: flags, positionals: names } = parsed
if (flags.help) {
  console.log(USAGE)
  process.exit(0)
}
if (flags.file) names.push(...readFileSync(flags.file, 'utf8').split('\n'))
if (names.length === 0 && !process.stdin.isTTY)
  names.push(...readFileSync(0, 'utf8').split('\n'))
const labels = names.map((name) => name.trim()).filter(Boolean)
if (labels.length === 0) {
  console.error(USAGE)
  process.exit(2)
}

const origin = (flags.base ?? siteOrigin(flags.prod)).replace(/\/$/, '')
const args = [
  'convex',
  'run',
  'invites:createInternal',
  JSON.stringify({ labels, grantsAdmin: flags.admin }),
]
if (flags.prod) args.push('--prod')
// `convex run` prints its return value as JSON when stdout is not a TTY.
const result = spawnSync('bunx', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
if (result.status !== 0) process.exit(result.status ?? 1)
const minted = JSON.parse(result.stdout) as Array<{
  label: string
  token: string
}>
for (const { label, token } of minted)
  console.log(`${label}\t${origin}${invitePath(token)}`)
