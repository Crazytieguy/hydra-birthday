import type { QueryCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'

// Whether a user has ever claimed an invite (as opposed to existing only
// because a link was minted for them). `joinedAt` is the source of truth, but
// users created before the invite/user unification lack it until
// `invites:migrateToForUser` backfills; the indexed fallback keeps every
// joined-vs-not decision correct during that window. The fallback branch goes
// away in the post-migration cleanup push.
export async function userHasJoined(
  ctx: QueryCtx,
  user: Doc<'users'>,
): Promise<boolean> {
  if (user.joinedAt !== undefined) return true
  const claimed = await ctx.db
    .query('invites')
    .withIndex('by_claimedByUserId', (q) => q.eq('claimedByUserId', user._id))
    .first()
  return claimed !== null
}
