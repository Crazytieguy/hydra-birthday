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

const messages: Record<string, string> = {
  UNAUTHENTICATED: 'Your session has ended. Reload the page.',
  FORBIDDEN: "You're no longer an admin.",
  NOT_FOUND: "That doesn't exist anymore.",
  INVITE_CLAIMED: 'That link was already used.',
  INVALID_INVITE: "That link isn't valid anymore.",
  INVALID_NAME: 'Please enter a name (up to 60 characters).',
  CANNOT_DEMOTE_SELF: "You can't remove your own admin access.",
}

export function describeError(error: unknown): string {
  return (
    messages[errorCode(error) ?? ''] ??
    'Something went wrong — please try again.'
  )
}
