/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { CATALOG_COUNT, catalog } from '../data/catalog'
import { api, internal } from './_generated/api'
import { newToken } from './lib/tokens'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function adminSetup() {
  const t = convexTest(schema, modules)
  const [invite] = await t.mutation(internal.invites.createInternal, {
    labels: ['Yoav'],
    grantsAdmin: true,
  })
  const adminToken = newToken()
  await t.mutation(api.invites.claim, {
    token: invite.token,
    sessionToken: adminToken,
  })
  return { t, adminToken }
}

const distinctFacilitators = new Set(
  catalog.flatMap((entry) => entry.facilitatorNames),
)

describe('catalog seeding', () => {
  test('creates every session plus facilitator users and invite links', async () => {
    const { t, adminToken } = await adminSetup()
    const result = await t.mutation(internal.catalog.seed, {})
    expect(result.createdSessions).toHaveLength(CATALOG_COUNT)
    expect(result.alreadySeeded).toBe(0)
    // Yoav already exists; everyone else gets an account + link.
    expect(result.newFacilitatorLinks.map((l) => l.label).sort()).toEqual(
      [...distinctFacilitators].filter((name) => name !== 'Yoav').sort(),
    )

    const users = await t.query(api.users.list, { sessionToken: adminToken })
    for (const name of distinctFacilitators) {
      expect(users.filter((u) => u.name === name)).toHaveLength(1)
    }
    // Facilitator links are claimable and land on the pre-created account.
    const collin = result.newFacilitatorLinks.find(
      (l) => l.label === 'Colin Belgard',
    )!
    const sessionToken = newToken()
    await t.mutation(api.invites.claim, {
      token: collin.token,
      sessionToken,
    })
    expect(await t.query(api.users.me, { sessionToken })).toMatchObject({
      name: 'Colin Belgard',
    })

    // The guest list joins facilitator names.
    const { sessions } = await t.query(api.partySessions.list, {
      sessionToken: adminToken,
    })
    expect(sessions).toHaveLength(CATALOG_COUNT)
    expect(
      sessions.find((s) => s.title === 'Circling')?.facilitatorNames,
    ).toEqual(['Colin Belgard'])
    expect(
      sessions.find((s) => s.title === 'Hanabi tournament')?.facilitatorNames,
    ).toEqual(['Guy', 'Yoav'])
    expect(
      sessions.find((s) => s.title === 'Boudoir Life Drawing'),
    ).toMatchObject({ needsFacilitator: true })
  })

  test('rerunning is a no-op that survives renames and admin edits', async () => {
    const { t, adminToken } = await adminSetup()
    await t.mutation(internal.catalog.seed, {})

    // An admin retitles a session and a facilitator renames themselves.
    await t.run(async (ctx) => {
      const circling = (await ctx.db.query('partySessions').take(500)).find(
        (s) => s.catalogKey === 'circling',
      )!
      await ctx.db.patch('partySessions', circling._id, {
        title: 'Circling (edited)',
        description: 'Rewritten by an organizer',
      })
      const libi = (await ctx.db.query('users').take(1000)).find(
        (u) => u.name === 'Libi Soen',
      )!
      await ctx.db.patch('users', libi._id, { name: 'Libi' })
    })

    const rerun = await t.mutation(internal.catalog.seed, {})
    expect(rerun.createdSessions).toHaveLength(0)
    expect(rerun.alreadySeeded).toBe(CATALOG_COUNT)
    expect(rerun.newFacilitatorLinks).toHaveLength(0)

    const { sessions } = await t.query(api.partySessions.list, {
      sessionToken: adminToken,
    })
    expect(sessions).toHaveLength(CATALOG_COUNT)
    expect(sessions.find((s) => s.title === 'Circling (edited)')).toMatchObject(
      { description: 'Rewritten by an organizer' },
    )
    // The renamed facilitator stays linked (ids, not names).
    expect(
      sessions.find((s) => s.title === 'Hot seat')?.facilitatorNames,
    ).toEqual(['Libi'])
  })

  test('ambiguous facilitator names refuse to seed', async () => {
    const { t } = await adminSetup()
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { name: 'Guy', isAdmin: false })
      await ctx.db.insert('users', { name: 'Guy', isAdmin: false })
    })
    await expect(t.mutation(internal.catalog.seed, {})).rejects.toEqual(
      expect.objectContaining({
        data: { code: 'AMBIGUOUS_FACILITATORS', names: ['Guy'] },
      }),
    )
    // Nothing was written.
    const preflight = await t.query(internal.catalog.seedPreflight, {})
    expect(preflight.alreadySeeded).toBe(0)
  })

  test('preflight reports without writing', async () => {
    const { t, adminToken } = await adminSetup()
    const report = await t.query(internal.catalog.seedPreflight, {})
    expect(report.wouldCreateSessions).toHaveLength(CATALOG_COUNT)
    expect(report.wouldCreateFacilitators).toContain('Colin Belgard')
    expect(report.wouldCreateFacilitators).not.toContain('Yoav')
    expect(report.ambiguousFacilitators).toEqual([])

    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users).toHaveLength(1)
    await expect(
      t.query(api.partySessions.list, { sessionToken: adminToken }),
    ).resolves.toMatchObject({ sessions: [] })
  })
})
