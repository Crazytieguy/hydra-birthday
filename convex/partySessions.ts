import { ConvexError, v } from 'convex/values'
import { sessionMutation, sessionQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { fnv1a } from './lib/slots'
import type { QueryCtx } from './_generated/server'
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
