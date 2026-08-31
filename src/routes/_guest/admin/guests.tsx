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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Confirm, Day } from '@/components/admin-shared'
import { CopyButton } from '@/components/copy-button'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useMe,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/admin/guests')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.users.list, {}, context.sessionToken),
    )
  },
  component: Users,
})

type UserRow = (typeof api.users.list._returnType)[number]

function Users() {
  const me = useMe()
  const { data: users } = useSessionQuery(api.users.list, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle>Guests</CardTitle>
        <CardDescription>
          A recovery link gets a guest back in after they lose the browser they
          joined with. It also signs them out everywhere else.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Invited</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <UserRowView
                key={user._id}
                user={user}
                isMe={user._id === me._id}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function UserRowView({ user, isMe }: { user: UserRow; isMe: boolean }) {
  const setAdmin = useSessionAction(api.users.setAdmin)
  const createForUser = useSessionAction(api.invites.createForUser)
  const reissue = useSessionAction(api.invites.reissueInvite)
  const signOut = useSessionAction(api.users.signOutEverywhere)
  const [link, setLink] = useState<string | null>(null)

  // The joined and not-yet-joined states each mint one kind of link; only the
  // wording and the mutation differ.
  const mintLink =
    user.joinedAt === null
      ? {
          action: reissue,
          button: 'Replace invite link',
          copyLabel: 'Copy new link',
          title: `Replace ${user.name}'s invite link?`,
          description:
            'Their current link stops working, and you get a fresh one to send instead.',
          confirm: 'Replace',
        }
      : {
          action: createForUser,
          button: 'Recovery link',
          copyLabel: 'Copy recovery link',
          title: `Make a recovery link for ${user.name}?`,
          description:
            'The link signs one new device into their account. Using it signs every other device out, including the one they lost.',
          confirm: 'Make link',
        }

  async function mint() {
    const minted = await mintLink.action.run({ userId: user._id })
    if (minted) setLink(inviteUrl(minted.token))
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {user.name}
        <ErrorText
          message={
            setAdmin.error ??
            createForUser.error ??
            reissue.error ??
            signOut.error
          }
        />
      </TableCell>
      <TableCell>
        <Checkbox
          aria-label={`${user.name} is admin`}
          checked={user.isAdmin}
          disabled={isMe || setAdmin.busy}
          onCheckedChange={(checked) =>
            void setAdmin.run({ userId: user._id, isAdmin: checked === true })
          }
        />
      </TableCell>
      <TableCell className="text-muted-foreground">
        <Day timestamp={user.createdAt} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {user.joinedAt !== null ? (
          <Day timestamp={user.joinedAt} />
        ) : (
          <Badge variant="outline">not joined</Badge>
        )}
      </TableCell>
      <TableCell className="space-x-1 text-right whitespace-nowrap">
        {link ? (
          <CopyButton text={link} label={mintLink.copyLabel} />
        ) : (
          <Confirm
            trigger={
              <Button variant="ghost" size="sm" disabled={mintLink.action.busy}>
                {mintLink.button}
              </Button>
            }
            title={mintLink.title}
            description={mintLink.description}
            action={mintLink.confirm}
            onConfirm={() => void mint()}
          />
        )}
        {user.joinedAt !== null && (
          <Confirm
            trigger={
              <Button variant="ghost" size="sm" disabled={signOut.busy}>
                Sign out
              </Button>
            }
            title={`Sign ${user.name} out everywhere?`}
            description={
              isMe
                ? "That includes this browser. You'll need a new link to get back in."
                : 'Every device they joined with stops working right away. Their account and name stay, and a recovery link gets them back in.'
            }
            action="Sign out"
            onConfirm={() => void signOut.run({ userId: user._id })}
          />
        )}
      </TableCell>
    </TableRow>
  )
}
