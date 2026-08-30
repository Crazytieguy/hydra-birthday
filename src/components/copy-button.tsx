import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const views = {
  idle: { Icon: Copy, text: null },
  copied: { Icon: Check, text: 'Copied' },
  failed: { Icon: X, text: 'Copy failed' },
}

export function CopyButton({
  text,
  label = 'Copy',
}: {
  text: string
  label?: string
}) {
  const [state, setState] = useState<keyof typeof views>('idle')
  const { Icon, text: feedback } = views[state]
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
      <Icon className="size-4" />
      {feedback ?? label}
    </Button>
  )
}
