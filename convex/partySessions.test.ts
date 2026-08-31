/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { takeAll } from './lib/collect'
import { enabledHourKeys, hourKey } from './lib/slots'
import { newToken } from './lib/tokens'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

type T = ReturnType<typeof convexTest>

async function joinAs(t: T, name: string) {
  const [invite] = await t.mutation(internal.invites.createInternal, {
    labels: [name],
  })
  const sessionToken = newToken()
  await t.mutation(api.invites.claim, { token: invite.token, sessionToken })
  return { sessionToken, userId: invite.userId }
}

const addSession = (
  t: T,
  title: string,
  extra?: { hidden?: boolean; facilitatorIds?: Array<Id<'users'>> },
) =>
  t.run((ctx) =>
    ctx.db.insert('partySessions', {
      title,
      facilitatorIds: extra?.facilitatorIds ?? [],
      hidden: extra?.hidden,
    }),
  )

const listFor = async (t: T, sessionToken: string) =>
  await t.query(api.partySessions.list, { sessionToken })

const failsWith = (code: string) => expect.objectContaining({ data: { code } })

describe('voting', () => {
  test('set, change, and clear a vote round-trips through list', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    const id = await addSession(t, 'Circling')

    expect(
      (await listFor(t, sessionToken)).sessions.map((s) => s.myVote),
    ).toEqual([null])

    const vote = (strength: 'regular' | 'strong' | null) =>
      t.mutation(api.partySessions.setVote, {
        sessionToken,
        partySessionId: id,
        strength,
      })

    await vote('regular')
    expect((await listFor(t, sessionToken)).sessions[0].myVote).toBe('regular')
    await vote('regular') // idempotent
    await vote('strong')
    expect((await listFor(t, sessionToken)).sessions[0].myVote).toBe('strong')
    await vote(null)
    expect((await listFor(t, sessionToken)).sessions[0].myVote).toBeNull()
    await vote(null) // clearing twice is fine
  })

  test('hidden sessions are not listed and reject votes', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    const hiddenId = await addSession(t, 'Secret draft', { hidden: true })
    await addSession(t, 'Public one')

    const { sessions } = await listFor(t, sessionToken)
    expect(sessions.map((s) => s.title)).toEqual(['Public one'])
    await expect(
      t.mutation(api.partySessions.setVote, {
        sessionToken,
        partySessionId: hiddenId,
        strength: 'regular',
      }),
    ).rejects.toEqual(failsWith('NOT_FOUND'))
  })

  test('facilitator names are joined; missing users are skipped', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken, userId } = await joinAs(t, 'Thor')
    await addSession(t, 'Fusion Dance Class', { facilitatorIds: [userId] })
    const { sessions } = await listFor(t, sessionToken)
    expect(sessions[0].facilitatorNames).toEqual(['Thor'])
  })

  test('requires a session token', async () => {
    const t = convexTest(schema, modules)
    await expect(listFor(t, 'bogus')).rejects.toEqual(
      failsWith('UNAUTHENTICATED'),
    )
  })

  test('ordering is stable per user and differs between users', async () => {
    const t = convexTest(schema, modules)
    for (let i = 0; i < 8; i++) await addSession(t, `Session ${i}`)
    const { sessionToken: a } = await joinAs(t, 'Alice')
    const { sessionToken: b } = await joinAs(t, 'Bob')

    const titles = async (sessionToken: string) =>
      (await listFor(t, sessionToken)).sessions.map((s) => s.title)

    const aOrder = await titles(a)
    expect(await titles(a)).toEqual(aOrder)
    expect([...aOrder].sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `Session ${i}`),
    )
    expect(await titles(b)).not.toEqual(aOrder)
  })

  test('confirmVotes is write-once', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    expect((await listFor(t, sessionToken)).votesConfirmedAt).toBeNull()
    await t.mutation(api.partySessions.confirmVotes, { sessionToken })
    const first = (await listFor(t, sessionToken)).votesConfirmedAt
    expect(first).toBeTypeOf('number')
    await t.mutation(api.partySessions.confirmVotes, { sessionToken })
    expect((await listFor(t, sessionToken)).votesConfirmedAt).toBe(first)
  })
})

describe('availability', () => {
  const save = (
    t: T,
    sessionToken: string,
    blockedHours: Array<string>,
    confirm = false,
  ) =>
    t.mutation(api.availability.save, { sessionToken, blockedHours, confirm })
  const mine = (t: T, sessionToken: string) =>
    t.query(api.availability.mine, { sessionToken })

  test('starts empty, saves deduped and sorted, round-trips', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    expect(await mine(t, sessionToken)).toBeNull()

    const sat10 = hourKey('2026-09-12', 10)
    const sun23 = hourKey('2026-09-13', 23)
    await save(t, sessionToken, [sun23, sat10, sat10])
    expect(await mine(t, sessionToken)).toEqual({
      blockedHours: [sat10, sun23],
      confirmedAt: null,
    })
  })

  test('rejects hours outside the enabled grid', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    // Friday is built but disabled; Saturday 09:00 is before the grid starts.
    for (const bad of [
      hourKey('2026-09-11', 18),
      hourKey('2026-09-12', 9),
      'garbage',
    ]) {
      await expect(save(t, sessionToken, [bad])).rejects.toEqual(
        failsWith('INVALID_HOURS'),
      )
    }
    expect(enabledHourKeys().size).toBe(28)
  })

  test('confirm sticks across later edits', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    await save(t, sessionToken, [hourKey('2026-09-12', 10)], true)
    const confirmedAt = (await mine(t, sessionToken))?.confirmedAt
    expect(confirmedAt).toBeTypeOf('number')

    await save(t, sessionToken, [])
    expect(await mine(t, sessionToken)).toEqual({
      blockedHours: [],
      confirmedAt,
    })
  })

  test('guests only ever see their own row', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken: a } = await joinAs(t, 'Alice')
    const { sessionToken: b } = await joinAs(t, 'Bob')
    await save(t, a, [hourKey('2026-09-12', 12)], true)
    expect(await mine(t, b)).toBeNull()
  })
})

describe('takeAll', () => {
  test('returns everything under the cap and errors loudly past it', async () => {
    const t = convexTest(schema, modules)
    for (let i = 0; i < 3; i++) await addSession(t, `Session ${i}`)
    await t.run(async (ctx) => {
      expect(await takeAll(ctx.db.query('partySessions'), 3)).toHaveLength(3)
      await expect(takeAll(ctx.db.query('partySessions'), 2)).rejects.toEqual(
        failsWith('OVERFLOW'),
      )
    })
  })
})

describe('admin catalog management', () => {
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

  test('non-admins are refused on every admin surface', async () => {
    const { t } = await adminSetup()
    const { sessionToken } = await joinAs(t, 'Guest')
    const id = await addSession(t, 'Something')
    const forbidden = failsWith('FORBIDDEN')
    await expect(
      t.query(api.partySessions.adminList, { sessionToken }),
    ).rejects.toEqual(forbidden)
    await expect(t.query(api.schedule.raw, { sessionToken })).rejects.toEqual(
      forbidden,
    )
    await expect(
      t.mutation(api.partySessions.create, {
        sessionToken,
        title: 'Sneaky',
        facilitatorIds: [],
        needsFacilitator: false,
        hidden: false,
      }),
    ).rejects.toEqual(forbidden)
    await expect(
      t.mutation(api.partySessions.update, {
        sessionToken,
        partySessionId: id,
        title: 'Sneaky',
        facilitatorIds: [],
        needsFacilitator: false,
        hidden: false,
      }),
    ).rejects.toEqual(forbidden)
    await expect(
      t.mutation(api.partySessions.remove, {
        sessionToken,
        partySessionId: id,
      }),
    ).rejects.toEqual(forbidden)
  })

  test('create, update, and remove round-trip; remove cascades votes', async () => {
    const { t, adminToken } = await adminSetup()
    const { sessionToken: guest } = await joinAs(t, 'Alice')

    const id = await t.mutation(api.partySessions.create, {
      sessionToken: adminToken,
      title: '  Late   Idea ',
      description: 'A brand new session',
      facilitatorIds: [],
      needsFacilitator: true,
      hidden: false,
    })
    let listed = await t.query(api.partySessions.adminList, {
      sessionToken: adminToken,
    })
    expect(listed.find((s) => s._id === id)).toMatchObject({
      title: 'Late Idea',
      description: 'A brand new session',
      needsFacilitator: true,
      catalogKey: null,
    })

    await t.mutation(api.partySessions.setVote, {
      sessionToken: guest,
      partySessionId: id,
      strength: 'strong',
    })

    // Hiding keeps the vote and hides the session from guests.
    await t.mutation(api.partySessions.update, {
      sessionToken: adminToken,
      partySessionId: id,
      title: 'Late Idea',
      facilitatorIds: [],
      needsFacilitator: false,
      hidden: true,
    })
    expect(
      (await listFor(t, guest)).sessions.find((s) => s._id === id),
    ).toBeUndefined()
    listed = await t.query(api.partySessions.adminList, {
      sessionToken: adminToken,
    })
    expect(listed.find((s) => s._id === id)).toMatchObject({
      hidden: true,
      strongVotes: 1,
      description: null,
    })

    await t.mutation(api.partySessions.remove, {
      sessionToken: adminToken,
      partySessionId: id,
    })
    const raw = await t.query(api.schedule.raw, { sessionToken: adminToken })
    expect(raw.sessions.find((s) => s._id === id)).toBeUndefined()
    expect(raw.votes).toHaveLength(0)
  })

  test('schedule.raw joins everything the organizers need', async () => {
    const { t, adminToken } = await adminSetup()
    const { sessionToken: guest, userId } = await joinAs(t, 'Alice')
    const id = await addSession(t, 'Circling', { facilitatorIds: [userId] })
    await t.mutation(api.partySessions.setVote, {
      sessionToken: guest,
      partySessionId: id,
      strength: 'strong',
    })
    await t.mutation(api.availability.save, {
      sessionToken: guest,
      blockedHours: [hourKey('2026-09-12', 10)],
      confirm: true,
    })
    await t.mutation(api.partySessions.confirmVotes, { sessionToken: guest })

    const raw = await t.query(api.schedule.raw, { sessionToken: adminToken })
    expect(raw.users.find((u) => u._id === userId)).toMatchObject({
      name: 'Alice',
      votesConfirmedAt: expect.any(Number),
    })
    expect(raw.votes).toEqual([
      { userId, partySessionId: id, strength: 'strong' },
    ])
    expect(raw.availability).toEqual([
      {
        userId,
        blockedHours: [hourKey('2026-09-12', 10)],
        confirmedAt: expect.any(Number),
      },
    ])
    expect(raw.sessions.find((s) => s._id === id)).toMatchObject({
      facilitatorIds: [userId],
    })
  })
})

describe('revoke and the new tables', () => {
  test('refuses to delete a never-joined user who facilitates a session', async () => {
    const t = convexTest(schema, modules)
    const [adminInvite] = await t.mutation(internal.invites.createInternal, {
      labels: ['Yoav'],
      grantsAdmin: true,
    })
    const adminToken = newToken()
    await t.mutation(api.invites.claim, {
      token: adminInvite.token,
      sessionToken: adminToken,
    })

    const [facilitator] = await t.mutation(internal.invites.createInternal, {
      labels: ['Collin'],
    })
    await addSession(t, 'Circling', { facilitatorIds: [facilitator.userId] })

    const invite = (
      await t.query(api.invites.list, { sessionToken: adminToken })
    ).find((i) => i.label === 'Collin')!
    await t.mutation(api.invites.revoke, {
      sessionToken: adminToken,
      inviteId: invite._id,
    })
    // The link died but the user survives: a session still points at them.
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === facilitator.userId)).toBeDefined()
  })
})
