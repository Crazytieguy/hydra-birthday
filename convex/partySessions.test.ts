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

describe('proposals', () => {
  const propose = (
    t: T,
    sessionToken: string,
    title: string,
    description?: string,
  ) =>
    t.mutation(api.partySessions.propose, { sessionToken, title, description })

  test('propose round-trips through list and adminList', async () => {
    const { t, adminToken } = await adminSetup()
    const { sessionToken, userId } = await joinAs(t, 'Alice')
    expect((await listFor(t, sessionToken)).myFacilitatedSession).toBeNull()

    const id = await propose(
      t,
      sessionToken,
      '  Cuddle   Puddle ',
      '  Bring a blanket.  ',
    )
    const { sessions, myFacilitatedSession } = await listFor(t, sessionToken)
    expect(myFacilitatedSession).toEqual({
      _id: id,
      title: 'Cuddle Puddle',
      description: 'Bring a blanket.',
      hasOtherVotes: false,
      canWithdraw: true,
    })
    expect(sessions.find((s) => s._id === id)).toMatchObject({
      title: 'Cuddle Puddle',
      description: 'Bring a blanket.',
      facilitatorNames: ['Alice'],
      needsFacilitator: false,
      addedAt: expect.any(Number),
    })
    const adminListed = await t.query(api.partySessions.adminList, {
      sessionToken: adminToken,
    })
    expect(adminListed.find((s) => s._id === id)).toMatchObject({
      catalogKey: null,
      facilitatorIds: [userId],
    })
  })

  test('blank description is stored as absent', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    const id = await propose(t, sessionToken, 'Quiet Hour', '   ')
    const { sessions } = await listFor(t, sessionToken)
    expect(sessions.find((s) => s._id === id)?.description).toBeNull()
  })

  test('rejects blank and oversized titles and descriptions', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    await expect(propose(t, sessionToken, '   ')).rejects.toEqual(
      failsWith('INVALID_TITLE'),
    )
    await expect(propose(t, sessionToken, 'x'.repeat(81))).rejects.toEqual(
      failsWith('INVALID_TITLE'),
    )
    await expect(
      propose(t, sessionToken, 'Fine title', 'y'.repeat(2001)),
    ).rejects.toEqual(failsWith('INVALID_DESCRIPTION'))
    // Nothing landed.
    expect((await listFor(t, sessionToken)).myFacilitatedSession).toBeNull()
  })

  test('one proposal per guest', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    await propose(t, sessionToken, 'First idea')
    await expect(propose(t, sessionToken, 'Second idea')).rejects.toEqual(
      failsWith('ALREADY_FACILITATING'),
    )
  })

  test('facilitating any session blocks proposing, hidden included', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken, userId } = await joinAs(t, 'Thor')
    await addSession(t, 'Secret Fusion Dance', {
      facilitatorIds: [userId],
      hidden: true,
    })
    await expect(propose(t, sessionToken, 'Another one')).rejects.toEqual(
      failsWith('ALREADY_FACILITATING'),
    )
    // The hidden session still reads as their spent slot.
    expect((await listFor(t, sessionToken)).myFacilitatedSession).toEqual({
      _id: expect.any(String),
      title: 'Secret Fusion Dance',
      description: null,
      hasOtherVotes: false,
      canWithdraw: true,
    })
  })

  test('requires a session token', async () => {
    const t = convexTest(schema, modules)
    await expect(propose(t, 'bogus', 'Anything')).rejects.toEqual(
      failsWith('UNAUTHENTICATED'),
    )
  })

  test('updateMine rewrites the text and can clear the description', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    const id = await propose(t, sessionToken, 'First cut', 'Rough idea')
    await t.mutation(api.partySessions.updateMine, {
      sessionToken,
      partySessionId: id,
      title: '  Second   cut ',
    })
    expect((await listFor(t, sessionToken)).myFacilitatedSession).toMatchObject(
      { title: 'Second cut', description: null },
    )
    await expect(
      t.mutation(api.partySessions.updateMine, {
        sessionToken,
        partySessionId: id,
        title: ' ',
      }),
    ).rejects.toEqual(failsWith('INVALID_TITLE'))
  })

  test("updateMine refuses sessions the caller doesn't facilitate", async () => {
    const t = convexTest(schema, modules)
    const { sessionToken: alice } = await joinAs(t, 'Alice')
    const { sessionToken: bob } = await joinAs(t, 'Bob')
    const id = await propose(t, alice, 'Quiet Hour')
    await expect(
      t.mutation(api.partySessions.updateMine, {
        sessionToken: bob,
        partySessionId: id,
        title: 'Loud Hour',
      }),
    ).rejects.toEqual(failsWith('NOT_FOUND'))
    expect((await listFor(t, alice)).myFacilitatedSession?.title).toBe(
      'Quiet Hour',
    )
  })

  test('updateMine edits exactly the named session for a multi-session facilitator', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken, userId } = await joinAs(t, 'Libi')
    const first = await addSession(t, 'Seeded One', {
      facilitatorIds: [userId],
    })
    const second = await addSession(t, 'Seeded Two', {
      facilitatorIds: [userId],
    })
    await t.mutation(api.partySessions.updateMine, {
      sessionToken,
      partySessionId: second,
      title: 'Seeded Two, sharper',
    })
    const { sessions } = await listFor(t, sessionToken)
    expect(sessions.find((s) => s._id === first)?.title).toBe('Seeded One')
    expect(sessions.find((s) => s._id === second)?.title).toBe(
      'Seeded Two, sharper',
    )
  })

  test('withdraw deletes the proposal with its votes and frees the slot', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken: alice } = await joinAs(t, 'Alice')
    const { sessionToken: bob } = await joinAs(t, 'Bob')
    const id = await propose(t, alice, 'First Idea')
    await t.mutation(api.partySessions.setVote, {
      sessionToken: bob,
      partySessionId: id,
      strength: 'strong',
    })

    await t.mutation(api.partySessions.withdrawMine, {
      sessionToken: alice,
      partySessionId: id,
    })
    expect((await listFor(t, alice)).myFacilitatedSession).toBeNull()
    expect(
      (await listFor(t, bob)).sessions.find((s) => s._id === id),
    ).toBeUndefined()
    await t.run(async (ctx) => {
      expect(await takeAll(ctx.db.query('votes'), 10)).toHaveLength(0)
    })
    // The slot is free again.
    await propose(t, alice, 'Second Idea')
  })

  test('withdraw refuses seeded, shared, and unowned sessions', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken: alice, userId: aliceId } = await joinAs(t, 'Alice')
    const { sessionToken: bob, userId: bobId } = await joinAs(t, 'Bob')

    const seeded = await t.run((ctx) =>
      ctx.db.insert('partySessions', {
        catalogKey: 'circling',
        title: 'Circling',
        facilitatorIds: [aliceId],
      }),
    )
    await expect(
      t.mutation(api.partySessions.withdrawMine, {
        sessionToken: alice,
        partySessionId: seeded,
      }),
    ).rejects.toEqual(failsWith('CANNOT_WITHDRAW'))

    const shared = await addSession(t, 'Duet', {
      facilitatorIds: [bobId, aliceId],
    })
    await expect(
      t.mutation(api.partySessions.withdrawMine, {
        sessionToken: bob,
        partySessionId: shared,
      }),
    ).rejects.toEqual(failsWith('CANNOT_WITHDRAW'))

    const bobsOwn = await addSession(t, 'Solo', { facilitatorIds: [bobId] })
    await expect(
      t.mutation(api.partySessions.withdrawMine, {
        sessionToken: alice,
        partySessionId: bobsOwn,
      }),
    ).rejects.toEqual(failsWith('NOT_FOUND'))
  })

  test("hasOtherVotes ignores the proposer's own vote", async () => {
    const t = convexTest(schema, modules)
    const { sessionToken: alice } = await joinAs(t, 'Alice')
    const { sessionToken: bob } = await joinAs(t, 'Bob')
    const id = await propose(t, alice, 'Quiet Hour')

    const vote = (sessionToken: string) =>
      t.mutation(api.partySessions.setVote, {
        sessionToken,
        partySessionId: id,
        strength: 'regular' as const,
      })
    await vote(alice)
    expect((await listFor(t, alice)).myFacilitatedSession?.hasOtherVotes).toBe(
      false,
    )
    await vote(bob)
    expect((await listFor(t, alice)).myFacilitatedSession?.hasOtherVotes).toBe(
      true,
    )
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
    // 09:00 is before every day's grid starts.
    for (const bad of [
      hourKey('2026-09-11', 9),
      hourKey('2026-09-12', 9),
      'garbage',
    ]) {
      await expect(save(t, sessionToken, [bad])).rejects.toEqual(
        failsWith('INVALID_HOURS'),
      )
    }
    expect(enabledHourKeys().size).toBe(42)
  })

  test('accepts Friday hours now that Friday is enabled', async () => {
    const t = convexTest(schema, modules)
    const { sessionToken } = await joinAs(t, 'Alice')
    const fri18 = hourKey('2026-09-11', 18)
    await save(t, sessionToken, [fri18])
    expect(await mine(t, sessionToken)).toEqual({
      blockedHours: [fri18],
      confirmedAt: null,
    })
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

  test('unhiding a session marks it new for already-confirmed guests', async () => {
    const { t, adminToken } = await adminSetup()
    const { sessionToken: guest } = await joinAs(t, 'Alice')
    const id = await t.mutation(api.partySessions.create, {
      sessionToken: adminToken,
      title: 'Drafted quietly',
      facilitatorIds: [],
      needsFacilitator: false,
      hidden: true,
    })
    await t.mutation(api.partySessions.confirmVotes, { sessionToken: guest })
    const votedAt = (await listFor(t, guest)).votesConfirmedAt!
    // The unhide must land on a later clock tick than the confirmation.
    await new Promise((resolve) => setTimeout(resolve, 2))
    await t.mutation(api.partySessions.update, {
      sessionToken: adminToken,
      partySessionId: id,
      title: 'Drafted quietly',
      facilitatorIds: [],
      needsFacilitator: false,
      hidden: false,
    })
    const revealed = (await listFor(t, guest)).sessions.find(
      (s) => s._id === id,
    )!
    expect(revealed.addedAt).toBeGreaterThan(votedAt)
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
    const { t, adminToken } = await adminSetup()
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
