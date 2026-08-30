import { getRouteApi } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import type { UseSuspenseQueryOptions } from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from 'convex/server'
import { api } from '../../convex/_generated/api'
import { useAsyncAction } from '@/lib/actions'

// Helpers for routes under the `_guest` layout, which guarantees a valid
// session token and a signed-in user in route context.
const guestRoute = getRouteApi('/_guest')

type SessionArgs<TFn extends FunctionReference<'query' | 'mutation'>> = Omit<
  FunctionArgs<TFn>,
  'sessionToken'
>

// Query options for a gated query. Use the same call from a route loader
// (`context.queryClient.ensureQueryData(...)`) and from `useSessionQuery`, so
// the SSR result hands over to the live subscription under one key.
export function sessionQueryOptions<TQuery extends FunctionReference<'query'>>(
  query: TQuery,
  args: SessionArgs<TQuery>,
  sessionToken: string,
) {
  // typescript-eslint and tsc disagree on whether the spread already satisfies the arg type.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  return convexQuery(query, { ...args, sessionToken } as FunctionArgs<TQuery>)
}

export function useSessionToken(): string {
  return guestRoute.useRouteContext().sessionToken
}

export function useSessionQuery<TQuery extends FunctionReference<'query'>>(
  query: TQuery,
  args: SessionArgs<TQuery>,
) {
  // convexQuery's return type is conditional on a `skip` argument, which a
  // generic TQuery can't resolve; the options are the non-skip shape.
  return useSuspenseQuery(
    sessionQueryOptions(
      query,
      args,
      useSessionToken(),
    ) as UseSuspenseQueryOptions<FunctionReturnType<TQuery>>,
  )
}

export function useMe() {
  const { data } = useSessionQuery(api.users.me, {})
  if (!data) throw new Error('useMe() called outside a signed-in guest route')
  return data
}

// A gated mutation with busy/error state; the session token is filled in.
export function useSessionAction<
  TMutation extends FunctionReference<'mutation'>,
>(mutation: TMutation) {
  const sessionToken = useSessionToken()
  const mutate = useMutation(mutation)
  return useAsyncAction(
    (args: SessionArgs<TMutation>): Promise<FunctionReturnType<TMutation>> =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      mutate({ ...args, sessionToken } as FunctionArgs<TMutation>),
  )
}
