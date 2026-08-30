import {
  Navigate,
  Outlet,
  createFileRoute,
  redirect,
} from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { sessionQueryOptions, useSessionQuery } from '@/lib/guest'

// Pathless layout for everything behind an invite. Children get a non-null
// `sessionToken` and a `me` snapshot in route context (see src/lib/guest.ts).
export const Route = createFileRoute('/_guest')({
  beforeLoad: async ({ context }) => {
    const { sessionToken } = context
    if (!sessionToken) throw redirect({ to: '/welcome' })
    const me = await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.users.me, {}, sessionToken),
    )
    if (!me) throw redirect({ to: '/welcome', search: { reason: 'invalid' } })
    return { sessionToken, me }
  },
  component: GuestLayout,
})

function GuestLayout() {
  // Live: if the session is removed while the page is open, this flips to null.
  const { data: me } = useSessionQuery(api.users.me, {})
  if (!me)
    return <Navigate to="/welcome" search={{ reason: 'invalid' }} replace />
  return <Outlet />
}
