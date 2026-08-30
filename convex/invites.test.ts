/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import { MAX_SESSIONS_PER_USER } from './lib/sessions'
import { newToken } from './lib/tokens'
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
    expect(await t.query(api.invites.peek, { token })).toEqual({
      status: 'available',
      kind: 'new',
      label: 'Alice',
    })

    const sessionToken = await claim(t, token, '  Alice   B ')
    expect(await me(t, sessionToken)).toMatchObject({
      name: 'Alice B',
      isAdmin: false,
    })
    expect(await t.query(api.invites.peek, { token })).toEqual({
      status: 'claimed',
      mine: false,
    })
    expect(await t.query(api.invites.peek, { token, sessionToken })).toEqual({
      status: 'claimed',
      mine: true,
    })
  })

  test('falls back to the label as the name', async () => {
    const { t } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Bob'))
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
    expect(await t.query(api.invites.peek, { token })).toMatchObject({
      status: 'available',
    })
    const sessionToken = await claim(t, token, 'Carol C')
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Carol C' })
  })

  test('is one-time: a claim from another browser fails and the first session survives', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Dana')
    const sessionToken = await claim(t, token)
    await expect(claim(t, token)).rejects.toEqual(failsWith('INVITE_CLAIMED'))
    expect(await me(t, sessionToken)).toMatchObject({ name: 'Dana' })
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
    const reused = await claim(t, await mintOne(t, 'Erin'))
    await expect(
      claim(t, await mintOne(t, 'Erin 2'), undefined, reused),
    ).rejects.toEqual(failsWith('INVALID_SESSION_TOKEN'))
  })

  test('unknown tokens are invalid', async () => {
    const { t } = await setup()
    expect(await t.query(api.invites.peek, { token: 'nope' })).toEqual({
      status: 'invalid',
    })
    await expect(claim(t, 'nope')).rejects.toEqual(failsWith('INVALID_INVITE'))
    expect(await me(t, 'nope')).toBeNull()
  })

  test('admin-flagged invites create admins', async () => {
    const { t, adminToken } = await setup()
    expect(await me(t, adminToken)).toMatchObject({
      name: 'Yoav',
      isAdmin: true,
    })
  })
})

describe('use another device', () => {
  test('links a second session to the same account without renaming it', async () => {
    const { t } = await setup()
    const phone = await claim(t, await mintOne(t, 'Eve'))
    const { token } = await t.mutation(api.invites.createForSelf, {
      sessionToken: phone,
    })
    expect(await t.query(api.invites.peek, { token })).toEqual({
      status: 'available',
      kind: 'existing',
      name: 'Eve',
      mine: false,
    })
    // The browser that minted it recognises its own link.
    expect(
      await t.query(api.invites.peek, { token, sessionToken: phone }),
    ).toMatchObject({
      mine: true,
    })

    const laptop = await claim(t, token, 'Someone Else')
    expect(await me(t, laptop)).toEqual(await me(t, phone))
    expect((await me(t, laptop))?.name).toBe('Eve')
    // Both devices stay signed in.
    expect(await me(t, phone)).not.toBeNull()
  })

  test('only the newest unclaimed device link works', async () => {
    const { t } = await setup()
    const phone = await claim(t, await mintOne(t, 'Eve'))
    const first = await t.mutation(api.invites.createForSelf, {
      sessionToken: phone,
    })
    const second = await t.mutation(api.invites.createForSelf, {
      sessionToken: phone,
    })
    expect(await t.query(api.invites.peek, { token: first.token })).toEqual({
      status: 'invalid',
    })
    expect(
      await t.query(api.invites.peek, { token: second.token }),
    ).toMatchObject({
      status: 'available',
    })
  })

  test(`keeps at most ${MAX_SESSIONS_PER_USER} sessions, dropping the oldest`, async () => {
    const { t } = await setup()
    const sessions = [await claim(t, await mintOne(t, 'Eve'))]
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) {
      const { token } = await t.mutation(api.invites.createForSelf, {
        sessionToken: sessions[sessions.length - 1],
      })
      sessions.push(await claim(t, token))
    }
    expect(await me(t, sessions[0])).toBeNull()
    for (const sessionToken of sessions.slice(1))
      expect(await me(t, sessionToken)).not.toBeNull()
  })

  test('requires a valid session', async () => {
    const { t } = await setup()
    await expect(
      t.mutation(api.invites.createForSelf, { sessionToken: 'bogus' }),
    ).rejects.toEqual(failsWith('UNAUTHENTICATED'))
  })
})

describe('recovery', () => {
  test('an admin recovery link signs the account out of every other browser', async () => {
    const { t, adminToken } = await setup()
    const lost = await claim(t, await mintOne(t, 'Faye'))
    const faye = (await me(t, lost))!
    const { token } = await t.mutation(api.invites.createForUser, {
      sessionToken: adminToken,
      userId: faye._id,
    })
    // Still signed in until the new link is actually used.
    expect(await me(t, lost)).not.toBeNull()
    const found = await claim(t, token)
    expect(await me(t, found)).toEqual(faye)
    expect(await me(t, lost)).toBeNull()
  })

  test('sign out everywhere invalidates every session but keeps the account', async () => {
    const { t, adminToken } = await setup()
    const phone = await claim(t, await mintOne(t, 'Gus'))
    const { token } = await t.mutation(api.invites.createForSelf, {
      sessionToken: phone,
    })
    const laptop = await claim(t, token)
    const gus = (await me(t, phone))!
    expect(
      await t.mutation(api.users.signOutEverywhere, {
        sessionToken: adminToken,
        userId: gus._id,
      }),
    ).toBe(2)
    expect(await me(t, phone)).toBeNull()
    expect(await me(t, laptop)).toBeNull()
    expect(
      await t.query(api.users.list, { sessionToken: adminToken }),
    ).toContainEqual(expect.objectContaining({ _id: gus._id, name: 'Gus' }))
  })
})

describe('admin gating', () => {
  test('guests cannot mint, list, promote, or sign others out', async () => {
    const { t } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Frank'))
    const frank = (await me(t, sessionToken))!
    const forbidden = failsWith('FORBIDDEN')
    await expect(
      t.mutation(api.invites.create, { sessionToken, labels: ['x'] }),
    ).rejects.toEqual(forbidden)
    await expect(
      t.mutation(api.invites.createForUser, {
        sessionToken,
        userId: frank._id,
      }),
    ).rejects.toEqual(forbidden)
    await expect(t.query(api.invites.list, { sessionToken })).rejects.toEqual(
      forbidden,
    )
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

    await claim(t, minted[0].token, 'Gracie')
    const listed = await t.query(api.invites.list, { sessionToken: adminToken })
    expect(listed.find((i) => i.label === 'Grace')).toMatchObject({
      claimedByName: 'Gracie',
      kind: 'new',
      grantsAdmin: false,
    })
    const heidi = listed.find((i) => i.label === 'Heidi Ho')!
    expect(heidi.claimedAt).toBeNull()

    await t.mutation(api.invites.revoke, {
      sessionToken: adminToken,
      inviteId: heidi._id,
    })
    expect(await t.query(api.invites.peek, { token: minted[1].token })).toEqual(
      {
        status: 'invalid',
      },
    )
    const grace = listed.find((i) => i.label === 'Grace')!
    await expect(
      t.mutation(api.invites.revoke, {
        sessionToken: adminToken,
        inviteId: grace._id,
      }),
    ).rejects.toEqual(failsWith('INVITE_CLAIMED'))
  })

  test('the list tells device links and recovery links apart', async () => {
    const { t, adminToken } = await setup()
    const phone = await claim(t, await mintOne(t, 'Ida'))
    const ida = (await me(t, phone))!
    await t.mutation(api.invites.createForSelf, { sessionToken: phone })
    const listed = await t.query(api.invites.list, { sessionToken: adminToken })
    expect(
      listed.find((i) => i.label === 'Ida' && i.kind === 'device'),
    ).toBeDefined()
    await t.mutation(api.invites.createForUser, {
      sessionToken: adminToken,
      userId: ida._id,
    })
    const relisted = await t.query(api.invites.list, {
      sessionToken: adminToken,
    })
    expect(
      relisted
        .filter((i) => i.label === 'Ida' && !i.claimedAt)
        .map((i) => i.kind),
    ).toEqual(['recovery'])
  })

  test('admins promote and demote others but not themselves', async () => {
    const { t, adminToken } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Ivan'))
    const ivan = (await me(t, sessionToken))!
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
