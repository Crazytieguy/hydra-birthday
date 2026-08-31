import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../../../convex/_generated/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Confirm, Day } from '@/components/admin-shared'
import { CopyButton } from '@/components/copy-button'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/admin/invites')({
  loader: async ({ context }) => {
    const { sessionToken } = context
    await Promise.all([
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.invites.list, {}, sessionToken),
      ),
      context.queryClient.ensureQueryData(
        sessionQueryOptions(api.users.list, {}, sessionToken),
      ),
    ])
  },
  component: InvitesPage,
})

function InvitesPage() {
  return (
    <div className="space-y-6">
      <MintInvites />
      <Invites />
    </div>
  )
}

type InviteRow = (typeof api.invites.list._returnType)[number]

type FreshLink = { label: string; url: string }

function MintInvites() {
  const create = useSessionAction(api.invites.create)
  const [names, setNames] = useState('')
  const [grantsAdmin, setGrantsAdmin] = useState(false)
  const [fresh, setFresh] = useState<Array<FreshLink>>([])

  async function mint() {
    // The server trims, collapses whitespace and skips blank lines.
    const minted = await create.run({ labels: names.split('\n'), grantsAdmin })
    if (!minted) return
    setFresh(
      minted.map(({ label, token }) => ({ label, url: inviteUrl(token) })),
    )
    setNames('')
    setGrantsAdmin(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New invite links</CardTitle>
        <CardDescription>
          Enter one name per line, then make sure to copy the result before you
          leave the page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={'Alice\nBob'}
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-4">
          <Label className="flex items-center gap-2">
            <Checkbox
              checked={grantsAdmin}
              onCheckedChange={(checked) => setGrantsAdmin(checked === true)}
            />
            Grant admin
          </Label>
          <Button
            disabled={create.busy || !names.trim()}
            onClick={() => void mint()}
          >
            {create.busy ? 'Creating…' : 'Create links'}
          </Button>
        </div>
        <ErrorText message={create.error} />
        {fresh.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{fresh.length} new links</p>
              <CopyButton
                label="Copy all (name ⇥ link)"
                text={fresh.map((f) => `${f.label}\t${f.url}`).join('\n')}
              />
            </div>
            <Table>
              <TableBody>
                {fresh.map((f) => (
                  <TableRow key={f.url}>
                    <TableCell className="font-medium">{f.label}</TableCell>
                    <TableCell className="max-w-0 truncate font-mono text-xs">
                      {f.url}
                    </TableCell>
                    <TableCell className="text-right">
                      <CopyButton text={f.url} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Invites() {
  const { data: invites } = useSessionQuery(api.invites.list, {})
  const { data: users } = useSessionQuery(api.users.list, {})
  const names = new Map(users.map((user) => [user._id, user.name]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invites</CardTitle>
        <CardDescription>
          {invites.filter((i) => i.claimedAt).length} of {invites.length}{' '}
          claimed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>For</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.map((invite) => (
              <InviteRowView
                key={invite._id}
                invite={invite}
                claimedByName={
                  invite.claimedByUserId
                    ? names.get(invite.claimedByUserId)
                    : undefined
                }
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function InviteRowView({
  invite,
  claimedByName,
}: {
  invite: InviteRow
  claimedByName: string | undefined
}) {
  const revoke = useSessionAction(api.invites.revoke)
  return (
    <TableRow>
      <TableCell className="font-medium">
        {invite.label}
        {invite.kind !== 'new' && (
          <Badge variant="outline" className="ml-2">
            {invite.kind} link
          </Badge>
        )}
        {invite.grantsAdmin && (
          <Badge variant="secondary" className="ml-2">
            admin
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {invite.claimedAt
          ? `Claimed${claimedByName ? ` by ${claimedByName}` : ''}`
          : 'Unclaimed'}
        <ErrorText message={revoke.error} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        <Day timestamp={invite.createdAt} />
      </TableCell>
      <TableCell className="text-right">
        {!invite.claimedAt && (
          <Confirm
            trigger={
              <Button variant="ghost" size="sm" disabled={revoke.busy}>
                Revoke
              </Button>
            }
            title={`Revoke ${invite.label}'s link?`}
            description="If you already sent it, it stops working. You can make a new one afterwards."
            action="Revoke"
            onConfirm={() => void revoke.run({ inviteId: invite._id })}
          />
        )}
      </TableCell>
    </TableRow>
  )
}
