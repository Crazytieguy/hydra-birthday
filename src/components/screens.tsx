import { useState } from 'react'
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

// A destructive action takes two clicks: the button restates itself before
// acting, and re-arms once the run settles. type="button" so it never
// submits an enclosing form.
export function ConfirmButton({
  label,
  confirmLabel,
  busy,
  size,
  className,
  onConfirm,
}: {
  label: string
  confirmLabel: string
  busy: boolean
  size?: 'default' | 'sm'
  className?: string
  onConfirm: () => Promise<unknown>
}) {
  const [confirming, setConfirming] = useState(false)
  if (confirming)
    return (
      <Button
        type="button"
        variant="destructive"
        size={size}
        disabled={busy}
        onClick={() => void onConfirm().finally(() => setConfirming(false))}
      >
        {confirmLabel}
      </Button>
    )
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={className}
      onClick={() => setConfirming(true)}
    >
      {label}
    </Button>
  )
}

const STEP_COUNT = 3

// The guided-flow page header: Back link plus, during the guest's first pass,
// the step badge. Every step page renders this so the count lives here.
export function StepHeader({ step, badge }: { step: number; badge: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to="/">← Back</Link>
      </Button>
      {badge && (
        <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
          Step {step} of {STEP_COUNT}
        </span>
      )}
    </div>
  )
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
