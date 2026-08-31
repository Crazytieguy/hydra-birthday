import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../../../convex/_generated/api'
import { AdminSessions } from '@/components/admin-sessions'
import { sessionQueryOptions } from '@/lib/guest'

export const Route = createFileRoute('/_guest/admin/sessions')({
  loader: async ({ context }) => {
    const { sessionToken } = context
    await Promise.all([
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.partySessions.adminList, {}, sessionToken),
      ),
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.users.list, {}, sessionToken),
      ),
    ])
  },
  component: AdminSessions,
})
