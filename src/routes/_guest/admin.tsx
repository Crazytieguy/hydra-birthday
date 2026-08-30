import { useState } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
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
import { CopyButton } from '@/components/copy-button'
import { useMe, useSessionMutation, useSessionToken } from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/admin')({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: '/' })
  },
  loader: async ({ context }) => {
    const { sessionToken } = context
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.invites.list, { sessionToken }),
      ),
      context.queryClient.ensureQueryData(
        convexQuery(api.users.list, { sessionToken }),
      ),
    ])
  },
  component: AdminPage,
})

const day = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10)

function AdminPage() {
  return (
    <div className="space-y-8 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
      <MintInvites />
      <Invites />
      <Users />
    </div>
  )
}

type FreshLink = { label: string; url: string }

function MintInvites() {
  const create = useSessionMutation(api.invites.create)
  const [names, setNames] = useState('')
  const [grantsAdmin, setGrantsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<FreshLink[]>([])

  async function mint() {
    const labels = names
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (labels.length === 0) return
    setBusy(true)
    try {
      const minted = await create({
        labels,
        grantsAdmin: grantsAdmin || undefined,
      })
      setFresh(
        minted.map(({ label, token }) => ({ label, url: inviteUrl(token) })),
      )
      setNames('')
      setGrantsAdmin(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New invite links</CardTitle>
        <CardDescription>
          One name per line. Links are shown once, right here — copy them before
          leaving.
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
          <Button disabled={busy || !names.trim()} onClick={mint}>
            Create links
          </Button>
        </div>
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
  const sessionToken = useSessionToken()
  const { data: invites } = useSuspenseQuery(
    convexQuery(api.invites.list, { sessionToken }),
  )
  const revoke = useSessionMutation(api.invites.revoke)

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
              <TableRow key={invite._id}>
                <TableCell className="font-medium">
                  {invite.label ?? '—'}
                  {invite.kind === 'existing' && (
                    <Badge variant="outline" className="ml-2">
                      device link
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
                    ? `Claimed${invite.claimedByName ? ` by ${invite.claimedByName}` : ''}`
                    : 'Unclaimed'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {day(invite.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  {!invite.claimedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke({ inviteId: invite._id })}
                    >
                      Revoke
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function Users() {
  const sessionToken = useSessionToken()
  const me = useMe()
  const { data: users } = useSuspenseQuery(
    convexQuery(api.users.list, { sessionToken }),
  )
  const setAdmin = useSessionMutation(api.users.setAdmin)
  const createForUser = useSessionMutation(api.invites.createForUser)
  const [links, setLinks] = useState<Partial<Record<Id<'users'>, string>>>({})

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests</CardTitle>
        <CardDescription>
          "New link" signs another device into that guest's account — for when
          someone lost the browser they joined with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const link = links[user._id]
              return (
                <TableRow key={user._id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>
                    <Checkbox
                      aria-label={`${user.name} is admin`}
                      checked={user.isAdmin}
                      disabled={user._id === me._id}
                      onCheckedChange={(checked) =>
                        setAdmin({
                          userId: user._id,
                          isAdmin: checked === true,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {day(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {link ? (
                      <CopyButton text={link} label="Copy link" />
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const { token } = await createForUser({
                            userId: user._id,
                          })
                          setLinks((prev) => ({
                            ...prev,
                            [user._id]: inviteUrl(token),
                          }))
                        }}
                      >
                        New link
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
