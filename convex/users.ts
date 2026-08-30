import { ConvexError, v } from 'convex/values'
import { internalMutation, query } from './_generated/server'
import {
  adminMutation,
  adminQuery,
  findSessionUser,
  sessionMutation,
} from './lib/auth'
import { normalizeName } from './lib/names'
import { deleteSessions } from './lib/sessions'

// The signed-in guest, or null for a missing/unknown session token. Never
// throws: the `_guest` layout uses null to send people to /welcome.
export const me = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const user = await findSessionUser(ctx, sessionToken)
    return user && { _id: user._id, name: user.name, isAdmin: user.isAdmin }
  },
})

export const updateName = sessionMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await ctx.db.patch('users', ctx.user._id, { name: normalizeName(name) })
    return null
  },
})

export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query('users').order('desc').take(1000)
    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      isAdmin: user.isAdmin,
      createdAt: user._creationTime,
    }))
  },
})

export const setAdmin = adminMutation({
  args: { userId: v.id('users'), isAdmin: v.boolean() },
  handler: async (ctx, { userId, isAdmin }) => {
    if (userId === ctx.user._id && !isAdmin) {
      throw new ConvexError({ code: 'CANNOT_DEMOTE_SELF' as const })
    }
    const user = await ctx.db.get('users', userId)
    if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
    await ctx.db.patch('users', userId, { isAdmin })
    return null
  },
})

// Signs a guest out of every browser (a lost phone, a link that reached the
// wrong person). Their account and name survive; a recovery link gets them back.
export const signOutEverywhere = adminMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get('users', userId)
    if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
    return await deleteSessions(ctx, userId)
  },
})

// Escape hatch when no admin can reach the admin page, e.g. from the dashboard
// or `bunx convex run users:setAdminInternal '{"userId":"...","isAdmin":true}' --prod`.
export const setAdminInternal = internalMutation({
  args: { userId: v.id('users'), isAdmin: v.boolean() },
  handler: async (ctx, { userId, isAdmin }) => {
    await ctx.db.patch('users', userId, { isAdmin })
    return null
  },
})
