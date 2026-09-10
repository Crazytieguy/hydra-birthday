import { ConvexError, v } from 'convex/values'
import { adminQuery, sessionMutation, sessionQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { DISH_MAX_LENGTH, MEALS, OFFERS_PER_GUEST } from './lib/meals'
import { collapseWhitespace } from './lib/names'
import { usersById } from './lib/users'
import { mealValidator } from './schema'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

const OFFERS_CAP = 1000

const offerArgs = { meal: mealValidator, dish: v.string() }

function validateOffer(args: { dish: string }) {
  const dish = collapseWhitespace(args.dish)
  if (!dish || dish.length > DISH_MAX_LENGTH)
    throw new ConvexError({ code: 'INVALID_DISH' as const })
  return { dish }
}

const allOffers = (ctx: QueryCtx) =>
  takeAll(ctx.db.query('foodOffers'), OFFERS_CAP)

// Capped one past the limit: enough to enforce it, never the whole table.
const myOffers = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db
    .query('foodOffers')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(OFFERS_PER_GUEST + 1)

// Grouped by meal, names joined, the caller's own rows flagged so the page
// can show edit controls. Everyone sees everyone's offers on purpose.
export const list = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const offers = await allOffers(ctx)
    const users = await usersById(
      ctx,
      offers.map((offer) => offer.userId),
    )
    return {
      meals: MEALS.map((meal) => ({
        ...meal,
        offers: offers
          .filter((offer) => offer.meal === meal.key)
          .map((offer) => ({
            _id: offer._id,
            meal: offer.meal,
            name: users.get(offer.userId)?.name ?? '?',
            dish: offer.dish,
            mine: offer.userId === ctx.user._id,
          })),
      })),
    }
  },
})

// How many dishes the caller is bringing, for the hub's step row.
export const myCount = sessionQuery({
  args: {},
  handler: async (ctx) => (await myOffers(ctx, ctx.user._id)).length,
})

export const offer = sessionMutation({
  args: offerArgs,
  handler: async (ctx, args) => {
    const mine = await myOffers(ctx, ctx.user._id)
    if (mine.length >= OFFERS_PER_GUEST)
      throw new ConvexError({ code: 'TOO_MANY_OFFERS' as const })
    return await ctx.db.insert('foodOffers', {
      userId: ctx.user._id,
      meal: args.meal,
      ...validateOffer(args),
    })
  },
})

async function getMineOrThrow(
  ctx: MutationCtx,
  userId: Id<'users'>,
  offerId: Id<'foodOffers'>,
) {
  const row = await ctx.db.get('foodOffers', offerId)
  // Someone else's offer reads as missing: nothing to learn from probing ids.
  if (!row || row.userId !== userId)
    throw new ConvexError({ code: 'NOT_FOUND' as const })
  return row
}

export const update = sessionMutation({
  args: { offerId: v.id('foodOffers'), ...offerArgs },
  handler: async (ctx, { offerId, ...args }) => {
    await getMineOrThrow(ctx, ctx.user._id, offerId)
    await ctx.db.patch('foodOffers', offerId, {
      meal: args.meal,
      ...validateOffer(args),
    })
    return null
  },
})

export const remove = sessionMutation({
  args: { offerId: v.id('foodOffers') },
  handler: async (ctx, { offerId }) => {
    await getMineOrThrow(ctx, ctx.user._id, offerId)
    await ctx.db.delete('foodOffers', offerId)
    return null
  },
})

// Organizer view: every offer with the guest's name, grouped by meal.
export const all = adminQuery({
  args: {},
  handler: async (ctx) => {
    const offers = await allOffers(ctx)
    const users = await usersById(
      ctx,
      offers.map((row) => row.userId),
    )
    const rows = offers.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      userId: row.userId,
      name: users.get(row.userId)?.name ?? '?',
      meal: row.meal,
      dish: row.dish,
    }))
    return MEALS.map((meal) => ({
      ...meal,
      offers: rows.filter((row) => row.meal === meal.key),
    }))
  },
})
