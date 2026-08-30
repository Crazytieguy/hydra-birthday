import { createFileRoute } from '@tanstack/react-router'
import { Screen } from '@/components/screens'

// Where browsers without a (valid) invite land.
export const Route = createFileRoute('/welcome')({
  validateSearch: (search: Record<string, unknown>): { reason?: 'invalid' } =>
    search.reason === 'invalid' ? { reason: 'invalid' } : {},
  component: Welcome,
})

function Welcome() {
  const { reason } = Route.useSearch()
  return (
    <Screen
      title="Hydra Birthday"
      description={
        reason === 'invalid'
          ? "This browser's invite has expired or was removed. Ask for a new link to get back in."
          : 'This is an invite-only site. Open the personal link you were sent to get in.'
      }
    />
  )
}
