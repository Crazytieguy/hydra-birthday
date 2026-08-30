import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // Anonymous guest accounts. Nobody signs up: an account exists because an
  // invite link was claimed.
  users: defineTable({
    name: v.string(),
    isAdmin: v.boolean(),
  }),

  // A browser bound to a user. The cookie holds the plaintext token; only its
  // SHA-256 is stored, so a leaked table can't impersonate anyone.
  sessions: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_userId', ['userId']),

  // One-time invite links. With `forUserId` set the link signs a device into
  // an existing account (a guest's own "use another device" link, or an admin
  // recovery link that also signs the account out everywhere else); otherwise
  // claiming it creates a new user named by the guest (prefilled from `label`).
  invites: defineTable({
    tokenHash: v.string(),
    label: v.optional(v.string()),
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
    .index('by_forUserId', ['forUserId']),
})
