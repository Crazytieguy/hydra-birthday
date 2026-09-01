import {
  Link,
  Navigate,
  Outlet,
  createFileRoute,
  redirect,
} from '@tanstack/react-router'
import { useMe } from '@/lib/guest'

// Layout for every organizer screen: one gate, one nav; each former card is
// its own child route.
export const Route = createFileRoute('/_guest/admin')({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: '/' })
  },
  component: AdminLayout,
})

const tabs = [
  { to: '/admin/activities', label: 'Activities' },
  { to: '/admin/invites', label: 'Invites' },
  { to: '/admin/guests', label: 'Guests' },
  { to: '/admin/schedule', label: 'Schedule' },
] as const

function AdminLayout() {
  const me = useMe()
  // Demoted while the page is open: leave before the admin queries error out.
  if (!me.isAdmin) return <Navigate to="/" replace />
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
      <nav className="border-border flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="text-muted-foreground -mb-px border-b-2 border-transparent px-3 py-2 text-sm font-bold"
            activeProps={{
              className: 'border-primary text-foreground',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
