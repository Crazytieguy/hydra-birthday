import { ConvexError, v } from 'convex/values'
import {
  adminMutation,
  adminQuery,
  sessionMutation,
  sessionQuery,
} from './lib/auth'
import { takeAll } from './lib/collect'
import { validateText } from './lib/names'
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

// Only a guest-proposed row still solely theirs may be withdrawn; the
// Withdraw button and the server guard share this rule. The provenance flag
// keeps admin-created rows (which also lack a catalogKey) guest-undeletable.
const isOwnProposal = (session: Doc<'partySessions'>) =>
  session.proposal === true && session.facilitatorIds.length === 1

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
    const facilitated = facilitatedBy(all, ctx.user._id)
    const [sessions, facilitatedVotes] = await Promise.all([
      Promise.all(
        all
          .filter((session) => session.hidden !== true)
          .map(async (session) => ({
            _id: session._id,
            addedAt: session.visibleSince ?? session._creationTime,
            title: session.title,
            description: session.description ?? null,
            facilitatorNames: await facilitatorNames(ctx, session),
            needsFacilitator: session.needsFacilitator === true,
            myVote: myVotes.get(session._id) ?? null,
          })),
      ),
      facilitated
        ? ctx.db
            .query('votes')
            .withIndex('by_partySessionId', (q) =>
              q.eq('partySessionId', facilitated._id),
            )
            .take(2)
        : Promise.resolve([]),
    ])
    const order = (id: Id<'partySessions'>) => fnv1a(`${ctx.user._id}:${id}`)
    sessions.sort(
      (a, b) => order(a._id) - order(b._id) || a._id.localeCompare(b._id),
    )
    // hasOtherVotes leaks one deliberate bit (someone else voted for their
    // session) so the edit form can warn against rewriting it wholesale.
    // Votes are unique per user+session, so among any two votes at least one
    // is someone else's.
    const myFacilitatedSession = facilitated
      ? {
          _id: facilitated._id,
          title: facilitated.title,
          description: facilitated.description ?? null,
          canWithdraw: isOwnProposal(facilitated),
          hasOtherVotes: facilitatedVotes.some(
            (vote) => vote.userId !== ctx.user._id,
          ),
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
      proposal: true,
    })
  },
})

// The fetch-and-ownership gate both guest mutations share. Bound to an
// explicit id so a stale form can never write into a different session.
async function getMineOrThrow(
  ctx: MutationCtx,
  userId: Id<'users'>,
  partySessionId: Id<'partySessions'>,
) {
  const session = await ctx.db.get('partySessions', partySessionId)
  if (!session || !session.facilitatorIds.includes(userId))
    throw new ConvexError({ code: 'NOT_FOUND' as const })
  return session
}

// Facilitators can rewrite their own session's text; everything else about
// the row (facilitators, hidden, catalogKey) stays admin-owned.
export const updateMine = sessionMutation({
  args: {
    partySessionId: v.id('partySessions'),
    title: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { title, description } = validateText(args)
    await getMineOrThrow(ctx, ctx.user._id, args.partySessionId)
    await ctx.db.patch('partySessions', args.partySessionId, {
      title,
      description,
    })
    return null
  },
})

// Withdrawing deletes the proposal outright (votes included), freeing the
// guest's slot to propose again. Seeded and shared sessions stay put.
export const withdrawMine = sessionMutation({
  args: { partySessionId: v.id('partySessions') },
  handler: async (ctx, { partySessionId }) => {
    const session = await getMineOrThrow(ctx, ctx.user._id, partySessionId)
    if (!isOwnProposal(session))
      throw new ConvexError({ code: 'CANNOT_WITHDRAW' as const })
    await deleteSessionWithVotes(ctx, partySessionId)
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

// Admin edits also verify the client-supplied facilitator ids exist.
async function validateEdit(
  ctx: MutationCtx,
  edit: {
    title: string
    description?: string
    facilitatorIds: Array<Id<'users'>>
  },
) {
  const users = await Promise.all(
    edit.facilitatorIds.map((id) => ctx.db.get('users', id)),
  )
  if (users.some((user) => !user))
    throw new ConvexError({ code: 'NOT_FOUND' as const })
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
      proposal: session.proposal,
      title,
      description,
      facilitatorIds: edit.facilitatorIds,
      needsFacilitator: edit.needsFacilitator || undefined,
      hidden: edit.hidden || undefined,
      // Unhiding is when the session first reaches guests.
      visibleSince:
        session.hidden === true && !edit.hidden
          ? Date.now()
          : session.visibleSince,
    })
    return null
  },
})

// Deleting a session (admin remove or guest withdraw) is the ONLY way votes
// are destroyed; hiding a session keeps every vote.
async function deleteSessionWithVotes(
  ctx: MutationCtx,
  partySessionId: Id<'partySessions'>,
) {
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
}

export const remove = adminMutation({
  args: { partySessionId: v.id('partySessions') },
  handler: async (ctx, { partySessionId }) => {
    const session = await ctx.db.get('partySessions', partySessionId)
    if (!session) throw new ConvexError({ code: 'NOT_FOUND' as const })
    await deleteSessionWithVotes(ctx, partySessionId)
    return null
  },
})
