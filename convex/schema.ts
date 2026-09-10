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
    // Set once when the guest says they're done voting. Absence of vote rows
    // can't distinguish "reviewed, wants none" from "never opened the screen".
    votesConfirmedAt: v.optional(v.number()),
  }),

  // A browser bound to a user. The cookie holds the plaintext token; only its
  // SHA-256 is stored, so a leaked table can't impersonate anyone.
  sessions: defineTable({
    userId: v.id('users'),
    tokenHash: v.string(),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_userId', ['userId']),

  // Invite links. Every mint pre-creates the target user, so `forUserId` is
  // always set on new invites (optional only until the prod migration
  // converts pre-unification rows). Claiming binds a browser to the account;
  // the first claim may also rename it (prefilled from the user's minted
  // name), later claims sign further browsers in. `label` is the mint-time
  // snapshot of the name.
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
    // Set when a recovery link is first used or an admin signs the account
    // out everywhere: the link stops signing anyone in. Rows stay for history.
    revokedAt: v.optional(v.number()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_forUserId', ['forUserId'])
    .index('by_claimedByUserId', ['claimedByUserId']),

  // The party programming guests vote on. Named partySessions because
  // `sessions` is taken by auth browser sessions; UI copy still says
  // "session". `catalogKey` is the immutable seed identity (absent for
  // admin-created rows) so reseeding can never clobber admin edits.
  partySessions: defineTable({
    catalogKey: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    facilitatorIds: v.array(v.id('users')),
    needsFacilitator: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
    // Set on every unhide; absent for rows visible from birth (readers fall
    // back to _creationTime). Drives the "new since you voted" split.
    visibleSince: v.optional(v.number()),
    // True only for guest-proposed rows (written by propose, preserved by
    // admin edits). Provenance for withdrawal: admin- and seed-created rows
    // must never become guest-deletable.
    proposal: v.optional(v.boolean()),
  }).index('by_catalogKey', ['catalogKey']),

  // One row per (guest, party session). No row = wouldn't attend.
  votes: defineTable({
    userId: v.id('users'),
    partySessionId: v.id('partySessions'),
    strength: v.union(v.literal('regular'), v.literal('strong')),
  })
    .index('by_userId_and_partySessionId', ['userId', 'partySessionId'])
    .index('by_partySessionId', ['partySessionId']),

  // One row per guest. `blockedHours` holds hour keys (lib/slots.ts) the
  // guest crossed out; bounded by the enabled grid (~34 keys). Unconfirmed
  // rows are missing data, not "free all weekend".
  availability: defineTable({
    userId: v.id('users'),
    blockedHours: v.array(v.string()),
    confirmedAt: v.optional(v.number()),
  }).index('by_userId', ['userId']),

  // The guest-facing schedule, replaced wholesale by `bun run schedule:sync`
  // from the organizers' board. Times are minutes from local midnight; `end`
  // may pass 1440 for a block that runs past midnight. Activities usually
  // point at a partySession (title, description, facilitators, votes come
  // from there); a title-only activity (no partySessionId) is allowed for
  // things nobody voted on, like morning yoga. Frames are the meals, the
  // opening, the party: full-width bands with just a label.
  scheduleEntries: defineTable({
    day: v.string(),
    start: v.number(),
    end: v.number(),
    kind: v.union(v.literal('activity'), v.literal('frame')),
    partySessionId: v.optional(v.id('partySessions')),
    title: v.optional(v.string()),
    frameLabel: v.optional(v.string()),
    // A long come-and-go activity, drawn as a narrow ribbon beside the lanes.
    ribbon: v.optional(v.boolean()),
    note: v.optional(v.string()),
  }).index('by_day', ['day']),

  // "I can bring X for meal Y, it feeds N." Everyone sees everyone's offers
  // (deliberately, so people don't all bring hummus); only the owner edits.
  foodOffers: defineTable({
    userId: v.id('users'),
    meal: v.union(
      v.literal('sat-dinner'),
      v.literal('sun-brunch'),
      v.literal('sun-dinner'),
    ),
    dish: v.string(),
    feeds: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_meal', ['meal']),
})
