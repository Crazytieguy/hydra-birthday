import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setState('copied')
        } catch {
          setState('failed')
        }
        setTimeout(() => setState('idle'), 2000)
      }}
    >
      {state === 'copied' ? (
        <Check className="size-4" />
      ) : state === 'failed' ? (
        <X className="size-4" />
      ) : (
        <Copy className="size-4" />
      )}
      {state === 'copied'
        ? 'Copied'
        : state === 'failed'
          ? 'Copy failed'
          : label}
    </Button>
  )
}
