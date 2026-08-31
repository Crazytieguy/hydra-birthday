import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CopyButton } from '@/components/copy-button'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useMe,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/')({
  loader: async ({ context }) => {
    const { sessionToken } = context
    await Promise.all([
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.partySessions.list, {}, sessionToken),
      ),
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.availability.mine, {}, sessionToken),
      ),
    ])
  },
  component: Home,
})

function Home() {
  const me = useMe()
  const { data: sessionData } = useSessionQuery(api.partySessions.list, {})
  const { data: mine } = useSessionQuery(api.availability.mine, {})

  const voteCount = sessionData.sessions.filter((s) => s.myVote !== null).length
  const doneVoting = sessionData.votesConfirmedAt !== null
  const doneAvailability = mine !== null && mine.confirmedAt !== null
  const done = doneVoting && doneAvailability

  return (
    <div className="space-y-8 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hi, {me.name}</h1>
        {done ? (
          <div className="space-y-2 text-muted-foreground">
            <p>
              That's everything, you're done. We'll build the schedule after
              Tuesday and send it out before the weekend.
            </p>
            <p>
              Have an idea for a session, or want to lead one that's missing a
              facilitator? Message Yoav, Libi, Guy, or Cormac.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Two things before Tuesday Sep 8: pick your sessions and mark when
            you can come. Ten minutes, tops.
          </p>
        )}
        {me.isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Admin</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/sessions" className="block">
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Sessions
                {doneVoting && <Badge variant="secondary">done</Badge>}
              </CardTitle>
              <CardDescription>
                {voteCount === 0
                  ? 'Vote for what you want to happen.'
                  : `${voteCount} vote${voteCount === 1 ? '' : 's'} in so far.`}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link to="/availability" className="block">
          <Card className="h-full transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                When can you come?
                {doneAvailability && <Badge variant="secondary">done</Badge>}
              </CardTitle>
              <CardDescription>
                Cross out the hours you can't make.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <DeviceLinkCard />
    </div>
  )
}

function DeviceLinkCard() {
  const createForSelf = useSessionAction(api.invites.createForSelf)
  const [link, setLink] = useState<string | null>(null)

  async function create() {
    const minted = await createForSelf.run({})
    if (minted) setLink(inviteUrl(minted.token))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Use another device</CardTitle>
        <CardDescription>
          Make a one-time link that signs another phone or laptop into this same
          account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {link ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
              {link}
            </code>
            <CopyButton text={link} />
          </div>
        ) : (
          <Button
            variant="secondary"
            disabled={createForSelf.busy}
            onClick={() => void create()}
          >
            Create link
          </Button>
        )}
        <ErrorText message={createForSelf.error} />
      </CardContent>
    </Card>
  )
}
