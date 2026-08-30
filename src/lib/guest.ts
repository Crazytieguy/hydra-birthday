import { getRouteApi } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { api } from '../../convex/_generated/api'

// Helpers for routes under the `_guest` layout, which guarantees a valid
// session token and a signed-in user in route context.
const guestRoute = getRouteApi('/_guest')

export function useSessionToken(): string {
  return guestRoute.useRouteContext().sessionToken
}

export function useMe() {
  const sessionToken = useSessionToken()
  const { data } = useSuspenseQuery(convexQuery(api.users.me, { sessionToken }))
  if (!data) throw new Error('useMe() called outside a signed-in guest route')
  return data
}

// `useMutation` that fills in the session token argument.
export function useSessionMutation<
  TMutation extends FunctionReference<'mutation'>,
>(mutation: TMutation) {
  const sessionToken = useSessionToken()
  const mutate = useMutation(mutation)
  return (
    args: Omit<FunctionArgs<TMutation>, 'sessionToken'>,
  ): Promise<FunctionReturnType<TMutation>> =>
    // typescript-eslint and tsc disagree on whether the spread already satisfies the arg type.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    mutate({ ...args, sessionToken } as FunctionArgs<TMutation>)
}
