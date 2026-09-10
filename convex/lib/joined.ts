import type { Doc } from '../_generated/dataModel'

// When a user first claimed an invite, or null for invited-but-never-joined.
export const userJoinedAt = (user: Doc<'users'>): number | null =>
  user.joinedAt ?? null

export const userHasJoined = (user: Doc<'users'>): boolean =>
  user.joinedAt !== undefined
