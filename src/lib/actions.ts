import { useState } from 'react'
import { describeError } from '@/lib/errors'

// An async action plus the busy/error state a button needs. `run` resolves to
// undefined (and records a message) instead of throwing.
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (...args: TArgs): Promise<TResult | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await action(...args)
    } catch (caught) {
      setError(describeError(caught))
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, error }
}
