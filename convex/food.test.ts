/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'
import { api, internal } from './_generated/api'
import { OFFERS_PER_GUEST } from './lib/meals'
import { newToken } from './lib/tokens'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

type T = ReturnType<typeof convexTest>

async function join(t: T, label: string, grantsAdmin = false) {
  const [invite] = await t.mutation(internal.invites.createInternal, {
    labels: [label],
    grantsAdmin,
  })
  const sessionToken = newToken()
  await t.mutation(api.invites.claim, { token: invite.token, sessionToken })
  return sessionToken
}

const failsWith = (code: string) => expect.objectContaining({ data: { code } })

const stew = { meal: 'sat-dinner' as const, dish: '  Lentil   stew ' }

describe('food offers', () => {
  test('a guest offers a dish; everyone sees it, only the owner sees it as theirs', async () => {
    const t = convexTest(schema, modules)
    const alice = await join(t, 'Alice')
    const bob = await join(t, 'Bob')
    await t.mutation(api.food.offer, { sessionToken: alice, ...stew })

    const forAlice = await t.query(api.food.list, { sessionToken: alice })
    expect(await t.query(api.food.myCount, { sessionToken: alice })).toBe(1)
    expect(forAlice.meals.find((m) => m.key === 'sat-dinner')!.offers).toEqual([
      expect.objectContaining({
        name: 'Alice',
        dish: 'Lentil stew',
        mine: true,
      }),
    ])
    const forBob = await t.query(api.food.list, { sessionToken: bob })
    expect(await t.query(api.food.myCount, { sessionToken: bob })).toBe(0)
    expect(
      forBob.meals.find((m) => m.key === 'sat-dinner')!.offers[0],
    ).toMatchObject({ mine: false })
  })

  test('only the owner can edit or remove an offer', async () => {
    const t = convexTest(schema, modules)
    const alice = await join(t, 'Alice')
    const bob = await join(t, 'Bob')
    const offerId = await t.mutation(api.food.offer, {
      sessionToken: alice,
      ...stew,
    })
    await expect(
      t.mutation(api.food.update, {
        sessionToken: bob,
        offerId,
        ...stew,
        dish: 'Hijacked',
      }),
    ).rejects.toEqual(failsWith('NOT_FOUND'))
    await expect(
      t.mutation(api.food.remove, { sessionToken: bob, offerId }),
    ).rejects.toEqual(failsWith('NOT_FOUND'))

    await t.mutation(api.food.update, {
      sessionToken: alice,
      offerId,
      meal: 'sun-brunch',
      dish: 'Banana bread',
    })
    const listed = await t.query(api.food.list, { sessionToken: alice })
    expect(listed.meals.find((m) => m.key === 'sat-dinner')!.offers).toEqual([])
    expect(
      listed.meals.find((m) => m.key === 'sun-brunch')!.offers[0],
    ).toMatchObject({
      dish: 'Banana bread',
    })
    await t.mutation(api.food.remove, { sessionToken: alice, offerId })
    expect(await t.query(api.food.myCount, { sessionToken: alice })).toBe(0)
  })

  test('rejects blank dishes, silly serving counts, and too many offers', async () => {
    const t = convexTest(schema, modules)
    const alice = await join(t, 'Alice')
    await expect(
      t.mutation(api.food.offer, { sessionToken: alice, ...stew, dish: '  ' }),
    ).rejects.toEqual(failsWith('INVALID_DISH'))
    for (let i = 0; i < OFFERS_PER_GUEST; i++)
      await t.mutation(api.food.offer, { sessionToken: alice, ...stew })
    await expect(
      t.mutation(api.food.offer, { sessionToken: alice, ...stew }),
    ).rejects.toEqual(failsWith('TOO_MANY_OFFERS'))
  })

  test('the admin view totals servings per meal and guests cannot read it', async () => {
    const t = convexTest(schema, modules)
    const admin = await join(t, 'Yoav', true)
    const alice = await join(t, 'Alice')
    await t.mutation(api.food.offer, { sessionToken: alice, ...stew })
    await t.mutation(api.food.offer, {
      sessionToken: admin,
      ...stew,
      dish: 'Brownies',
    })
    const meals = await t.query(api.food.all, { sessionToken: admin })
    const satDinner = meals.find((m) => m.key === 'sat-dinner')!
    expect(satDinner).toMatchObject({ key: 'sat-dinner' })
    expect(satDinner.offers.map((o) => o.name).sort()).toEqual([
      'Alice',
      'Yoav',
    ])
    await expect(
      t.query(api.food.all, { sessionToken: alice }),
    ).rejects.toEqual(failsWith('FORBIDDEN'))
  })
})
