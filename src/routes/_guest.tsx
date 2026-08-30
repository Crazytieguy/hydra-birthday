import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { api } from '../../convex/_generated/api'
import { SessionEndedScreen } from '@/components/screens'

// Pathless layout for everything behind an invite. Children get a non-null
// `sessionToken` and a `me` snapshot in route context (see src/lib/guest.ts).
export const Route = createFileRoute('/_guest')({
  beforeLoad: async ({ context }) => {
    const { sessionToken } = context
    if (!sessionToken) throw redirect({ to: '/welcome' })
    const me = await context.queryClient.ensureQueryData(
      convexQuery(api.users.me, { sessionToken }),
    )
    if (!me) throw redirect({ to: '/welcome', search: { reason: 'invalid' } })
    return { sessionToken, me }
  },
  component: GuestLayout,
})

function GuestLayout() {
  const { sessionToken } = Route.useRouteContext()
  // Live: if the session is removed while the page is open, this flips to null.
  const { data: me } = useSuspenseQuery(
    convexQuery(api.users.me, { sessionToken }),
  )
  if (!me) return <SessionEndedScreen />
  return <Outlet />
}
