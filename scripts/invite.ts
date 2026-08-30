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

const USAGE = `usage: bun run invite [--prod] [--admin] [--base <url>] [--file names.txt] [name ...]
  --prod        mint on the production deployment (default: your dev deployment)
  --admin       the accounts created from these links are admins
  --base <url>  site origin for the printed links (default: APP_URL, else
                https://hydra-birthday.code-bloom.app with --prod, http://localhost:3000 otherwise)
  --file <path> read names from a file, one per line (stdin is read when no names are given)`

const argv = process.argv.slice(2)
let prod = false
let admin = false
let base = ''
let file = ''
const names: string[] = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--prod') prod = true
  else if (arg === '--admin') admin = true
  else if (arg === '--base') base = argv[++i] ?? ''
  else if (arg === '--file') file = argv[++i] ?? ''
  else if (arg === '--help' || arg === '-h') {
    console.log(USAGE)
    process.exit(0)
  } else if (arg.startsWith('-')) {
    console.error(`unknown option ${arg}\n${USAGE}`)
    process.exit(2)
  } else names.push(arg)
}
if (file) names.push(...readFileSync(file, 'utf8').split('\n'))
if (names.length === 0 && !process.stdin.isTTY)
  names.push(...readFileSync(0, 'utf8').split('\n'))
const labels = names.map((name) => name.trim()).filter(Boolean)
if (labels.length === 0) {
  console.error(USAGE)
  process.exit(2)
}

const origin = (
  base ||
  process.env.APP_URL ||
  (prod ? 'https://hydra-birthday.code-bloom.app' : 'http://localhost:3000')
).replace(/\/$/, '')

const args = [
  'convex',
  'run',
  'invites:createInternal',
  JSON.stringify({ labels, grantsAdmin: admin || undefined }),
]
if (prod) args.push('--prod')
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
  console.log(`${label}\t${origin}/invite/${token}`)
