import { ConvexError, v } from 'convex/values'
import { adminQuery, sessionMutation, sessionQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import {
  DISH_MAX_LENGTH,
  FEEDS_MAX,
  MEALS,
  OFFERS_PER_GUEST,
} from './lib/meals'
import { collapseWhitespace } from './lib/names'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

const OFFERS_CAP = 1000

const mealValidator = v.union(
  v.literal('sat-dinner'),
  v.literal('sun-brunch'),
  v.literal('sun-dinner'),
)

const offerArgs = { meal: mealValidator, dish: v.string(), feeds: v.number() }

function validateOffer(args: { dish: string; feeds: number }) {
  const dish = collapseWhitespace(args.dish)
  if (!dish || dish.length > DISH_MAX_LENGTH)
    throw new ConvexError({ code: 'INVALID_DISH' as const })
  if (!Number.isInteger(args.feeds) || args.feeds < 1 || args.feeds > FEEDS_MAX)
    throw new ConvexError({ code: 'INVALID_FEEDS' as const })
  return { dish, feeds: args.feeds }
}

async function allOffers(ctx: QueryCtx) {
  return await takeAll(ctx.db.query('foodOffers'), OFFERS_CAP)
}

// Grouped by meal, names joined, the caller's own rows flagged so the page
// can show edit controls. Everyone sees everyone's offers on purpose.
export const list = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const offers = await allOffers(ctx)
    const users = new Map<Id<'users'>, Doc<'users'> | null>()
    for (const offer of offers) {
      if (!users.has(offer.userId))
        users.set(offer.userId, await ctx.db.get('users', offer.userId))
    }
    return {
      meals: MEALS.map((meal) => ({
        ...meal,
        offers: offers
          .filter((offer) => offer.meal === meal.key)
          .map((offer) => ({
            _id: offer._id,
            name: users.get(offer.userId)?.name ?? '?',
            dish: offer.dish,
            feeds: offer.feeds,
            mine: offer.userId === ctx.user._id,
          })),
      })),
      myCount: offers.filter((offer) => offer.userId === ctx.user._id).length,
    }
  },
})

export const offer = sessionMutation({
  args: offerArgs,
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query('foodOffers')
      .withIndex('by_userId', (q) => q.eq('userId', ctx.user._id))
      .take(OFFERS_PER_GUEST + 1)
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

// Organizer view: every offer with the guest's name, plus a servings total
// per meal for deciding how much to order on top.
export const all = adminQuery({
  args: {},
  handler: async (ctx) => {
    const offers = await allOffers(ctx)
    const rows = await Promise.all(
      offers.map(async (row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        userId: row.userId,
        name: (await ctx.db.get('users', row.userId))?.name ?? '?',
        meal: row.meal,
        dish: row.dish,
        feeds: row.feeds,
      })),
    )
    return MEALS.map((meal) => {
      const mealRows = rows.filter((row) => row.meal === meal.key)
      return {
        ...meal,
        offers: mealRows,
        totalFeeds: mealRows.reduce((sum, row) => sum + row.feeds, 0),
      }
    })
  },
})
