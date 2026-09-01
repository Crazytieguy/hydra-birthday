import { ConvexError, v } from 'convex/values'
import {
  adminMutation,
  adminQuery,
  sessionMutation,
  sessionQuery,
} from './lib/auth'
import { takeAll } from './lib/collect'
import {
  collapseWhitespace,
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from './lib/names'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

export const SESSIONS_CAP = 500
const VOTES_CAP = 20000

// FNV-1a, for per-user randomized-but-stable session ordering.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const myVoteQuery = (
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

// The one-proposal-per-guest rule: facilitating any session, hidden included,
// spends the slot (deleting the session is what frees it).
const facilitatedBy = (all: Array<Doc<'partySessions'>>, userId: Id<'users'>) =>
  all.find((session) => session.facilitatorIds.includes(userId))

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
    const [all, myVoteRows] = await Promise.all([
      takeAll(ctx.db.query('partySessions'), SESSIONS_CAP),
      takeAll(
        ctx.db
          .query('votes')
          .withIndex('by_userId_and_partySessionId', (q) =>
            q.eq('userId', ctx.user._id),
          ),
        SESSIONS_CAP,
      ),
    ])
    const myVotes = new Map(
      myVoteRows.map((vote) => [vote.partySessionId, vote.strength]),
    )
    const sessions = await Promise.all(
      all
        .filter((session) => session.hidden !== true)
        .map(async (session) => ({
          _id: session._id,
          _creationTime: session._creationTime,
          title: session.title,
          description: session.description ?? null,
          facilitatorNames: await facilitatorNames(ctx, session),
          needsFacilitator: session.needsFacilitator === true,
          myVote: myVotes.get(session._id) ?? null,
        })),
    )
    const order = (id: Id<'partySessions'>) => fnv1a(`${ctx.user._id}:${id}`)
    sessions.sort(
      (a, b) => order(a._id) - order(b._id) || a._id.localeCompare(b._id),
    )
    const facilitated = facilitatedBy(all, ctx.user._id)
    // hasOtherVotes leaks one deliberate bit (someone else voted for their
    // session) so the edit form can warn against rewriting it wholesale.
    const myFacilitatedSession = facilitated
      ? {
          _id: facilitated._id,
          title: facilitated.title,
          description: facilitated.description ?? null,
          // Votes are unique per user+session, so among any two votes at
          // least one is someone else's.
          hasOtherVotes: (
            await ctx.db
              .query('votes')
              .withIndex('by_partySessionId', (q) =>
                q.eq('partySessionId', facilitated._id),
              )
              .take(2)
          ).some((vote) => vote.userId !== ctx.user._id),
        }
      : null
    return {
      sessions,
      votesConfirmedAt: ctx.user.votesConfirmedAt ?? null,
      myFacilitatedSession,
    }
  },
})

// A guest's one proposal: they always volunteer to run it, so the facilitator
// slot doubles as the proposal marker.
export const propose = sessionMutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { title, description } = validateText(args)
    const all = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    if (facilitatedBy(all, ctx.user._id))
      throw new ConvexError({ code: 'ALREADY_FACILITATING' as const })
    return await ctx.db.insert('partySessions', {
      title,
      description,
      facilitatorIds: [ctx.user._id],
    })
  },
})

// Facilitators can rewrite their own session's text; everything else about
// the row (facilitators, hidden, catalogKey) stays admin-owned.
export const updateMine = sessionMutation({
  args: { title: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { title, description } = validateText(args)
    const all = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    const mine = facilitatedBy(all, ctx.user._id)
    if (!mine) throw new ConvexError({ code: 'NOT_FOUND' as const })
    await ctx.db.patch('partySessions', mine._id, { title, description })
    return null
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

function validateText(edit: { title: string; description?: string }) {
  const title = collapseWhitespace(edit.title)
  if (!title || title.length > TITLE_MAX_LENGTH)
    throw new ConvexError({ code: 'INVALID_TITLE' as const })
  const description = edit.description?.trim()
  if (description && description.length > DESCRIPTION_MAX_LENGTH)
    throw new ConvexError({ code: 'INVALID_DESCRIPTION' as const })
  return { title, description: description ? description : undefined }
}

// Admin edits also verify the client-supplied facilitator ids exist.
async function validateEdit(
  ctx: MutationCtx,
  edit: {
    title: string
    description?: string
    facilitatorIds: Array<Id<'users'>>
  },
) {
  for (const id of edit.facilitatorIds) {
    if (!(await ctx.db.get('users', id)))
      throw new ConvexError({ code: 'NOT_FOUND' as const })
  }
  return validateText(edit)
}

export const adminList = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [all, votes] = await Promise.all([
      takeAll(ctx.db.query('partySessions'), SESSIONS_CAP),
      takeAll(ctx.db.query('votes'), VOTES_CAP),
    ])
    const counts = new Map<
      Id<'partySessions'>,
      { regular: number; strong: number }
    >()
    for (const vote of votes) {
      const count = counts.get(vote.partySessionId) ?? { regular: 0, strong: 0 }
      count[vote.strength]++
      counts.set(vote.partySessionId, count)
    }
    return await Promise.all(
      all.map(async (session) => ({
        _id: session._id,
        catalogKey: session.catalogKey ?? null,
        title: session.title,
        description: session.description ?? null,
        facilitatorIds: session.facilitatorIds,
        facilitatorNames: await facilitatorNames(ctx, session),
        needsFacilitator: session.needsFacilitator === true,
        hidden: session.hidden === true,
        regularVotes: counts.get(session._id)?.regular ?? 0,
        strongVotes: counts.get(session._id)?.strong ?? 0,
      })),
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
