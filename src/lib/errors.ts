import {
  DISH_MAX_LENGTH,
  FEEDS_MAX,
  OFFERS_PER_GUEST,
} from '../../convex/lib/meals'
import { ConvexError } from 'convex/values'
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../convex/lib/names'

// A browser-side failure whose message is already written for the guest.
export class UserFacingError extends Error {}

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
  INVALID_NAME: `Please enter a name (up to ${NAME_MAX_LENGTH} characters).`,
  INVALID_TITLE: `Please give your activity a title (up to ${TITLE_MAX_LENGTH} characters).`,
  INVALID_DESCRIPTION: `Please keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`,
  ALREADY_FACILITATING: "You're already running an activity. One per person.",
  CANNOT_WITHDRAW: "You can't withdraw that one. Message Yoav, Libi, or Guy.",
  CANNOT_DEMOTE_SELF: "You can't remove your own admin access.",
  INVALID_DISH: `Please say what the dish is (up to ${DISH_MAX_LENGTH} characters).`,
  INVALID_FEEDS: `How many people does it feed? A whole number, 1 to ${FEEDS_MAX}.`,
  TOO_MANY_OFFERS: `That's plenty: up to ${OFFERS_PER_GUEST} dishes per person.`,
}

export function describeError(error: unknown): string {
  if (error instanceof UserFacingError) return error.message
  return (
    messages[errorCode(error) ?? ''] ??
    'Something went wrong. Please try again.'
  )
}
