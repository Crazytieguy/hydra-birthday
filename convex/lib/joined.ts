import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

// When a user first claimed an invite, or null for invited-but-never-joined.
// `joinedAt` is the source of truth, but users created before the invite/user
// unification lack it until `invites:migrateToForUser` backfills; the indexed
// fallback (earliest claim across their invites, matching the migration's
// backfill) keeps every joined-vs-not decision correct during that window.
// The fallback — and with it this whole function body — reduces to
// `user.joinedAt ?? null` in the post-migration cleanup push.
export async function userJoinedAt(
  ctx: QueryCtx,
  user: Doc<'users'>,
): Promise<number | null> {
  if (user.joinedAt !== undefined) return user.joinedAt
  const claimed = await ctx.db
    .query('invites')
    .withIndex('by_claimedByUserId', (q) => q.eq('claimedByUserId', user._id))
    .take(100)
  const claimedAts = claimed
    .map((invite) => invite.claimedAt)
    .filter((at): at is number => at !== undefined)
  return claimedAts.length > 0 ? Math.min(...claimedAts) : null
}

export async function userHasJoined(
  ctx: QueryCtx,
  user: Doc<'users'>,
): Promise<boolean> {
  return (await userJoinedAt(ctx, user)) !== null
}
