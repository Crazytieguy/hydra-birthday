import { ConvexError, v } from 'convex/values'
import {
  customMutation,
  customQuery,
} from 'convex-helpers/server/customFunctions'
import { mutation, query } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import { hashToken } from './tokens'

// Auth is "token as argument": the browser's session cookie is passed to every
// gated function as `sessionToken`. These builders resolve it to `ctx.user`
// and strip it from the handler's args.

export function findSessionByHash(ctx: QueryCtx, tokenHash: string) {
  return ctx.db
    .query('sessions')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique()
}

export async function findSessionUser(
  ctx: QueryCtx,
  sessionToken: string,
): Promise<Doc<'users'> | null> {
  const session = await findSessionByHash(ctx, await hashToken(sessionToken))
  return session ? await ctx.db.get('users', session.userId) : null
}

async function requireUser(ctx: QueryCtx, sessionToken: string) {
  const user = await findSessionUser(ctx, sessionToken)
  if (!user) throw new ConvexError({ code: 'UNAUTHENTICATED' as const })
  return user
}

async function requireAdmin(ctx: QueryCtx, sessionToken: string) {
  const user = await requireUser(ctx, sessionToken)
  if (!user.isAdmin) throw new ConvexError({ code: 'FORBIDDEN' as const })
  return user
}

const gate = (
  check: (ctx: QueryCtx, sessionToken: string) => Promise<Doc<'users'>>,
) => ({
  args: { sessionToken: v.string() },
  input: async (ctx: QueryCtx, { sessionToken }: { sessionToken: string }) => ({
    ctx: { user: await check(ctx, sessionToken) },
    args: {},
  }),
})

export const sessionQuery = customQuery(query, gate(requireUser))
export const sessionMutation = customMutation(mutation, gate(requireUser))
export const adminQuery = customQuery(query, gate(requireAdmin))
export const adminMutation = customMutation(mutation, gate(requireAdmin))
