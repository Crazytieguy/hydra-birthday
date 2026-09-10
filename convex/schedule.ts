import { ConvexError, v } from 'convex/values'
import { internalMutation, internalQuery } from './_generated/server'
import { adminQuery, sessionQuery } from './lib/auth'
import { takeAll } from './lib/collect'
import { userJoinedAt } from './lib/joined'
import { days } from './lib/slots'
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

const entryFields = {
  day: v.string(),
  start: v.number(),
  end: v.number(),
  kind: v.union(v.literal('activity'), v.literal('frame')),
  partySessionId: v.optional(v.id('partySessions')),
  title: v.optional(v.string()),
  frameLabel: v.optional(v.string()),
  ribbon: v.optional(v.boolean()),
  note: v.optional(v.string()),
  segments: v.optional(
    v.array(
      v.object({ label: v.string(), start: v.number(), end: v.number() }),
    ),
  ),
}

export const forGuest = sessionQuery({
  args: {},
  handler: async (ctx) => {
    const [entries, myVoteRows] = await Promise.all([
      takeAll(ctx.db.query('scheduleEntries'), ENTRIES_CAP),
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
    // Circling A/B/C share one partySession; look each up once.
    const sessionIds = [
      ...new Set(
        entries.flatMap((e) => (e.partySessionId ? [e.partySessionId] : [])),
      ),
    ]
    const sessions = new Map(
      await Promise.all(
        sessionIds.map(async (id) => {
          const session = await ctx.db.get('partySessions', id)
          const facilitators = session
            ? await Promise.all(
                session.facilitatorIds.map((userId) =>
                  ctx.db.get('users', userId),
                ),
              )
            : []
          return [
            id,
            {
              session,
              facilitatorNames: facilitators.flatMap((user) =>
                user ? [user.name] : [],
              ),
            },
          ] as const
        }),
      ),
    )
    const joined = entries.map((entry) => {
      const live = entry.partySessionId
        ? sessions.get(entry.partySessionId)
        : undefined
      const session = live?.session ?? null
      return {
        _id: entry._id,
        day: entry.day,
        kind: entry.kind,
        start: entry.start,
        end: entry.end,
        // The synced title is a snapshot, so a renamed or deleted activity
        // still reads; the live row only adds description, people, votes.
        title:
          entry.kind === 'frame'
            ? (entry.frameLabel ?? '')
            : (entry.title ?? session?.title ?? ''),
        ribbon: entry.ribbon === true,
        segments: entry.segments ?? [],
        note: entry.note ?? null,
        description: session?.description ?? null,
        facilitatorNames: live?.facilitatorNames ?? [],
        myVote: session ? (myVotes.get(session._id) ?? null) : null,
      }
    })
    // Frames first at a given start, then longer blocks before shorter ones,
    // so lanes fill predictably.
    joined.sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.start - b.start ||
        Number(a.kind === 'activity') - Number(b.kind === 'activity') ||
        b.end - b.start - (a.end - a.start) ||
        a.title.localeCompare(b.title),
    )
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
  args: { entries: v.array(v.object(entryFields)) },
  handler: async (ctx, { entries }) => {
    const knownDays = new Set(days.map((day) => day.date))
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
      if (entry.kind === 'frame') {
        if (!entry.frameLabel) bad('frame without a label')
        if (entry.partySessionId) bad('frame with a partySessionId')
      } else {
        if (!entry.partySessionId && !entry.title)
          bad('activity with neither partySessionId nor title')
        if (
          entry.partySessionId &&
          !(await ctx.db.get('partySessions', entry.partySessionId))
        )
          bad('partySessionId does not exist')
      }
    }
    const existing = await takeAll(ctx.db.query('scheduleEntries'), ENTRIES_CAP)
    for (const row of existing) await ctx.db.delete('scheduleEntries', row._id)
    for (const entry of entries) await ctx.db.insert('scheduleEntries', entry)
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
