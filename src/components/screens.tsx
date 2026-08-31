import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/errors'

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
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-balance">{description}</p>}
      {children}
    </div>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null
}

export function ErrorScreen({ error }: { error: Error }) {
  return (
    <Screen title="Something went wrong" description={describeError(error)}>
      <Button asChild>
        <Link to="/">Back home</Link>
      </Button>
    </Screen>
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
