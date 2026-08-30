import { ConvexError, v } from 'convex/values'
import {
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import { mutation, query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { hashToken } from './tokens'

// Auth is "token as argument": the browser's session cookie is passed to every
// gated function as `sessionToken`. These builders resolve it to `ctx.user`
// (and `ctx.session`) and strip it from the handler's args.

export async function findSessionUser(ctx: QueryCtx, sessionToken: string) {
  const tokenHash = await hashToken(sessionToken)
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique()
  if (!session) return null
  const user = await ctx.db.get('users', session.userId)
  if (!user) return null
  return { session, user }
}

async function requireSessionUser(ctx: QueryCtx, sessionToken: string) {
  const found = await findSessionUser(ctx, sessionToken)
  if (!found) throw new ConvexError({ code: 'UNAUTHENTICATED' as const })
  return found
}

async function requireAdmin(ctx: QueryCtx, sessionToken: string) {
  const found = await requireSessionUser(ctx, sessionToken)
  if (!found.user.isAdmin) throw new ConvexError({ code: 'FORBIDDEN' as const })
  return found
}

const sessionArgs = { sessionToken: v.string() }

export const sessionQuery = customQuery(query, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => ({
    ctx: await requireSessionUser(ctx, sessionToken),
    args: {},
  }),
})

export const sessionMutation = customMutation(mutation, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => ({
    ctx: await requireSessionUser(ctx, sessionToken),
    args: {},
  }),
})

export const adminQuery = customQuery(query, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => ({
    ctx: await requireAdmin(ctx, sessionToken),
    args: {},
  }),
})

export const adminMutation = customMutation(mutation, {
  args: sessionArgs,
  input: async (ctx, { sessionToken }) => ({
    ctx: await requireAdmin(ctx, sessionToken),
    args: {},
  }),
})
