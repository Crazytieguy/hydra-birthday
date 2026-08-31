import { ConvexError } from 'convex/values'
import { catalog } from '../data/catalog'
import { internalMutation, internalQuery } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { takeAll } from './lib/collect'
import { mint } from './invites'
import { SESSIONS_CAP } from './partySessions'

// Seeding is CREATE-ONLY: an entry whose catalogKey already exists in the DB
// is skipped entirely, never patched, so a rerun can't clobber admin edits and
// facilitator names are never re-resolved after a rename. Post-seed edits
// belong to the admin UI (or targeted `bunx convex run` patches by id).

async function analyze(ctx: QueryCtx) {
  const [users, sessions] = await Promise.all([
    takeAll(ctx.db.query('users'), 1000),
    takeAll(ctx.db.query('partySessions'), SESSIONS_CAP),
  ])
  const seededKeys = new Set(
    sessions.flatMap((s) => (s.catalogKey ? [s.catalogKey] : [])),
  )

  const toCreate = catalog.filter((entry) => !seededKeys.has(entry.key))
  const ambiguous = new Set<string>()
  const missing = new Set<string>()
  const idByName = new Map<string, Id<'users'>>()
  for (const entry of toCreate) {
    for (const name of entry.facilitatorNames) {
      const matches = users.filter((user) => user.name === name)
      if (matches.length > 1) ambiguous.add(name)
      else if (matches.length === 1) idByName.set(name, matches[0]._id)
      else missing.add(name)
    }
  }
  return {
    toCreate,
    skipped: catalog.length - toCreate.length,
    ambiguous: [...ambiguous].sort(),
    missing: [...missing].sort(),
    idByName,
  }
}

// Dry-run report: what a seed would do, without writing anything.
export const seedPreflight = internalQuery({
  args: {},
  handler: async (ctx) => {
    const { toCreate, skipped, ambiguous, missing } = await analyze(ctx)
    return {
      wouldCreateSessions: toCreate.map((entry) => entry.title),
      wouldCreateFacilitators: missing,
      ambiguousFacilitators: ambiguous,
      alreadySeeded: skipped,
    }
  },
})

// For descriptions that land in data/catalog.ts after a deployment was seeded
// (e.g. drafts approved later). Fills only sessions whose description is still
// empty — the create-only rule stands, nothing written by an admin is touched.
export const backfillDescriptions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await takeAll(ctx.db.query('partySessions'), SESSIONS_CAP)
    const byKey = new Map(catalog.map((entry) => [entry.key, entry]))
    const filled: Array<string> = []
    for (const session of sessions) {
      if (session.description !== undefined || !session.catalogKey) continue
      const entry = byKey.get(session.catalogKey)
      if (!entry?.description) continue
      await ctx.db.patch('partySessions', session._id, {
        description: entry.description,
      })
      filled.push(session.title)
    }
    return { filled }
  },
})

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { toCreate, skipped, ambiguous, missing, idByName } =
      await analyze(ctx)
    if (ambiguous.length > 0) {
      // Several users share a facilitator's name; resolve by hand first.
      throw new ConvexError({
        code: 'AMBIGUOUS_FACILITATORS' as const,
        names: ambiguous,
      })
    }
    // Facilitators without accounts get one, plus an invite link to hand out.
    const minted = await mint(ctx, { labels: missing })
    for (const { label, userId } of minted) idByName.set(label, userId)

    for (const entry of toCreate) {
      await ctx.db.insert('partySessions', {
        catalogKey: entry.key,
        title: entry.title,
        description: entry.description,
        facilitatorIds: entry.facilitatorNames.map((name) => {
          const id = idByName.get(name)
          if (!id) throw new ConvexError({ code: 'UNRESOLVED_FACILITATOR' })
          return id
        }),
        needsFacilitator: entry.needsFacilitator ? true : undefined,
      })
    }
    return {
      createdSessions: toCreate.map((entry) => entry.title),
      alreadySeeded: skipped,
      newFacilitatorLinks: minted.map(({ label, token }) => ({
        label,
        token,
      })),
    }
  },
})
