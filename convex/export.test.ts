/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import { hourKey } from './lib/slots'
import { newToken } from './lib/tokens'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function join(
  t: ReturnType<typeof convexTest>,
  name: string,
  grantsAdmin = false,
) {
  const [invite] = await t.mutation(internal.invites.createInternal, {
    labels: [name],
    grantsAdmin,
  })
  const sessionToken = newToken()
  await t.mutation(api.invites.claim, { token: invite.token, sessionToken })
  return { sessionToken, userId: invite.userId }
}

describe('export.all', () => {
  test('admins only', async () => {
    const t = convexTest(schema, modules)
    const guest = await join(t, 'Alice')
    await expect(
      t.query(api.export.all, { sessionToken: guest.sessionToken }),
    ).rejects.toThrow()
    await expect(
      t.query(api.export.all, { sessionToken: newToken() }),
    ).rejects.toThrow()
  })

  test('returns every table with ids that join', async () => {
    const t = convexTest(schema, modules)
    const admin = await join(t, 'Yoav', true)
    const alice = await join(t, 'Alice')
    const activityId = await t.run((ctx) =>
      ctx.db.insert('partySessions', {
        title: 'Circling',
        description: 'Sit in a circle.',
        catalogKey: 'circling',
        facilitatorIds: [alice.userId],
      }),
    )
    await t.mutation(api.partySessions.setVote, {
      sessionToken: alice.sessionToken,
      partySessionId: activityId,
      strength: 'strong',
    })
    const blocked = hourKey('2026-09-12', 10)
    await t.mutation(api.availability.save, {
      sessionToken: alice.sessionToken,
      blockedHours: [blocked],
      confirm: true,
    })

    const data = await t.query(api.export.all, {
      sessionToken: admin.sessionToken,
    })
    expect(data.grid.map((day) => day.date)).toEqual([
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
    ])
    expect(data.users.map((user) => [user.name, user.isAdmin])).toEqual([
      ['Yoav', true],
      ['Alice', false],
    ])
    expect(data.activities).toEqual([
      expect.objectContaining({
        _id: activityId,
        title: 'Circling',
        description: 'Sit in a circle.',
        catalogKey: 'circling',
        facilitatorIds: [alice.userId],
        hidden: false,
        proposal: false,
      }),
    ])
    expect(data.votes).toEqual([
      expect.objectContaining({
        userId: alice.userId,
        partySessionId: activityId,
        strength: 'strong',
      }),
    ])
    expect(data.availability).toEqual([
      expect.objectContaining({
        userId: alice.userId,
        blockedHours: [blocked],
        confirmedAt: expect.any(Number),
      }),
    ])
  })
})
