import type { MutationCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

// A guest can be signed in on this many browsers at once; the oldest session
// is dropped past that, so "use another device" can't grow without bound.
export const MAX_SESSIONS_PER_USER = 10

export async function deleteSessions(ctx: MutationCtx, userId: Id<'users'>) {
  const sessions = await ctx.db
    .query('sessions')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(MAX_SESSIONS_PER_USER + 1)
  for (const session of sessions) await ctx.db.delete('sessions', session._id)
  return sessions.length
}

export async function insertSession(
  ctx: MutationCtx,
  userId: Id<'users'>,
  tokenHash: string,
) {
  await ctx.db.insert('sessions', { userId, tokenHash })
  // Oldest first; drop what exceeds the cap.
  const sessions = await ctx.db
    .query('sessions')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .take(MAX_SESSIONS_PER_USER + 1)
  for (const session of sessions.slice(
    0,
    Math.max(0, sessions.length - MAX_SESSIONS_PER_USER),
  )) {
    await ctx.db.delete('sessions', session._id)
  }
}
