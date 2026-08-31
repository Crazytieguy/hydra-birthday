import { ConvexError, v } from 'convex/values'
import { sessionMutation, sessionQuery } from './lib/auth'
import { enabledHourKeys } from './lib/slots'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

export const myAvailabilityQuery = (ctx: QueryCtx, userId: Id<'users'>) =>
  ctx.db
    .query('availability')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()

export const mine = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const row = await myAvailabilityQuery(ctx, ctx.user._id)
    return row
      ? { blockedHours: row.blockedHours, confirmedAt: row.confirmedAt ?? null }
      : null
  },
})

// The guest crosses out hours they can't make; everything else stays open.
// `confirm: true` marks the grid as reviewed (write-once — later edits never
// un-confirm, per the spec: unconfirmed means missing data, not busy).
export const save = sessionMutation({
  args: { blockedHours: v.array(v.string()), confirm: v.boolean() },
  handler: async (ctx, { blockedHours, confirm }) => {
    const valid = enabledHourKeys()
    for (const key of blockedHours) {
      if (!valid.has(key))
        throw new ConvexError({ code: 'INVALID_HOURS' as const })
    }
    const hours = [...new Set(blockedHours)].sort()
    const existing = await myAvailabilityQuery(ctx, ctx.user._id)
    if (existing) {
      await ctx.db.patch('availability', existing._id, {
        blockedHours: hours,
        ...(confirm && existing.confirmedAt === undefined
          ? { confirmedAt: Date.now() }
          : {}),
      })
    } else {
      await ctx.db.insert('availability', {
        userId: ctx.user._id,
        blockedHours: hours,
        confirmedAt: confirm ? Date.now() : undefined,
      })
    }
    return null
  },
})
