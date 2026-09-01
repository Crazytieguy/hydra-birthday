import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../../convex/lib/names'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'

export const Route = createFileRoute('/_guest/propose')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.partySessions.list, {}, context.sessionToken),
    )
  },
  component: ProposePage,
})

function ProposePage() {
  const navigate = useNavigate()
  const { data } = useSessionQuery(api.partySessions.list, {})
  const propose = useSessionAction(api.partySessions.propose)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const mine = data.myFacilitatedSession

  async function submit() {
    const trimmedDescription = description.trim()
    const result = await propose.run({
      title,
      description: trimmedDescription ? trimmedDescription : undefined,
    })
    if (result !== undefined) void navigate({ to: '/' })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link to="/">← Back</Link>
          </Button>
          {mine === null && (
            <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
              Step 3 of 3
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Propose a session</h1>
        {mine === null && (
          <p>
            Have an idea? Propose one session and it goes on the list for
            everyone to vote on. You'll be the one running it. Skipping this is
            totally fine.
          </p>
        )}
      </div>

      {mine === null ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="propose-title">Title</Label>
            <Input
              id="propose-title"
              maxLength={TITLE_MAX_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="propose-description">Description (optional)</Label>
            <Textarea
              id="propose-description"
              rows={6}
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="lg"
              className="rounded-full px-8"
              disabled={propose.busy}
            >
              Put it on the list
            </Button>
            <Button asChild variant="ghost">
              <Link to="/">Maybe later</Link>
            </Button>
          </div>
          <ErrorText message={propose.error} />
        </form>
      ) : (
        <p>
          You're running <strong>{mine.title}</strong>. Message Yoav, Libi, or
          Guy if you want to change or drop it.
        </p>
      )}
    </div>
  )
}
