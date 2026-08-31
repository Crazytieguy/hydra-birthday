import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // Anonymous guest accounts. Nobody signs up: an account exists because an
  // invite link was minted for them. `joinedAt` is set once, at the first
  // successful claim; absent means invited but never joined. (Not derivable
  // from sessions — signOutEverywhere deletes those.)
  users: defineTable({
    name: v.string(),
    isAdmin: v.boolean(),
    joinedAt: v.optional(v.number()),
  }),

  // A browser bound to a user. The cookie holds the plaintext token; only its
  // SHA-256 is stored, so a leaked table can't impersonate anyone.
  sessions: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_userId', ['userId']),

  // One-time invite links. Every mint pre-creates the target user, so
  // `forUserId` is always set on new invites (optional only until the prod
  // migration converts pre-unification rows). Claiming binds a browser to the
  // account; the first claim may also rename it (prefilled from the user's
  // minted name). `label` is the mint-time snapshot of the name.
  invites: defineTable({
    tokenHash: v.string(),
    label: v.string(),
    forUserId: v.optional(v.id('users')),
    replacesSessions: v.optional(v.boolean()),
    grantsAdmin: v.optional(v.boolean()),
    createdByUserId: v.optional(v.id('users')),
    claimedAt: v.optional(v.number()),
    claimedByUserId: v.optional(v.id('users')),
    // Lets the same browser retry a claim whose response was lost in transit.
    claimedSessionTokenHash: v.optional(v.string()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_forUserId', ['forUserId'])
    .index('by_claimedByUserId', ['claimedByUserId']),
})
