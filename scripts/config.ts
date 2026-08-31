import { spawnSync } from 'node:child_process'
import { invitePath } from '../src/lib/invites'
// Where this app lives. The wizard provisions against these; the invite
// script prints links for them.
export const PROJECT = 'hydra-birthday'
export const GITHUB_REPO = 'Crazytieguy/hydra-birthday'
export const VERCEL_SCOPE = 'crazytieguys-projects'
export const APEX = 'code-bloom.app'
export const DOMAIN = `${PROJECT}.${APEX}`
export const CONVEX_TEAM_ID = 131507
// Also hardcoded in package.json's `dev` script.
export const DEV_PORT = 3000

export const siteOrigin = (prod: boolean) =>
  prod ? `https://${DOMAIN}` : `http://localhost:${DEV_PORT}`

// Run a Convex function via `bunx convex run` and parse its JSON result.
// (`convex run` prints the return value as JSON when stdout is not a TTY.)
export function convexRunJson(
  fn: string,
  args?: unknown,
  prod?: boolean,
): unknown {
  const cmd = ['convex', 'run', fn]
  if (args !== undefined) cmd.push(JSON.stringify(args))
  if (prod) cmd.push('--prod')
  const result = spawnSync('bunx', cmd, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
  return JSON.parse(result.stdout) as unknown
}

// One "name<TAB>url" line per minted invite — ready for a spreadsheet.
export function printInviteLinks(
  minted: Array<{ label: string; token: string }>,
  origin: string,
) {
  for (const { label, token } of minted)
    console.log(`${label}\t${origin}${invitePath(token)}`)
}
