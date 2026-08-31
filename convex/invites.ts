import { ConvexError, v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  adminMutation,
  adminQuery,
  findSessionByHash,
  findSessionUser,
  sessionMutation,
} from './lib/auth'
import { takeAll } from './lib/collect'
import { userHasJoined } from './lib/joined'
import { collapseWhitespace, normalizeName } from './lib/names'
import { deleteSessions, insertSession } from './lib/sessions'
import { MIN_SESSION_TOKEN_LENGTH, hashToken, newToken } from './lib/tokens'

async function findInvite(ctx: QueryCtx, token: string) {
  const tokenHash = await hashToken(token)
  return await ctx.db
    .query('invites')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique()
}

// What an invite page shows before the guest taps "Join". Public by design:
// the token itself is the secret. Reading never consumes the invite, so link
// previews (Signal, WhatsApp, Partiful) can't burn it. `sessionToken` (the
// browser's current cookie, if any) identifies the viewer so the page can say
// who they already are and recognise a link they own.
export const peek = query({
  args: { token: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, { token, sessionToken }) => {
    const invite = await findInvite(ctx, token)
    if (!invite) return { status: 'invalid' as const }
    const viewer = sessionToken
      ? await findSessionUser(ctx, sessionToken)
      : null
    const isViewer = (userId: Id<'users'> | undefined) =>
      viewer !== null && viewer._id === userId
    if (invite.claimedAt !== undefined) {
      return {
        status: 'claimed' as const,
        mine: isViewer(invite.claimedByUserId),
      }
    }
    const viewerInfo = viewer && { name: viewer.name }
    if (invite.forUserId) {
      const user = await ctx.db.get('users', invite.forUserId)
      if (!user) return { status: 'invalid' as const }
      // A first-time link keeps the editable-name UI; a link into a joined
      // account (device, recovery) signs in under the existing name.
      if (!(await userHasJoined(ctx, user))) {
        return {
          status: 'available' as const,
          kind: 'new' as const,
          label: user.name,
          viewer: viewerInfo,
        }
      }
      return {
        status: 'available' as const,
        kind: 'existing' as const,
        name: user.name,
        mine: isViewer(user._id),
        viewer: viewerInfo,
      }
    }
    // Legacy invite minted before users were pre-created; goes away once
    // migrateToForUser has run in prod.
    return {
      status: 'available' as const,
      kind: 'new' as const,
      label: invite.label,
      viewer: viewerInfo,
    }
  },
})

// Consume a one-time invite and bind the caller's browser to an account.
// The browser generates `sessionToken` (and keeps it until the cookie is
// stored), so a retry after a lost response is a no-op instead of a burned
// link. Convex serializes mutations: two devices racing on one link can't
// both win.
export const claim = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    sessionToken: v.string(),
  },
  handler: async (ctx, { token, name, sessionToken }) => {
    if (sessionToken.length < MIN_SESSION_TOKEN_LENGTH) {
      throw new ConvexError({ code: 'INVALID_SESSION_TOKEN' as const })
    }
    const invite = await findInvite(ctx, token)
    if (!invite) throw new ConvexError({ code: 'INVALID_INVITE' as const })
    const tokenHash = await hashToken(sessionToken)
    if (invite.claimedAt !== undefined) {
      if (invite.claimedSessionTokenHash === tokenHash) return null
      throw new ConvexError({ code: 'INVITE_CLAIMED' as const })
    }
    if (await findSessionByHash(ctx, tokenHash)) {
      throw new ConvexError({ code: 'INVALID_SESSION_TOKEN' as const })
    }

    let userId: Id<'users'>
    if (invite.forUserId) {
      const existing = await ctx.db.get('users', invite.forUserId)
      if (!existing) throw new ConvexError({ code: 'INVALID_INVITE' as const })
      userId = existing._id
      if (!(await userHasJoined(ctx, existing))) {
        // First claim: the guest may pick their own name, and the account is
        // now joined. Later links into the account never rename it.
        await ctx.db.patch('users', userId, {
          name: normalizeName(name ?? existing.name),
          joinedAt: Date.now(),
        })
      }
      if (invite.replacesSessions) await deleteSessions(ctx, userId)
    } else {
      // Legacy invite minted before users were pre-created.
      userId = await ctx.db.insert('users', {
        name: normalizeName(name ?? invite.label),
        isAdmin: invite.grantsAdmin === true,
        joinedAt: Date.now(),
      })
    }

    await insertSession(ctx, userId, tokenHash)
    await ctx.db.patch('invites', invite._id, {
      claimedAt: Date.now(),
      claimedByUserId: userId,
      claimedSessionTokenHash: tokenHash,
    })
    return null
  },
})

const mintArgs = {
  labels: v.array(v.string()),
  grantsAdmin: v.optional(v.boolean()),
}

// One invite per non-blank label. Each mint pre-creates the user, so the
// account exists (and can be linked as a facilitator) before the link is ever
// opened. The tokens exist in plaintext only here.
export async function mint(
  ctx: MutationCtx,
  args: {
    labels: string[]
    grantsAdmin?: boolean
    createdByUserId?: Id<'users'>
  },
) {
  const minted: Array<{ label: string; token: string; userId: Id<'users'> }> =
    []
  for (const raw of args.labels) {
    const label = collapseWhitespace(raw)
    if (!label) continue
    const userId = await ctx.db.insert('users', {
      name: normalizeName(label),
      isAdmin: args.grantsAdmin === true,
    })
    const token = newToken()
    await ctx.db.insert('invites', {
      tokenHash: await hashToken(token),
      label,
      forUserId: userId,
      grantsAdmin: args.grantsAdmin ? true : undefined,
      createdByUserId: args.createdByUserId,
    })
    minted.push({ label, token, userId })
  }
  return minted
}

export const create = adminMutation({
  args: mintArgs,
  handler: async (ctx, args) =>
    await mint(ctx, { ...args, createdByUserId: ctx.user._id }),
})

// `bun run invite` — see scripts/invite.ts.
export const createInternal = internalMutation({
  args: mintArgs,
  handler: async (ctx, args) => await mint(ctx, args),
})

// A link into an existing account. Only one unclaimed one exists per user at
// a time: minting a new one forgets the previous.
async function mintForUser(
  ctx: MutationCtx,
  userId: Id<'users'>,
  createdByUserId: Id<'users'>,
  replacesSessions: boolean,
) {
  const user = await ctx.db.get('users', userId)
  if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
  const previous = await ctx.db
    .query('invites')
    .withIndex('by_forUserId', (q) => q.eq('forUserId', userId))
    .take(100)
  for (const invite of previous) {
    if (invite.claimedAt === undefined)
      await ctx.db.delete('invites', invite._id)
  }
  const token = newToken()
  await ctx.db.insert('invites', {
    tokenHash: await hashToken(token),
    label: user.name,
    forUserId: user._id,
    replacesSessions: replacesSessions || undefined,
    createdByUserId,
  })
  return { token }
}

// "Use another device": a one-time link into the caller's own account.
export const createForSelf = sessionMutation({
  args: {},
  handler: async (ctx) =>
    await mintForUser(ctx, ctx.user._id, ctx.user._id, false),
})

// Admin recovery for a guest who lost the browser their link was claimed on.
// Claiming it signs the account out everywhere else, so the lost device is
// locked out at the same moment the guest is back in. Only for guests who
// actually joined — replacing a never-used first link is `reissueInvite`.
export const createForUser = adminMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get('users', userId)
    if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (!(await userHasJoined(ctx, user)))
      throw new ConvexError({ code: 'NOT_JOINED' as const })
    return await mintForUser(ctx, userId, ctx.user._id, true)
  },
})

// Replace the first-time link of a guest who hasn't joined yet (link lost, or
// sent to the wrong person). The previous link stops working; nothing else
// about the account changes.
export const reissueInvite = adminMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get('users', userId)
    if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (await userHasJoined(ctx, user))
      throw new ConvexError({ code: 'ALREADY_JOINED' as const })
    return await mintForUser(ctx, userId, ctx.user._id, false)
  },
})

// Reads only the invites table (the admin page joins names from users.list),
// so renames and admin toggles don't re-run it.
export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const invites = await ctx.db.query('invites').order('desc').take(1000)
    return invites.map((invite) => ({
      _id: invite._id,
      label: invite.label,
      // Self-minted links are the only device links; a reissued first-time
      // link has an admin creator and no `replacesSessions`, so it reads 'new'.
      kind: invite.replacesSessions
        ? ('recovery' as const)
        : invite.forUserId && invite.forUserId === invite.createdByUserId
          ? ('device' as const)
          : ('new' as const),
      grantsAdmin: invite.grantsAdmin === true,
      createdAt: invite._creationTime,
      claimedAt: invite.claimedAt ?? null,
      claimedByUserId: invite.claimedByUserId ?? null,
    }))
  },
})

// Whether anything besides the invite still points at this user.
async function userIsReferenced(ctx: QueryCtx, userId: Id<'users'>) {
  const session = await ctx.db
    .query('sessions')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()
  if (session) return true
  const vote = await ctx.db
    .query('votes')
    .withIndex('by_userId_and_partySessionId', (q) => q.eq('userId', userId))
    .first()
  if (vote) return true
  const availability = await ctx.db
    .query('availability')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .first()
  if (availability) return true
  const partySessions = await takeAll(ctx.db.query('partySessions'), 500)
  return partySessions.some((s) => s.facilitatorIds.includes(userId))
}

export const revoke = adminMutation({
  args: { inviteId: v.id('invites') },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get('invites', inviteId)
    if (!invite) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (invite.claimedAt !== undefined)
      throw new ConvexError({ code: 'INVITE_CLAIMED' as const })
    await ctx.db.delete('invites', invite._id)
    // A user who never joined and is referenced by nothing else only existed
    // for this link; don't leave them behind as a ghost row.
    if (invite.forUserId) {
      const user = await ctx.db.get('users', invite.forUserId)
      if (
        user &&
        !(await userHasJoined(ctx, user)) &&
        !(await userIsReferenced(ctx, user._id))
      ) {
        await ctx.db.delete('users', user._id)
      }
    }
    return null
  },
})

// One-shot backfill for the invite/user unification: gives every invite a
// `forUserId` (creating users for unclaimed pre-unification invites) and every
// joined user a `joinedAt`. Idempotent. Both returned counts must be 0 before
// the cleanup push that makes `forUserId` required.
export const migrateToForUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await takeAll(ctx.db.query('users'), 1000)
    const invites = await takeAll(ctx.db.query('invites'), 1000)

    for (const user of users) {
      if (user.joinedAt !== undefined) continue
      const claimedAts = invites
        .filter((i) => i.claimedByUserId === user._id)
        .map((i) => i.claimedAt)
        .filter((at): at is number => at !== undefined)
      if (claimedAts.length > 0) {
        await ctx.db.patch('users', user._id, {
          joinedAt: Math.min(...claimedAts),
        })
      }
    }

    for (const invite of invites) {
      if (invite.forUserId) continue
      if (invite.claimedByUserId) {
        await ctx.db.patch('invites', invite._id, {
          forUserId: invite.claimedByUserId,
        })
      } else {
        const userId = await ctx.db.insert('users', {
          name: normalizeName(invite.label),
          isAdmin: invite.grantsAdmin === true,
        })
        await ctx.db.patch('invites', invite._id, { forUserId: userId })
      }
    }

    const invitesAfter = await takeAll(ctx.db.query('invites'), 1000)
    const usersAfter = await takeAll(ctx.db.query('users'), 1000)
    return {
      invitesMissingForUserId: invitesAfter.filter((i) => !i.forUserId).length,
      joinedUsersMissingJoinedAt: usersAfter.filter(
        (user) =>
          user.joinedAt === undefined &&
          invitesAfter.some((i) => i.claimedByUserId === user._id),
      ).length,
    }
  },
})
