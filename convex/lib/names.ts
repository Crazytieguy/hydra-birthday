import { ConvexError } from 'convex/values'

// Shared text rules and length limits for guest-written fields. Runtime-free
// so the browser can import the same rules (input maxLength, error copy)
// without pulling in the Convex server bundle.
export const NAME_MAX_LENGTH = 60
export const TITLE_MAX_LENGTH = 80
export const DESCRIPTION_MAX_LENGTH = 2000

export const collapseWhitespace = (raw: string) =>
  raw.trim().replace(/\s+/g, ' ')

// A guest's display name: trimmed, single-spaced, 1–60 characters.
export function normalizeName(raw: string): string {
  const name = collapseWhitespace(raw)
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
    throw new ConvexError({ code: 'INVALID_NAME' as const })
  }
  return name
}
