import { ConvexError, v } from 'convex/values'
import {
  adminMutation,
  adminQuery,
  sessionMutation,
  sessionQuery,
} from './lib/auth'
import { takeAll } from './lib/collect'
import { collapseWhitespace } from './lib/names'
import { fnv1a } from './lib/slots'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

export const SESSIONS_CAP = 500

export const myVoteQuery = (
  ctx: QueryCtx,
  userId: Id<'users'>,
  partySessionId: Id<'partySessions'>,
) =>
  ctx.db
    .query('votes')
    .withIndex('by_userId_and_partySessionId', (q) =>
      q.eq('userId', userId).eq('partySessionId', partySessionId),
    )
    .unique()

async function facilitatorNames(ctx: QueryCtx, session: Doc<'partySessions'>) {
  const users = await Promise.all(
    session.facilitatorIds.map((id) => ctx.db.get('users', id)),
  )
  return users.flatMap((user) => (user ? [user.name] : []))
}

// The guest's voting screen: every visible session with their own vote, in an
// order that's randomized per person (to spread position bias) but stable for
// them across reloads. Nothing about anyone else's votes leaves the server.
export const list = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const all = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    const sessions = await Promise.all(
      all
        .filter((session) => session.hidden !== true)
        .map(async (session) => ({
          _id: session._id,
          title: session.title,
          description: session.description ?? null,
          facilitatorNames: await facilitatorNames(ctx, session),
          needsFacilitator: session.needsFacilitator === true,
          myVote:
            (await myVoteQuery(ctx, ctx.user._id, session._id))?.strength ??
            null,
        })),
    )
    const order = (id: Id<'partySessions'>) => fnv1a(`${ctx.user._id}:${id}`)
    sessions.sort(
      (a, b) => order(a._id) - order(b._id) || a._id.localeCompare(b._id),
    )
    return { sessions, votesConfirmedAt: ctx.user.votesConfirmedAt ?? null }
  },
})

export const setVote = sessionMutation({
  args: {
    partySessionId: v.id('partySessions'),
    strength: v.union(v.literal('regular'), v.literal('strong'), v.null()),
  },
  handler: async (ctx, { partySessionId, strength }) => {
    const session = await ctx.db.get('partySessions', partySessionId)
    if (!session || session.hidden === true)
      throw new ConvexError({ code: 'NOT_FOUND' as const })
    const existing = await myVoteQuery(ctx, ctx.user._id, partySessionId)
    if (strength === null) {
      if (existing) await ctx.db.delete('votes', existing._id)
    } else if (existing) {
      if (existing.strength !== strength)
        await ctx.db.patch('votes', existing._id, { strength })
    } else {
      await ctx.db.insert('votes', {
        userId: ctx.user._id,
        partySessionId,
        strength,
      })
    }
    return null
  },
})

// "Done voting". Write-once: later vote edits never clear it — it marks that
// the guest reviewed the list, not that their votes are frozen.
export const confirmVotes = sessionMutation({
  args: {},
  handler: async (ctx) => {
    if (ctx.user.votesConfirmedAt === undefined) {
      await ctx.db.patch('users', ctx.user._id, {
        votesConfirmedAt: Date.now(),
      })
    }
    return null
  },
})

// ——— Admin catalog management ———

const editableFields = {
  title: v.string(),
  description: v.optional(v.string()),
  facilitatorIds: v.array(v.id('users')),
  needsFacilitator: v.boolean(),
  hidden: v.boolean(),
}

async function validateEdit(
  ctx: MutationCtx,
  edit: {
    title: string
    description?: string
    facilitatorIds: Array<Id<'users'>>
  },
) {
  const title = collapseWhitespace(edit.title)
  if (!title) throw new ConvexError({ code: 'INVALID_TITLE' as const })
  for (const id of edit.facilitatorIds) {
    if (!(await ctx.db.get('users', id)))
      throw new ConvexError({ code: 'NOT_FOUND' as const })
  }
  const description = edit.description?.trim()
  return { title, description: description ? description : undefined }
}

export const adminList = adminQuery({
  args: {},
  handler: async (ctx) => {
    const all = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    return await Promise.all(
      all.map(async (session) => {
        const votes = await takeAll(
          ctx.db
            .query('votes')
            .withIndex('by_partySessionId', (q) =>
              q.eq('partySessionId', session._id),
            ),
          2000,
        )
        return {
          _id: session._id,
          catalogKey: session.catalogKey ?? null,
          title: session.title,
          description: session.description ?? null,
          facilitatorIds: session.facilitatorIds,
          facilitatorNames: await facilitatorNames(ctx, session),
          needsFacilitator: session.needsFacilitator === true,
          hidden: session.hidden === true,
          regularVotes: votes.filter((v_) => v_.strength === 'regular').length,
          strongVotes: votes.filter((v_) => v_.strength === 'strong').length,
        }
      }),
    )
  },
})

export const create = adminMutation({
  args: editableFields,
  handler: async (ctx, args) => {
    const { title, description } = await validateEdit(ctx, args)
    return await ctx.db.insert('partySessions', {
      title,
      description,
      facilitatorIds: args.facilitatorIds,
      needsFacilitator: args.needsFacilitator || undefined,
      hidden: args.hidden || undefined,
    })
  },
})

// Replaces every editable field (the dialog submits the whole form).
// `catalogKey` is never editable — it's the seed identity.
export const update = adminMutation({
  args: { partySessionId: v.id('partySessions'), ...editableFields },
  handler: async (ctx, { partySessionId, ...edit }) => {
    const session = await ctx.db.get('partySessions', partySessionId)
    if (!session) throw new ConvexError({ code: 'NOT_FOUND' as const })
    const { title, description } = await validateEdit(ctx, edit)
    await ctx.db.replace('partySessions', partySessionId, {
      catalogKey: session.catalogKey,
      title,
      description,
      facilitatorIds: edit.facilitatorIds,
      needsFacilitator: edit.needsFacilitator || undefined,
      hidden: edit.hidden || undefined,
    })
    return null
  },
})

// Explicit, confirmed delete is the ONE place votes are destroyed with their
// session; hiding a session keeps every vote.
export const remove = adminMutation({
  args: { partySessionId: v.id('partySessions') },
  handler: async (ctx, { partySessionId }) => {
    const session = await ctx.db.get('partySessions', partySessionId)
    if (!session) throw new ConvexError({ code: 'NOT_FOUND' as const })
    const votes = await takeAll(
      ctx.db
        .query('votes')
        .withIndex('by_partySessionId', (q) =>
          q.eq('partySessionId', partySessionId),
        ),
      2000,
    )
    for (const vote of votes) await ctx.db.delete('votes', vote._id)
    await ctx.db.delete('partySessions', partySessionId)
    return null
  },
})
