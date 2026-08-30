/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
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
    expect(await t.query(api.users.me, { sessionToken })).toMatchObject({
      name: 'Alice B',
      isAdmin: false,
    })
    expect(await t.query(api.invites.peek, { token })).toEqual({
      status: 'claimed',
    })
  })

  test('falls back to the label as the name', async () => {
    const { t } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Bob'))
    expect(await t.query(api.users.me, { sessionToken })).toMatchObject({
      name: 'Bob',
    })
  })

  test('rejects empty and overlong names', async () => {
    const { t } = await setup()
    await expect(claim(t, await mintOne(t, 'Carol'), '   ')).rejects.toEqual(
      failsWith('INVALID_NAME'),
    )
    await expect(
      claim(t, await mintOne(t, 'Carol'), 'x'.repeat(61)),
    ).rejects.toEqual(failsWith('INVALID_NAME'))
  })

  test('is one-time: a claim from another browser fails and the first session survives', async () => {
    const { t } = await setup()
    const token = await mintOne(t, 'Dana')
    const sessionToken = await claim(t, token)
    await expect(claim(t, token)).rejects.toEqual(failsWith('INVITE_CLAIMED'))
    expect(await t.query(api.users.me, { sessionToken })).toMatchObject({
      name: 'Dana',
    })
  })

  test('retrying with the same session secret is idempotent (lost response)', async () => {
    const { t, adminToken } = await setup()
    const token = await mintOne(t, 'Dana')
    const secret = newToken()
    await claim(t, token, 'Dana', secret)
    await claim(t, token, 'Dana', secret)
    expect(await t.query(api.users.me, { sessionToken: secret })).toMatchObject(
      { name: 'Dana' },
    )
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
    expect(await t.query(api.users.me, { sessionToken: 'nope' })).toBeNull()
  })

  test('admin-flagged invites create admins', async () => {
    const { t, adminToken } = await setup()
    expect(
      await t.query(api.users.me, { sessionToken: adminToken }),
    ).toMatchObject({
      name: 'Yoav',
      isAdmin: true,
    })
  })
})

describe('sign in on another device', () => {
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
    })

    const laptop = await claim(t, token, 'Someone Else')
    const onPhone = await t.query(api.users.me, { sessionToken: phone })
    const onLaptop = await t.query(api.users.me, { sessionToken: laptop })
    expect(onLaptop).toEqual(onPhone)
    expect(onLaptop?.name).toBe('Eve')
    expect(laptop).not.toBe(phone)
  })

  test('requires a valid session', async () => {
    const { t } = await setup()
    await expect(
      t.mutation(api.invites.createForSelf, { sessionToken: 'bogus' }),
    ).rejects.toEqual(failsWith('UNAUTHENTICATED'))
  })

  test('admins can mint a recovery link for any user', async () => {
    const { t, adminToken } = await setup()
    const lost = await claim(t, await mintOne(t, 'Faye'))
    const faye = (await t.query(api.users.me, { sessionToken: lost }))!
    const { token } = await t.mutation(api.invites.createForUser, {
      sessionToken: adminToken,
      userId: faye._id,
    })
    const found = await claim(t, token)
    expect(await t.query(api.users.me, { sessionToken: found })).toEqual(faye)
  })
})

describe('admin gating', () => {
  test('guests cannot mint, list, or promote', async () => {
    const { t } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Frank'))
    const me = (await t.query(api.users.me, { sessionToken }))!
    await expect(
      t.mutation(api.invites.create, { sessionToken, labels: ['x'] }),
    ).rejects.toEqual(failsWith('FORBIDDEN'))
    await expect(
      t.mutation(api.invites.createForUser, { sessionToken, userId: me._id }),
    ).rejects.toEqual(failsWith('FORBIDDEN'))
    await expect(t.query(api.invites.list, { sessionToken })).rejects.toEqual(
      failsWith('FORBIDDEN'),
    )
    await expect(t.query(api.users.list, { sessionToken })).rejects.toEqual(
      failsWith('FORBIDDEN'),
    )
    await expect(
      t.mutation(api.users.setAdmin, {
        sessionToken,
        userId: me._id,
        isAdmin: true,
      }),
    ).rejects.toEqual(failsWith('FORBIDDEN'))
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

  test('admins promote and demote others but not themselves', async () => {
    const { t, adminToken } = await setup()
    const sessionToken = await claim(t, await mintOne(t, 'Ivan'))
    const ivan = (await t.query(api.users.me, { sessionToken }))!
    await t.mutation(api.users.setAdmin, {
      sessionToken: adminToken,
      userId: ivan._id,
      isAdmin: true,
    })
    expect(await t.query(api.users.me, { sessionToken })).toMatchObject({
      isAdmin: true,
    })
    expect(await t.query(api.users.list, { sessionToken })).toHaveLength(2)

    const admin = (await t.query(api.users.me, { sessionToken: adminToken }))!
    await expect(
      t.mutation(api.users.setAdmin, {
        sessionToken: adminToken,
        userId: admin._id,
        isAdmin: false,
      }),
    ).rejects.toEqual(failsWith('CANNOT_DEMOTE_SELF'))
  })
})
