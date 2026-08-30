#!/usr/bin/env bun
// Setup wizard: checks the whole deploy chain (GitHub → Vercel → Convex → DNS)
// and fixes whatever it can without a click. The only truly manual step is the
// Namecheap CNAME; for that it opens the page, shows the exact record, and
// waits for DNS to catch up. Safe to re-run at any time.
//
//   bun run wizard
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  APEX,
  CONVEX_TEAM_ID,
  DOMAIN,
  GITHUB_REPO,
  PROJECT,
  VERCEL_SCOPE,
} from './config'

const NAMECHEAP_DNS_URL = `https://ap.www.namecheap.com/Domains/DomainControlPanel/${APEX}/advancedns`

const ok = (msg: string) => console.log(`  ✔ ${msg}`)
const did = (msg: string) => console.log(`  → ${msg}`)
const bad = (msg: string) => console.log(`  ✘ ${msg}`)
const step = (title: string) => console.log(`\n${title}`)

function run(cmd: string, args: string[], input?: string) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  })
  return {
    code: result.status ?? 1,
    out: result.stdout.trim(),
    err: result.stderr.trim(),
  }
}
const sh = (cmd: string, args: string[]) => run(cmd, args).out
function must(cmd: string, args: string[], input?: string) {
  const result = run(cmd, args, input)
  if (result.code !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed:\n${result.err || result.out}`,
    )
  }
  return result.out
}
// A check that cannot be evaluated is an error, never a "missing" result —
// otherwise a flaky call would trigger the fix step on every run.
function vercelApi<T>(path: string): T {
  return JSON.parse(must('vercel', ['api', path, '--scope', VERCEL_SCOPE])) as T
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const open = (url: string) => run('open', [url])
const stripDot = (host: string) => host.replace(/\.$/, '')

async function main() {
  console.log(`${PROJECT} setup wizard`)

  step('Tools')
  for (const [cmd, args] of [
    ['gh', ['auth', 'status']],
    ['vercel', ['whoami']],
    ['bunx', ['convex', 'login', 'status']],
  ] as const) {
    if (run(cmd, [...args]).code !== 0) {
      throw new Error(`\`${cmd} ${args.join(' ')}\` failed — log in first.`)
    }
  }
  ok('gh, vercel and convex are logged in')

  step('GitHub')
  if (run('git', ['remote', 'get-url', 'origin']).code !== 0) {
    must('gh', [
      'repo',
      'create',
      GITHUB_REPO,
      '--public',
      '--source=.',
      '--remote=origin',
      '--push',
    ])
    did(`created and pushed https://github.com/${GITHUB_REPO}`)
  } else {
    ok(`origin → ${sh('git', ['remote', 'get-url', 'origin'])}`)
  }

  step('Vercel project')
  if (!existsSync('.vercel/project.json')) {
    must('vercel', [
      'link',
      '--yes',
      '--project',
      PROJECT,
      '--scope',
      VERCEL_SCOPE,
    ])
    did(`linked ${PROJECT}`)
  }
  const projectJson = JSON.parse(
    readFileSync('.vercel/project.json', 'utf8'),
  ) as {
    projectId: string
  }
  type Project = { id: string; link?: { repo?: string; org?: string } | null }
  const project = vercelApi<Project>(`/v9/projects/${projectJson.projectId}`)
  ok(`project ${PROJECT} (${project.id})`)
  if (!project.link?.repo) {
    must('vercel', [
      'git',
      'connect',
      `https://github.com/${GITHUB_REPO}`,
      '--yes',
      '--scope',
      VERCEL_SCOPE,
    ])
    did(`connected ${GITHUB_REPO} for auto-deploys`)
  } else {
    ok(`git: ${project.link.org}/${project.link.repo} → auto-deploys on push`)
  }

  step('Convex deploy keys on Vercel')
  const envs = must('vercel', ['env', 'ls', '--scope', VERCEL_SCOPE])
  const hasKey = (env: string) =>
    envs
      .split('\n')
      .some((line) => line.includes('CONVEX_DEPLOY_KEY') && line.includes(env))
  const addKey = (env: string, key: string) =>
    must(
      'vercel',
      [
        'env',
        'add',
        'CONVEX_DEPLOY_KEY',
        env,
        '--sensitive',
        '--yes',
        '--force',
        '--scope',
        VERCEL_SCOPE,
      ],
      key,
    )
  if (hasKey('Production')) ok('CONVEX_DEPLOY_KEY (production)')
  else {
    const key = must('bunx', [
      'convex',
      'deployment',
      'token',
      'create',
      'vercel-prod',
      '--prod',
    ])
      .split('\n')
      .pop()!
    addKey('production', key)
    did('minted a production deploy key and stored it on Vercel')
  }
  if (hasKey('Preview')) ok('CONVEX_DEPLOY_KEY (preview)')
  else {
    const preview = await createPreviewDeployKey()
    if ('key' in preview) {
      addKey('preview', preview.key)
      did(
        'minted a preview deploy key: branch pushes get their own Convex preview backend',
      )
    } else {
      bad(
        `could not mint a preview deploy key (${preview.error}); PR/branch builds will fail at \`convex deploy\` until one is set: https://dashboard.convex.dev/project/settings#preview-deploy-keys`,
      )
    }
  }

  step('Production deployment')
  type Deployments = {
    deployments: Array<{
      uid: string
      url: string
      state: string
      inspectorUrl?: string
    }>
  }
  const latest = () =>
    vercelApi<Deployments>(
      `/v6/deployments?projectId=${project.id}&target=production&limit=1`,
    ).deployments.at(0)
  let deployment = latest()
  // Re-runs converge: a failed build is redeployed from this checkout.
  if (!deployment || ['ERROR', 'CANCELED'].includes(deployment.state)) {
    did(
      deployment
        ? `latest production deployment is ${deployment.state} — redeploying from this checkout`
        : 'no production deployment yet — deploying from this checkout (later pushes to main deploy automatically)',
    )
    must('vercel', ['deploy', '--prod', '--yes', '--scope', VERCEL_SCOPE])
    deployment = latest()
  }
  while (
    deployment &&
    !['READY', 'ERROR', 'CANCELED'].includes(deployment.state)
  ) {
    did(`deployment ${deployment.state.toLowerCase()}… (${deployment.url})`)
    await sleep(10_000)
    deployment = latest()
  }
  if (!deployment) throw new Error('no deployment found after deploying')
  if (deployment.state !== 'READY') {
    bad(`production deployment is ${deployment.state}`)
    if (deployment.inspectorUrl) open(deployment.inspectorUrl)
    throw new Error(
      'fix the build (logs opened in the browser), then re-run the wizard to redeploy',
    )
  }
  type Domains = { domains: Array<{ name: string; verified: boolean }> }
  const domains = () =>
    vercelApi<Domains>(`/v9/projects/${project.id}/domains`).domains
  const vercelHost = domains().find((d) => d.name.endsWith('.vercel.app'))?.name
  ok(`production deployment READY: https://${vercelHost ?? deployment.url}`)

  step('Domain')
  if (!domains().some((d) => d.name === DOMAIN)) {
    must('vercel', ['domains', 'add', DOMAIN, PROJECT, '--scope', VERCEL_SCOPE])
    did(`attached ${DOMAIN} to ${PROJECT}`)
  } else {
    ok(`${DOMAIN} is attached to the project`)
  }

  step('DNS (Namecheap)')
  type Verify = {
    recommended?: {
      records?: Array<{ type: string; name: string; value: string }>
    }
  }
  let verify: Verify = {}
  try {
    verify = JSON.parse(
      sh('vercel', [
        'domains',
        'verify',
        DOMAIN,
        '--project',
        PROJECT,
        '--scope',
        VERCEL_SCOPE,
        '--format',
        'json',
      ]),
    ) as Verify
  } catch {
    // Older CLI output; fall back to the generic target below.
  }
  const cnames = (verify.recommended?.records ?? []).filter(
    (r) => r.type === 'CNAME',
  )
  // Vercel prefers the project-specific host but also serves the generic one.
  const accepted = new Set([
    ...cnames.map((r) => stripDot(r.value)),
    'cname.vercel-dns.com',
  ])
  const target = cnames[0] ? stripDot(cnames[0].value) : 'cname.vercel-dns.com'
  const host = cnames[0]?.name ?? DOMAIN.replace(`.${APEX}`, '')
  const currentCname = () => stripDot(must('dig', ['+short', 'CNAME', DOMAIN]))
  const resolves = () => accepted.has(currentCname())
  if (resolves()) {
    ok(`${DOMAIN} → ${currentCname()}`)
  } else {
    bad(`${DOMAIN} does not point at Vercel yet`)
    console.log(`
  Add this record in Namecheap (Advanced DNS → Host Records → Add New Record):

      Type   CNAME Record
      Host   ${host}
      Value  ${target}
      TTL    Automatic

  ${NAMECHEAP_DNS_URL}
`)
    if (!process.stdin.isTTY) {
      console.log(
        '  (non-interactive run: add the record, then run `bun run wizard` again)',
      )
      return
    }
    open(NAMECHEAP_DNS_URL)
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    await rl.question('  Press Enter once the record is saved… ')
    rl.close()
    did('waiting for DNS to propagate (this can take a few minutes)')
    for (let attempt = 0; !resolves(); attempt++) {
      if (attempt > 60) {
        throw new Error(
          'DNS still not updated after 15 minutes; check the record and re-run',
        )
      }
      await sleep(15_000)
    }
    ok(`${DOMAIN} → ${target}`)
  }

  step('Live check')
  run('vercel', [
    'domains',
    'verify',
    DOMAIN,
    '--project',
    PROJECT,
    '--scope',
    VERCEL_SCOPE,
  ])
  const url = `https://${DOMAIN}/welcome`
  for (let attempt = 0; ; attempt++) {
    const status = sh('curl', [
      '-s',
      '-o',
      '/dev/null',
      '-w',
      '%{http_code}',
      '--max-time',
      '15',
      url,
    ])
    if (status === '200') break
    if (attempt > 40) {
      throw new Error(
        `${url} still returns ${status || 'no response'}; give the certificate a few more minutes and re-run`,
      )
    }
    did(
      `waiting for ${url} (${status || 'no response'} — certificate provisioning)…`,
    )
    await sleep(15_000)
  }
  ok(`https://${DOMAIN} is live`)
  if (process.stdin.isTTY) open(`https://${DOMAIN}`)
  console.log(
    '\nAll set. Mint the first admin link with: bun run invite --prod --admin "Your name"\n',
  )
}

// The CLI can only mint production keys; preview keys come from the
// Management API, which accepts the CLI's own login token.
async function createPreviewDeployKey(): Promise<
  { key: string } | { error: string }
> {
  try {
    const { accessToken } = JSON.parse(
      readFileSync(join(homedir(), '.convex', 'config.json'), 'utf8'),
    ) as { accessToken: string }
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
    const projectsResponse = await fetch(
      `https://api.convex.dev/v1/teams/${CONVEX_TEAM_ID}/list_projects`,
      { headers },
    )
    if (!projectsResponse.ok)
      return { error: `list_projects → HTTP ${projectsResponse.status}` }
    const projects = (await projectsResponse.json()) as Array<{
      id: number
      slug: string
    }>
    const project = projects.find((p) => p.slug === PROJECT)
    if (!project) return { error: `no Convex project with slug ${PROJECT}` }
    const response = await fetch(
      `https://api.convex.dev/v1/projects/${project.id}/create_preview_deploy_key`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'vercel-preview' }),
      },
    )
    if (!response.ok)
      return { error: `create_preview_deploy_key → HTTP ${response.status}` }
    const { previewDeployKey } = (await response.json()) as {
      previewDeployKey: string
    }
    return { key: previewDeployKey }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
