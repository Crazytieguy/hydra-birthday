import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { adminQuery, sessionQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { userJoinedAt } from './lib/joined'
import { days } from './lib/slots'
import { facilitatorNames, usersById } from './lib/users'
import { SESSIONS_CAP, myVotesByPartySession } from './partySessions'
import { scheduleEntryFields } from './schema'

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
      users: users.map((user) => ({
        _id: user._id,
        name: user.name,
        joinedAt: userJoinedAt(user),
        votesConfirmedAt: user.votesConfirmedAt ?? null,
      })),
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

// ---------------------------------------------------------------------------
// The guest-facing schedule. Rows come from `bun run schedule:sync`
// (scripts/schedule-sync.ts) via replaceAll; guests read them through
// forGuest, which joins each activity's partySession and the caller's own
// vote and nothing about anyone else.

const ENTRIES_CAP = 200

export const forGuest = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const [entries, myVotes] = await Promise.all([
      takeAll(ctx.db.query('scheduleEntries'), ENTRIES_CAP),
      myVotesByPartySession(ctx, ctx.user._id),
    ])
    // Circling A/B/C share one partySession; look each up once, and each
    // facilitator once across all of them.
    const sessionIds = [
      ...new Set(
        entries.flatMap((e) => (e.partySessionId ? [e.partySessionId] : [])),
      ),
    ]
    const sessionRows = await Promise.all(
      sessionIds.map((id) => ctx.db.get('partySessions', id)),
    )
    const sessions = new Map(sessionIds.map((id, i) => [id, sessionRows[i]]))
    const users = await usersById(
      ctx,
      sessionRows.flatMap((session) => session?.facilitatorIds ?? []),
    )
    const joined = entries.map((entry) => {
      // The synced title is a snapshot, so a renamed or deleted activity
      // still reads; the live row only adds description, people, votes.
      const session = entry.partySessionId
        ? (sessions.get(entry.partySessionId) ?? null)
        : null
      return {
        _id: entry._id,
        day: entry.day,
        kind: entry.kind,
        start: entry.start,
        end: entry.end,
        title: entry.title,
        open: entry.open === true,
        ribbon: entry.ribbon === true,
        segments: entry.segments ?? [],
        note: entry.note ?? null,
        partySessionId: entry.partySessionId ?? null,
        description: session?.description ?? null,
        facilitatorNames: session ? facilitatorNames(session, users) : [],
        myVote: session ? (myVotes.get(session._id) ?? null) : null,
      }
    })
    // Start order only; the client's layout owns everything finer.
    joined.sort((a, b) => a.start - b.start)
    return days
      .map((day) => ({
        date: day.date,
        label: day.label,
        entries: joined.filter((entry) => entry.day === day.date),
      }))
      .filter((day) => day.entries.length > 0)
  },
})

// Replace the whole schedule. Called only by the sync script; validated here
// so a malformed board file can't leave half a schedule behind (the mutation
// is one transaction, so a throw rolls back the deletes too).
export const replaceAll = internalMutation({
  args: { entries: v.array(v.object(scheduleEntryFields)) },
  handler: async (ctx, { entries }) => {
    const knownDays = new Set(days.map((day) => day.date))
    const sessionIds = [
      ...new Set(
        entries.flatMap((e) => (e.partySessionId ? [e.partySessionId] : [])),
      ),
    ]
    const [existing, sessionRows] = await Promise.all([
      takeAll(ctx.db.query('scheduleEntries'), ENTRIES_CAP),
      Promise.all(sessionIds.map((id) => ctx.db.get('partySessions', id))),
    ])
    const knownSessions = new Set(
      sessionIds.filter((_, i) => sessionRows[i] !== null),
    )
    for (const entry of entries) {
      const bad = (reason: string) => {
        throw new ConvexError({
          code: 'INVALID_ENTRY' as const,
          reason,
          entry,
        })
      }
      if (!knownDays.has(entry.day)) bad('unknown day')
      if (entry.start < 0 || entry.end <= entry.start) bad('bad time range')
      if (!entry.title) bad('empty title')
      if (entry.partySessionId && !knownSessions.has(entry.partySessionId))
        bad('partySessionId does not exist')
    }
    await Promise.all(
      existing.map((row) => ctx.db.delete('scheduleEntries', row._id)),
    )
    await Promise.all(
      entries.map((entry) => ctx.db.insert('scheduleEntries', entry)),
    )
    return { deleted: existing.length, inserted: entries.length }
  },
})

// What the sync script needs to map board activities onto this deployment.
export const listForSync = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sessions = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    return sessions.map((session) => ({
      _id: session._id,
      catalogKey: session.catalogKey ?? null,
      title: session.title,
    }))
  },
})
