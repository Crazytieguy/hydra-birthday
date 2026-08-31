import { adminQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { userJoinedAt } from './lib/joined'
import { SESSIONS_CAP } from './partySessions'

// Everything the organizers need to schedule by hand, as raw joined rows.
// Deliberately stateless and view-free: the client renders whatever cuts of
// this we want, and changing a view never needs a backend edit. Every read
// goes through takeAll so overflow errors loudly instead of omitting people.
export const raw = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [users, sessions, votes, availability] = await Promise.all([
      takeAll(ctx.db.query('users'), 1000),
      takeAll(ctx.db.query('partySessions'), SESSIONS_CAP),
      takeAll(ctx.db.query('votes'), 20000),
      takeAll(ctx.db.query('availability'), 1000),
    ])
    return {
      users: await Promise.all(
        users.map(async (user) => ({
          _id: user._id,
          name: user.name,
          joinedAt: await userJoinedAt(ctx, user),
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
