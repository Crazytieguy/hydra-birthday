import { ConvexError } from 'convex/values'

// Every expected failure in convex/ is a `ConvexError({ code })`.
export function errorCode(error: unknown): string | undefined {
  if (
    error instanceof ConvexError &&
    typeof error.data === 'object' &&
    error.data !== null
  ) {
    const { code } = error.data as { code?: unknown }
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}
