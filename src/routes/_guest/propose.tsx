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
import { ConfirmButton, ErrorText, StepHeader } from '@/components/screens'
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

type MyFacilitatedSession =
  (typeof api.partySessions.list._returnType)['myFacilitatedSession']

function ProposePage() {
  const { data } = useSessionQuery(api.partySessions.list, {})
  const mine = data.myFacilitatedSession

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="space-y-2">
        <StepHeader step={3} badge={mine === null} />
        <h1 className="text-3xl font-bold tracking-tight">
          Propose an activity
        </h1>
        {mine === null ? (
          <p>
            If you have an idea for an activity, propose it below! If it gets
            enough votes we'll schedule it. The best proposals are unique
            experiences that would be great birthday gifts.
          </p>
        ) : (
          <p>
            You've proposed <strong>{mine.title}</strong>. Message Yoav, Libi,
            Guy, or Cormac if you have another idea.
          </p>
        )}
      </div>
      {/* Keyed so a fresh proposal re-seeds the form with the saved text. */}
      <SessionForm key={mine?._id ?? 'new'} mine={mine} />
    </div>
  )
}

function SessionForm({ mine }: { mine: MyFacilitatedSession }) {
  const navigate = useNavigate()
  const propose = useSessionAction(api.partySessions.propose)
  const updateMine = useSessionAction(api.partySessions.updateMine)
  const withdraw = useSessionAction(api.partySessions.withdrawMine)
  const action = mine === null ? propose : updateMine
  const [title, setTitle] = useState(mine?.title ?? '')
  const [description, setDescription] = useState(mine?.description ?? '')

  async function submit() {
    // The server normalizes both fields (trims, drops a blank description).
    const result =
      mine === null
        ? await propose.run({ title, description })
        : await updateMine.run({
            partySessionId: mine._id,
            title,
            description,
          })
    if (result !== undefined) void navigate({ to: '/' })
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {mine?.hasOtherVotes && (
        <p className="text-sm">
          People have already voted for it, so don't change it into something
          completely different.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="propose-title">Title</Label>
        <Input
          id="propose-title"
          required
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
          disabled={action.busy}
        >
          {mine === null ? 'Propose' : 'Save changes'}
        </Button>
        {mine === null && (
          <Button asChild variant="ghost">
            <Link to="/">Maybe later</Link>
          </Button>
        )}
        {mine?.canWithdraw && (
          <ConfirmButton
            label="Withdraw"
            confirmLabel="Sure? Its votes go too"
            busy={withdraw.busy}
            className="text-destructive"
            onConfirm={() => withdraw.run({ partySessionId: mine._id })}
          />
        )}
      </div>
      <ErrorText message={action.error ?? withdraw.error} />
    </form>
  )
}
