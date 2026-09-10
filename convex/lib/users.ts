import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

// Every distinct user among `ids`, fetched once each, in parallel. Missing
// users map to null so callers can fall back without a second lookup.
export async function usersById(ctx: QueryCtx, ids: Iterable<Id<'users'>>) {
  const unique = [...new Set(ids)]
  const users = await Promise.all(unique.map((id) => ctx.db.get('users', id)))
  return new Map(unique.map((id, i) => [id, users[i]]))
}

// A session's facilitators by name, skipping any that no longer exist.
export const facilitatorNames = (
  session: Doc<'partySessions'>,
  users: Map<Id<'users'>, Doc<'users'> | null>,
) =>
  session.facilitatorIds.flatMap((id) => {
    const user = users.get(id)
    return user ? [user.name] : []
  })
