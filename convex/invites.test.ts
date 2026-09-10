/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { MAX_SESSIONS_PER_USER } from './lib/sessions'
import { hashToken, newToken } from './lib/tokens'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

type T = ReturnType<typeof convexTest>

async function mintOne(t: T, label: string, grantsAdmin?: boolean) {
  const [invite] = await t.mutation(internal.invites.createInternal, {
    labels: [label],
    grantsAdmin,
  })
  return invite.token
}

// Mirrors the browser: generate the session secret, claim, keep the secret.
async function claim(
  t: T,
  token: string,
  name?: string,
  sessionToken = newToken(),
) {
  await t.mutation(api.invites.claim, { token, name, sessionToken })
  return sessionToken
}

const me = (t: T, sessionToken: string) =>
  t.query(api.users.me, { sessionToken })
const join = async (t: T, name: string) => claim(t, await mintOne(t, name))
async function joinAs(t: T, name: string) {
  const sessionToken = await join(t, name)
  return { sessionToken, user: (await me(t, sessionToken))! }
}
const peek = (t: T, token: string, sessionToken?: string) =>
  t.query(api.invites.peek, sessionToken ? { token, sessionToken } : { token })
const recoveryLink = async (t: T, adminToken: string, userId: Id<'users'>) =>
  (
    await t.mutation(api.invites.createForUser, {
      sessionToken: adminToken,
      userId,
    })
  ).token
const listInvites = (t: T, adminToken: string) =>
  t.query(api.invites.list, { sessionToken: adminToken })

async function setup() {
  const t = convexTest(schema, modules)
  const adminToken = await claim(t, await mintOne(t, 'Yoav', true))
  return { t, adminToken }
}

const failsWith = (code: string) => expect.objectContaining({ data: { code } })

describe('claiming an invite', () => {
  test('creates a user named by the guest and a session that resolves to it', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Alice')
    expect(await peek(t, token)).toEqual({
      status: 'available',
      kind: 'new',
      label: 'Alice',
      viewer: null,
    })

    const sessionToken = await claim(t, token, '  Alice   B ')
    expect(await me(t, sessionToken)).toMatchObject({
      name: 'Alice B',
      isAdmin: false,
    })
    // The link now signs other devices into the account.
    expect(await peek(t, token)).toEqual({
      status: 'available',
      kind: 'existing',
      name: 'Alice B',
      mine: false,
      viewer: null,
    })
    expect(await peek(t, token, sessionToken)).toMatchObject({
      kind: 'existing',
      mine: true,
      viewer: { name: 'Alice B' },
    })
  })

  test('falls back to the label as the name', async () => {
    const { t } = await setup()
    const sessionToken = await join(t, 'Bob')
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Bob' })
  })

  test('rejects empty and overlong names, leaving the invite claimable', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Carol')
    await expect(claim(t, token, '   ')).rejects.toEqual(
      failsWith('INVALID_NAME'),
    )
    await expect(claim(t, token, 'x'.repeat(61))).rejects.toEqual(
      failsWith('INVALID_NAME'),
    )
    expect(await peek(t, token)).toMatchObject({ status: 'available' })
    const sessionToken = await claim(t, token, 'Carol C')
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Carol C' })
  })

  test('works again from another browser: same account, first session survives, no rename', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Dana')
    const phone = await claim(t, token)
    expect(await peek(t, token)).toEqual({
      status: 'available',
      kind: 'existing',
      name: 'Dana',
      mine: false,
      viewer: null,
    })
    expect(await peek(t, token, phone)).toMatchObject({ mine: true })
    const laptop = await claim(t, token, 'Someone Else')
    expect(await me(t, laptop)).toEqual(await me(t, phone))
    expect(await me(t, phone)).toMatchObject({ name: 'Dana' })
  })

  test('a retry after another browser also claimed is still a no-op', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Dana')
    const phone = await claim(t, token)
    const laptop = await claim(t, token)
    // Both retries: same secrets, nothing new, nothing renamed.
    await claim(t, token, 'Renamed', phone)
    await claim(t, token, 'Renamed', laptop)
    expect(await me(t, phone)).toMatchObject({ name: 'Dana' })
    const dana = (await me(t, phone))!
    const sessions = await t.run((ctx) => ctx.db.query('sessions').collect())
    expect(sessions.filter((s) => s.userId === dana._id)).toHaveLength(2)
  })

  test("a stranger's session secret can't be attached to a claimed link", async () => {
    const { t } = await setup()
    const stranger = await join(t, 'Stranger')
    const token = await mintOne(t, 'Dana')
    await claim(t, token)
    await expect(claim(t, token, undefined, stranger)).rejects.toEqual(
      failsWith('INVALID_SESSION_TOKEN'),
    )
    expect(await me(t, stranger)).toMatchObject({ name: 'Stranger' })
  })

  test('retrying with the same session secret is idempotent (lost response)', async () => {
    const { t, adminToken } = await setup()
    const token = await mintOne(t, 'Dana')
    const secret = newToken()
    await claim(t, token, 'Dana', secret)
    await claim(t, token, 'Renamed', secret)
    expect(await me(t, secret)).toMatchObject({ name: 'Dana' })
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.filter((u) => u.name === 'Dana')).toHaveLength(1)
  })

  test('refuses weak or already-used session secrets', async () => {
    const { t } = await setup()
    await expect(
      claim(t, await mintOne(t, 'Erin'), undefined, 'short'),
    ).rejects.toEqual(failsWith('INVALID_SESSION_TOKEN'))
    const reused = await join(t, 'Erin')
    await expect(
      claim(t, await mintOne(t, 'Erin 2'), undefined, reused),
    ).rejects.toEqual(failsWith('INVALID_SESSION_TOKEN'))
  })

  test('unknown tokens are invalid', async () => {
    const { t } = await setup()
    expect(await peek(t, 'nope')).toEqual({ status: 'invalid' })
    await expect(claim(t, 'nope')).rejects.toEqual(failsWith('INVALID_INVITE'))
    expect(await me(t, 'nope')).toBeNull()
  })

  test('the page can tell a signed-in viewer who they are', async () => {
    const { t } = await setup()
    const { sessionToken } = await joinAs(t, 'Zed')
    expect(
      await peek(t, await mintOne(t, 'Alice'), sessionToken),
    ).toMatchObject({
      viewer: { name: 'Zed' },
    })
  })

  test('admin-flagged invites create admins', async () => {
    const { t, adminToken } = await setup()
    expect(await me(t, adminToken)).toMatchObject({
      name: 'Yoav',
      isAdmin: true,
    })
  })
})

describe('many devices', () => {
  test(`keeps at most ${MAX_SESSIONS_PER_USER} sessions, dropping the oldest`, async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Eve')
    const sessions = [await claim(t, token)]
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++)
      sessions.push(await claim(t, token))
    expect(await me(t, sessions[0])).toBeNull()
    for (const sessionToken of sessions.slice(1))
      expect(await me(t, sessionToken)).not.toBeNull()
  })
})

describe('recovery', () => {
  test('an admin recovery link signs the account out of every other browser', async () => {
    const { t, adminToken } = await setup()
    const { sessionToken: lost, user: faye } = await joinAs(t, 'Faye')
    const token = await recoveryLink(t, adminToken, faye._id)
    // Still signed in until the new link is actually used.
    expect(await me(t, lost)).not.toBeNull()
    const found = await claim(t, token)
    expect(await me(t, found)).toEqual(faye)
    expect(await me(t, lost)).toBeNull()
    // Reusing the recovery link later signs another device in without
    // signing the recovered one out again.
    const tablet = await claim(t, token)
    expect(await me(t, tablet)).toEqual(faye)
    expect(await me(t, found)).toEqual(faye)
  })

  test('recovery kills the leaked original link, and only that', async () => {
    const { t, adminToken } = await setup()
    const original = await mintOne(t, 'Faye')
    await claim(t, original)
    const thief = await claim(t, original)
    const faye = (await me(t, thief))!
    const token = await recoveryLink(t, adminToken, faye._id)
    await claim(t, token)
    expect(await me(t, thief)).toBeNull()
    expect(await peek(t, original)).toEqual({ status: 'invalid' })
    await expect(claim(t, original)).rejects.toEqual(
      failsWith('INVALID_INVITE'),
    )
    expect(await peek(t, token)).toMatchObject({ status: 'available' })
    const listed = await listInvites(t, adminToken)
    expect(
      listed.find((i) => i.label === 'Faye' && i.kind === 'new'),
    ).toMatchObject({ revokedAt: expect.any(Number) })
  })

  test('sign out everywhere invalidates every session but keeps the account', async () => {
    const { t, adminToken } = await setup()
    const token = await mintOne(t, 'Gus')
    const phone = await claim(t, token)
    const gus = (await me(t, phone))!
    const laptop = await claim(t, token)
    expect(
      await t.mutation(api.users.signOutEverywhere, {
        sessionToken: adminToken,
        userId: gus._id,
      }),
    ).toBe(2)
    expect(await me(t, phone)).toBeNull()
    expect(await me(t, laptop)).toBeNull()
    await expect(claim(t, token)).rejects.toEqual(failsWith('INVALID_INVITE'))
    expect(
      await t.query(api.users.list, { sessionToken: adminToken }),
    ).toContainEqual(expect.objectContaining({ _id: gus._id, name: 'Gus' }))
  })
})

describe('pre-unification data (transition safety)', () => {
  // Builds a user the way the OLD code did: no joinedAt, a claimed invite
  // without forUserId, a live session. Exists in prod until the migration runs.
  async function legacyJoinedUser(t: T, name: string, claimedAt: number) {
    const secret = newToken()
    const userId = await t.run(async (ctx) => {
      const legacyId = await ctx.db.insert('users', { name, isAdmin: false })
      await ctx.db.insert('invites', {
        tokenHash: await hashToken(newToken()),
        label: name,
        claimedAt,
        claimedByUserId: legacyId,
        claimedSessionTokenHash: await hashToken(newToken()),
      })
      await ctx.db.insert('sessions', {
        userId: legacyId,
        tokenHash: await hashToken(secret),
      })
      return legacyId
    })
    return { userId, secret }
  }

  test('a legacy user still reads as joined before the migration', async () => {
    const { t, adminToken } = await setup()
    const { userId, secret } = await legacyJoinedUser(t, 'Old Timer', 1000)

    // They count as joined: a recovery link is allowed, a reissue is not,
    // and the recovery link signs in under the existing name.
    await expect(
      t.mutation(api.invites.reissueInvite, {
        sessionToken: adminToken,
        userId,
      }),
    ).rejects.toEqual(failsWith('ALREADY_JOINED'))
    const token = await recoveryLink(t, adminToken, userId)
    expect(await peek(t, token)).toMatchObject({
      kind: 'existing',
      name: 'Old Timer',
    })
    const laptop = await claim(t, token, 'Hax')
    expect(await me(t, laptop)).toMatchObject({ name: 'Old Timer' })
    expect(await me(t, secret)).toBeNull()

    // Admin views fall back to the claimed invite for the joined date.
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === userId)?.joinedAt).toBe(1000)

    // Recovery works, reissue refuses.
    await recoveryLink(t, adminToken, userId)
    await expect(
      t.mutation(api.invites.reissueInvite, {
        sessionToken: adminToken,
        userId,
      }),
    ).rejects.toEqual(failsWith('ALREADY_JOINED'))
  })

  test('a legacy unclaimed invite still joins, creating the user at claim', async () => {
    const { t } = await setup()
    const token = newToken()
    await t.run(async (ctx) => {
      await ctx.db.insert('invites', {
        tokenHash: await hashToken(token),
        label: 'Latecomer',
      })
    })
    expect(await peek(t, token)).toMatchObject({ kind: 'new' })
    const sessionToken = await claim(t, token, 'Latecomer L')
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Latecomer L' })
  })

  test('migrateToForUser backfills everything and is idempotent', async () => {
    const { t, adminToken } = await setup()
    // A legacy user with two claimed invites (original + device link).
    const { userId } = await legacyJoinedUser(t, 'Legacy', 2000)
    await t.run(async (ctx) => {
      await ctx.db.insert('invites', {
        tokenHash: await hashToken(newToken()),
        label: 'Legacy',
        claimedAt: 3000,
        claimedByUserId: userId,
        claimedSessionTokenHash: await hashToken(newToken()),
      })
      // A legacy invite nobody opened yet.
      await ctx.db.insert('invites', {
        tokenHash: await hashToken(newToken()),
        label: 'Never Opened',
        grantsAdmin: true,
      })
    })

    const counts = await t.mutation(internal.invites.migrateToForUser, {})
    expect(counts).toEqual({
      invitesMissingForUserId: 0,
      joinedUsersMissingJoinedAt: 0,
    })

    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === userId)?.joinedAt).toBe(2000)
    expect(users.find((u) => u.name === 'Never Opened')).toMatchObject({
      isAdmin: true,
      joinedAt: null,
    })

    await t.mutation(internal.invites.migrateToForUser, {})
    const again = await t.query(api.users.list, { sessionToken: adminToken })
    expect(again.filter((u) => u.name === 'Never Opened')).toHaveLength(1)
  })
})

describe('admin gating', () => {
  test('guests cannot mint, list, promote, or sign others out', async () => {
    const { t } = await setup()
    const { sessionToken, user: frank } = await joinAs(t, 'Frank')
    const forbidden = failsWith('FORBIDDEN')
    await expect(
      t.mutation(api.invites.create, { sessionToken, labels: ['x'] }),
    ).rejects.toEqual(forbidden)
    await expect(recoveryLink(t, sessionToken, frank._id)).rejects.toEqual(
      forbidden,
    )
    await expect(listInvites(t, sessionToken)).rejects.toEqual(forbidden)
    await expect(t.query(api.users.list, { sessionToken })).rejects.toEqual(
      forbidden,
    )
    await expect(
      t.mutation(api.users.setAdmin, {
        sessionToken,
        userId: frank._id,
        isAdmin: true,
      }),
    ).rejects.toEqual(forbidden)
    await expect(
      t.mutation(api.users.signOutEverywhere, {
        sessionToken,
        userId: frank._id,
      }),
    ).rejects.toEqual(forbidden)
    expect(await me(t, sessionToken)).toMatchObject({ isAdmin: false })
  })

  test('admins mint invites (blank labels skipped), see them, and revoke unclaimed ones', async () => {
    const { t, adminToken } = await setup()
    const minted = await t.mutation(api.invites.create, {
      sessionToken: adminToken,
      labels: ['Grace', '   ', 'Heidi  Ho'],
    })
    expect(minted.map((m) => m.label)).toEqual(['Grace', 'Heidi Ho'])
    expect(new Set(minted.map((m) => m.token)).size).toBe(2)

    const gracie = (await me(t, await claim(t, minted[0].token, 'Gracie')))!
    const listed = await listInvites(t, adminToken)
    expect(listed.find((i) => i.label === 'Grace')).toMatchObject({
      claimedByUserId: gracie._id,
      kind: 'new',
      grantsAdmin: false,
    })
    const heidi = listed.find((i) => i.label === 'Heidi Ho')!
    expect(heidi.claimedAt).toBeNull()

    await t.mutation(api.invites.revoke, {
      sessionToken: adminToken,
      inviteId: heidi._id,
    })
    expect(await peek(t, minted[1].token)).toEqual({ status: 'invalid' })
    const grace = listed.find((i) => i.label === 'Grace')!
    await expect(
      t.mutation(api.invites.revoke, {
        sessionToken: adminToken,
        inviteId: grace._id,
      }),
    ).rejects.toEqual(failsWith('INVITE_CLAIMED'))
  })

  test('the list tells first links and recovery links apart', async () => {
    const { t, adminToken } = await setup()
    const { user: ida } = await joinAs(t, 'Ida')
    const listed = await listInvites(t, adminToken)
    expect(
      listed.find((i) => i.label === 'Ida' && i.kind === 'new'),
    ).toBeDefined()
    await recoveryLink(t, adminToken, ida._id)
    const relisted = await listInvites(t, adminToken)
    expect(
      relisted
        .filter((i) => i.label === 'Ida' && !i.claimedAt)
        .map((i) => i.kind),
    ).toEqual(['recovery'])
  })

  test('an unclaimed invite already shows its guest as not joined', async () => {
    const { t, adminToken } = await setup()
    const [minted] = await t.mutation(internal.invites.createInternal, {
      labels: ['Pending Pat'],
    })
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === minted.userId)).toMatchObject({
      name: 'Pending Pat',
      joinedAt: null,
    })

    await claim(t, minted.token)
    const after = await t.query(api.users.list, { sessionToken: adminToken })
    expect(after.find((u) => u._id === minted.userId)?.joinedAt).toBeTypeOf(
      'number',
    )
  })

  test('recovery links require a joined account; reissue requires an un-joined one', async () => {
    const { t, adminToken } = await setup()
    const [minted] = await t.mutation(internal.invites.createInternal, {
      labels: ['Quiet Quinn'],
    })
    await expect(recoveryLink(t, adminToken, minted.userId)).rejects.toEqual(
      failsWith('NOT_JOINED'),
    )

    const { user: joined } = await joinAs(t, 'Loud Lou')
    await expect(
      t.mutation(api.invites.reissueInvite, {
        sessionToken: adminToken,
        userId: joined._id,
      }),
    ).rejects.toEqual(failsWith('ALREADY_JOINED'))
  })

  test('reissuing replaces a first-time link without touching the account', async () => {
    const { t, adminToken } = await setup()
    const [minted] = await t.mutation(internal.invites.createInternal, {
      labels: ['Rita'],
    })
    const { token: fresh } = await t.mutation(api.invites.reissueInvite, {
      sessionToken: adminToken,
      userId: minted.userId,
    })
    expect(await peek(t, minted.token)).toEqual({ status: 'invalid' })
    expect(await peek(t, fresh)).toEqual({
      status: 'available',
      kind: 'new',
      label: 'Rita',
      viewer: null,
    })
    const listed = await listInvites(t, adminToken)
    expect(listed.filter((i) => i.label === 'Rita').map((i) => i.kind)).toEqual(
      ['new'],
    )

    const sessionToken = await claim(t, fresh, 'Rita R')
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Rita R' })
  })

  test('revoking a first-time link deletes its never-joined user', async () => {
    const { t, adminToken } = await setup()
    const [minted] = await t.mutation(internal.invites.createInternal, {
      labels: ['Sam'],
    })
    const invite = (await listInvites(t, adminToken)).find(
      (i) => i.label === 'Sam',
    )!
    await t.mutation(api.invites.revoke, {
      sessionToken: adminToken,
      inviteId: invite._id,
    })
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === minted.userId)).toBeUndefined()
  })

  test('revoking an unclaimed recovery link keeps the joined user', async () => {
    const { t, adminToken } = await setup()
    const { sessionToken: phone, user: gina } = await joinAs(t, 'Gina')
    await recoveryLink(t, adminToken, gina._id)
    const invite = (await listInvites(t, adminToken)).find(
      (i) => i.label === 'Gina' && i.kind === 'recovery' && !i.claimedAt,
    )!
    await t.mutation(api.invites.revoke, {
      sessionToken: adminToken,
      inviteId: invite._id,
    })
    const users = await t.query(api.users.list, { sessionToken: adminToken })
    expect(users.find((u) => u._id === gina._id)).toBeDefined()
    expect(await me(t, phone)).not.toBeNull()
  })

  test('admins promote and demote others but not themselves', async () => {
    const { t, adminToken } = await setup()
    const { sessionToken, user: ivan } = await joinAs(t, 'Ivan')
    const setIvan = (isAdmin: boolean) =>
      t.mutation(api.users.setAdmin, {
        sessionToken: adminToken,
        userId: ivan._id,
        isAdmin,
      })

    await setIvan(true)
    expect(await me(t, sessionToken)).toMatchObject({ isAdmin: true })
    expect(await t.query(api.users.list, { sessionToken })).toHaveLength(2)

    await setIvan(false)
    expect(await me(t, sessionToken)).toMatchObject({ isAdmin: false })
    await expect(t.query(api.users.list, { sessionToken })).rejects.toEqual(
      failsWith('FORBIDDEN'),
    )

    const admin = (await me(t, adminToken))!
    await expect(
      t.mutation(api.users.setAdmin, {
        sessionToken: adminToken,
        userId: admin._id,
        isAdmin: false,
      }),
    ).rejects.toEqual(failsWith('CANNOT_DEMOTE_SELF'))
  })
})
