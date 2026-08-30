import { ConvexError, v } from 'convex/values'
import { internalMutation, mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import {
  adminMutation,
  adminQuery,
  findSessionUser,
  sessionMutation,
} from './lib/auth'
import { deleteSessions, insertSession } from './lib/sessions'
import { MIN_SESSION_TOKEN_LENGTH, hashToken, newToken } from './lib/tokens'
import { normalizeName } from './users'

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
// browser's current cookie, if any) only serves to recognise the link's owner.
export const peek = query({
  args: { token: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, { token, sessionToken }) => {
    const invite = await findInvite(ctx, token)
    if (!invite) return { status: 'invalid' as const }
    const viewer = sessionToken
      ? await findSessionUser(ctx, sessionToken)
      : null
    if (invite.claimedAt !== undefined) {
      return {
        status: 'claimed' as const,
        mine: viewer !== null && viewer.user._id === invite.claimedByUserId,
      }
    }
    if (invite.forUserId) {
      const user = await ctx.db.get('users', invite.forUserId)
      if (!user) return { status: 'invalid' as const }
      return {
        status: 'available' as const,
        kind: 'existing' as const,
        name: user.name,
        mine: viewer !== null && viewer.user._id === user._id,
      }
    }
    return {
      status: 'available' as const,
      kind: 'new' as const,
      label: invite.label ?? null,
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
    const collision = await ctx.db
      .query('sessions')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', tokenHash))
      .unique()
    if (collision)
      throw new ConvexError({ code: 'INVALID_SESSION_TOKEN' as const })

    let userId: Id<'users'>
    if (invite.forUserId) {
      const existing = await ctx.db.get('users', invite.forUserId)
      if (!existing) throw new ConvexError({ code: 'INVALID_INVITE' as const })
      userId = existing._id
      if (invite.replacesSessions) await deleteSessions(ctx, userId)
    } else {
      userId = await ctx.db.insert('users', {
        name: normalizeName(name ?? invite.label ?? ''),
        isAdmin: invite.grantsAdmin === true,
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

async function mint(
  ctx: MutationCtx,
  args: {
    labels: string[]
    grantsAdmin?: boolean
    createdByUserId?: Id<'users'>
  },
) {
  const minted: Array<{ label: string; token: string }> = []
  for (const raw of args.labels) {
    const label = raw.trim().replace(/\s+/g, ' ')
    if (!label) continue
    const token = newToken()
    await ctx.db.insert('invites', {
      tokenHash: await hashToken(token),
      label,
      grantsAdmin: args.grantsAdmin ? true : undefined,
      createdByUserId: args.createdByUserId,
    })
    minted.push({ label, token })
  }
  return minted
}

// Admin page: one invite per label. The tokens are shown once, right here.
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
// locked out at the same moment the guest is back in.
export const createForUser = adminMutation({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) =>
    await mintForUser(ctx, userId, ctx.user._id, true),
})

export const list = adminQuery({
  args: {},
  handler: async (ctx) => {
    const invites = await ctx.db.query('invites').order('desc').take(1000)
    return await Promise.all(
      invites.map(async (invite) => {
        const claimedBy = invite.claimedByUserId
          ? await ctx.db.get('users', invite.claimedByUserId)
          : null
        return {
          _id: invite._id,
          label: invite.label ?? null,
          kind: !invite.forUserId
            ? ('new' as const)
            : invite.replacesSessions
              ? ('recovery' as const)
              : ('device' as const),
          grantsAdmin: invite.grantsAdmin === true,
          createdAt: invite._creationTime,
          claimedAt: invite.claimedAt ?? null,
          claimedByName: claimedBy?.name ?? null,
        }
      }),
    )
  },
})

export const revoke = adminMutation({
  args: { inviteId: v.id('invites') },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get('invites', inviteId)
    if (!invite) throw new ConvexError({ code: 'NOT_FOUND' as const })
    if (invite.claimedAt !== undefined)
      throw new ConvexError({ code: 'INVITE_CLAIMED' as const })
    await ctx.db.delete('invites', inviteId)
    return null
  },
})
