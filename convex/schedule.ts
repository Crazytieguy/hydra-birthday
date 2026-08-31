import { adminQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { SESSIONS_CAP } from './partySessions'

// Everything the organizers need to schedule by hand, as raw joined rows.
// Deliberately stateless and view-free: the client renders whatever cuts of
// this we want, and changing a view never needs a backend edit. Every read
// goes through takeAll so overflow errors loudly instead of omitting people.
export const raw = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await takeAll(ctx.db.query('users'), 1000)
    const sessions = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    const votes = await takeAll(ctx.db.query('votes'), 20000)
    const availability = await takeAll(ctx.db.query('availability'), 1000)
    return {
      users: await Promise.all(
        users.map(async (user) => ({
          _id: user._id,
          name: user.name,
          joinedAt:
            user.joinedAt ??
            (
              await ctx.db
                .query('invites')
                .withIndex('by_claimedByUserId', (q) =>
                  q.eq('claimedByUserId', user._id),
                )
                .first()
            )?.claimedAt ??
            null,
          votesConfirmedAt: user.votesConfirmedAt ?? null,
        })),
      ),
      sessions: sessions.map((session) => ({
        _id: session._id,
        title: session.title,
        facilitatorIds: session.facilitatorIds,
        needsFacilitator: session.needsFacilitator === true,
        hidden: session.hidden === true,
      })),
      votes: votes.map((vote) => ({
        userId: vote.userId,
        partySessionId: vote.partySessionId,
        strength: vote.strength,
      })),
      availability: availability.map((row) => ({
        userId: row.userId,
        blockedHours: row.blockedHours,
        confirmedAt: row.confirmedAt ?? null,
      })),
    }
  },
})
