import { ConvexError, v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  adminMutation,
  adminQuery,
  findSessionByHash,
  findSessionUser,
} from './lib/auth'
import { takeAll } from './lib/collect'
import { userHasJoined } from './lib/joined'
import { collapseWhitespace, normalizeName } from './lib/names'
import { deleteSessions, insertSession, revokeInvites } from './lib/sessions'
import { MIN_SESSION_TOKEN_LENGTH, hashToken, newToken } from './lib/tokens'

async function findInvite(ctx: QueryCtx, token: string) {
  const tokenHash = await hashToken(token)
  return await ctx.db
    .query('invites')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
    .unique()
}

// What an invite page shows before the guest taps "Join". Public by design:
// the token itself is the secret. Reading never claims the invite, so link
// previews (Signal, WhatsApp, Partiful) never join on the guest's behalf. `sessionToken` (the
// browser's current cookie, if any) identifies the viewer so the page can say
// who they already are and recognise a link they own.
export const peek = query({
  args: { token: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, { token, sessionToken }) => {
    const [invite, viewer] = await Promise.all([
      findInvite(ctx, token),
      sessionToken ? findSessionUser(ctx, sessionToken) : null,
    ])
    if (!invite || invite.revokedAt !== undefined)
      return { status: 'invalid' as const }
    const user = await ctx.db.get('users', invite.forUserId)
    if (!user) return { status: 'invalid' as const }
    const viewerInfo = viewer && { name: viewer.name }
    // A first-time link keeps the editable-name UI; a link into a joined
    // account (device, recovery) signs in under the existing name.
    if (!userHasJoined(user)) {
      return {
        status: 'available' as const,
        kind: 'new' as const,
        name: user.name,
        viewer: viewerInfo,
      }
    }
    return {
      status: 'available' as const,
      kind: 'existing' as const,
      name: user.name,
      mine: viewer !== null && viewer._id === user._id,
      viewer: viewerInfo,
    }
  },
})

// Bind the caller's browser to the invite's account. Links are never used
// up: the first claim joins the account (and may name it), and every later
// claim from another browser signs that browser in too. Only `revokedAt`
// stops a link. The browser generates `sessionToken` (and keeps it until the
// cookie is stored), so a retry after a lost response is a no-op.
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
    const [invite, tokenHash] = await Promise.all([
      findInvite(ctx, token),
      hashToken(sessionToken),
    ])
    if (!invite || invite.revokedAt !== undefined)
      throw new ConvexError({ code: 'INVALID_INVITE' as const })
    const user = await ctx.db.get('users', invite.forUserId)
    if (!user) throw new ConvexError({ code: 'INVALID_INVITE' as const })
    const existingSession = await findSessionByHash(ctx, tokenHash)
    if (existingSession) {
      // A retry whose first attempt landed is done; a stranger's token
      // can't be reused.
      if (existingSession.userId === user._id) return null
      throw new ConvexError({ code: 'INVALID_SESSION_TOKEN' as const })
    }

    const firstUse = invite.claimedAt === undefined
    if (firstUse) {
      if (!userHasJoined(user)) {
        // First claim of a first-time link: the guest may pick their own
        // name, and the account is now joined. Later links into the account
        // never rename it.
        await ctx.db.patch('users', user._id, {
          name: normalizeName(name ?? user.name),
          joinedAt: Date.now(),
        })
      }
      if (invite.replacesSessions) {
        // Recovery: whoever held the old devices or the old link is out.
        await deleteSessions(ctx, user._id)
        await revokeInvites(ctx, user._id, invite._id)
      }
    }

    await insertSession(ctx, user._id, tokenHash)
    if (firstUse)
      await ctx.db.patch('invites', invite._id, { claimedAt: Date.now() })
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

// A fresh link into an existing account. Only one unclaimed one exists per
// user at a time: minting a new one forgets the previous.
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

// Admin recovery for a guest whose link reached the wrong hands (or a lost
// phone). Its first claim signs the account out everywhere else and revokes
// the older links, so the old devices and the leaked link are locked out at
// the moment the guest is back in; the recovery link itself keeps working
// for their other devices. Only for guests who actually joined — replacing a
// never-used first link is `reissueInvite`.
export const createForUser = adminMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get('users', userId)
    if (!user) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (!userHasJoined(user))
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
    if (userHasJoined(user))
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
      forUserId: invite.forUserId,
      kind: invite.replacesSessions ? ('recovery' as const) : ('new' as const),
      grantsAdmin: invite.grantsAdmin === true,
      createdAt: invite._creationTime,
      claimedAt: invite.claimedAt ?? null,
      revokedAt: invite.revokedAt ?? null,
    }))
  },
})

// One-off: unset the legacy claimed-by fields so the schema can drop them.
// `bunx convex run invites:dropClaimedFields [--prod]`, then delete the
// fields from convex/schema.ts and this mutation.
export const dropClaimedFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const invites = await takeAll(ctx.db.query('invites'), 1000)
    let patched = 0
    for (const invite of invites) {
      if (
        invite.claimedByUserId === undefined &&
        invite.claimedSessionTokenHash === undefined
      )
        continue
      await ctx.db.patch('invites', invite._id, {
        claimedByUserId: undefined,
        claimedSessionTokenHash: undefined,
      })
      patched++
    }
    return { patched }
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

// A never-used link is deleted outright (with the user it was minted for,
// if nothing else knows them); a link someone already joined with is kept
// for history but stops signing anyone in.
export const revoke = adminMutation({
  args: { inviteId: v.id('invites') },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get('invites', inviteId)
    if (!invite) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (invite.claimedAt !== undefined) {
      if (invite.revokedAt === undefined)
        await ctx.db.patch('invites', invite._id, { revokedAt: Date.now() })
      return null
    }
    await ctx.db.delete('invites', invite._id)
    // A user who never joined and is referenced by nothing else only existed
    // for this link; don't leave them behind as a ghost row.
    const user = await ctx.db.get('users', invite.forUserId)
    if (
      user &&
      !userHasJoined(user) &&
      !(await userIsReferenced(ctx, user._id))
    )
      await ctx.db.delete('users', user._id)
    return null
  },
})
