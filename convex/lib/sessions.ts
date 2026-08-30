import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

// A guest can be signed in on this many browsers at once; past that the
// oldest session is dropped, so "use another device" can't grow unboundedly.
export const MAX_SESSIONS_PER_USER = 10

const userSessions = (ctx: MutationCtx, userId: Id<'users'>) =>
  ctx.db.query('sessions').withIndex('by_userId', (q) => q.eq('userId', userId))

export async function deleteSessions(ctx: MutationCtx, userId: Id<'users'>) {
  let deleted = 0
  for await (const session of userSessions(ctx, userId)) {
    await ctx.db.delete('sessions', session._id)
    deleted++
  }
  return deleted
}

export async function insertSession(
  ctx: MutationCtx,
  userId: Id<'users'>,
  tokenHash: string,
) {
  await ctx.db.insert('sessions', { userId, tokenHash })
  // Index order is creation time, so the first row is the oldest.
  const sessions = await userSessions(ctx, userId).take(
    MAX_SESSIONS_PER_USER + 1,
  )
  if (sessions.length > MAX_SESSIONS_PER_USER)
    await ctx.db.delete('sessions', sessions[0]._id)
}
