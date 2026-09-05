import { adminQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { userJoinedAt } from './lib/joined'
import { days } from './lib/slots'
import { SESSIONS_CAP } from './partySessions'

// Everything an organizer might want to analyze offline, as plain rows with
// ids intact so the tables join. Unlike schedule.raw this keeps every field,
// including descriptions, catalog keys, and creation times. Session tokens and
// invite tokens are the only data deliberately left out.
export const all = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [users, sessions, votes, availability] = await Promise.all([
      takeAll(ctx.db.query('users'), 1000),
      takeAll(ctx.db.query('partySessions'), SESSIONS_CAP),
      takeAll(ctx.db.query('votes'), 20000),
      takeAll(ctx.db.query('availability'), 1000),
    ])
    return {
      grid: days,
      users: await Promise.all(
        users.map(async (user) => ({
          _id: user._id,
          _creationTime: user._creationTime,
          name: user.name,
          isAdmin: user.isAdmin,
          joinedAt: await userJoinedAt(ctx, user),
          votesConfirmedAt: user.votesConfirmedAt ?? null,
        })),
      ),
      activities: sessions.map((session) => ({
        _id: session._id,
        _creationTime: session._creationTime,
        catalogKey: session.catalogKey ?? null,
        title: session.title,
        description: session.description ?? null,
        facilitatorIds: session.facilitatorIds,
        needsFacilitator: session.needsFacilitator === true,
        hidden: session.hidden === true,
        visibleSince: session.visibleSince ?? null,
        proposal: session.proposal === true,
      })),
      votes: votes.map((vote) => ({
        _id: vote._id,
        _creationTime: vote._creationTime,
        userId: vote.userId,
        partySessionId: vote.partySessionId,
        strength: vote.strength,
      })),
      availability: availability.map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        userId: row.userId,
        blockedHours: row.blockedHours,
        confirmedAt: row.confirmedAt ?? null,
      })),
    }
  },
})
