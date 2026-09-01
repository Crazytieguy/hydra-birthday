import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_guest/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/activities' })
  },
})
