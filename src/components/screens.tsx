import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { errorCode } from '@/lib/errors'

export function Screen({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="text-muted-foreground">{description}</p>}
      {children}
    </div>
  )
}

export function ErrorScreen({ error }: { error: Error }) {
  const code = errorCode(error)
  if (code === 'UNAUTHENTICATED') return <SessionEndedScreen />
  if (code === 'FORBIDDEN') {
    return (
      <Screen
        title="Admins only"
        description="This page is reserved for the birthday crew."
      >
        <Button asChild>
          <Link to="/">Back home</Link>
        </Button>
      </Screen>
    )
  }
  return (
    <Screen
      title="Something went wrong"
      description="An unexpected error occurred. Try refreshing the page."
    />
  )
}

export function NotFoundScreen() {
  return (
    <Screen title="Not found" description="We couldn't find that page.">
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </Screen>
  )
}

export function SessionEndedScreen() {
  return (
    <Screen
      title="Session ended"
      description="This browser's invite is no longer valid. Ask for a new link to get back in."
    />
  )
}
