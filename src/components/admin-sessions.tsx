import { useState } from 'react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  DESCRIPTION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from '../../convex/lib/names'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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
import { ConfirmButton, ErrorText } from '@/components/screens'
import { useSessionAction, useSessionQuery } from '@/lib/guest'

type SessionRow = (typeof api.partySessions.adminList._returnType)[number]
type UserRow = (typeof api.users.list._returnType)[number]

type Draft = {
  partySessionId: Id<'partySessions'> | null
  title: string
  description: string
  facilitatorIds: Array<Id<'users'>>
  needsFacilitator: boolean
  hidden: boolean
}

const emptyDraft: Draft = {
  partySessionId: null,
  title: '',
  description: '',
  facilitatorIds: [],
  needsFacilitator: false,
  hidden: false,
}

const draftOf = (session: SessionRow): Draft => ({
  partySessionId: session._id,
  title: session.title,
  description: session.description ?? '',
  facilitatorIds: session.facilitatorIds,
  needsFacilitator: session.needsFacilitator,
  hidden: session.hidden,
})

export function AdminSessions() {
  const { data: sessions } = useSessionQuery(api.partySessions.adminList, {})
  const { data: users } = useSessionQuery(api.users.list, {})
  const [draft, setDraft] = useState<Draft | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          The catalog guests vote on. Hiding a session keeps its votes; deleting
          one erases them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="secondary" onClick={() => setDraft(emptyDraft)}>
          New session
        </Button>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Facilitators</TableHead>
              <TableHead className="text-right">Votes</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <SessionRowView
                key={session._id}
                session={session}
                onEdit={() => setDraft(draftOf(session))}
              />
            ))}
          </TableBody>
        </Table>
        {draft && (
          <SessionDialog
            draft={draft}
            users={users}
            onClose={() => setDraft(null)}
          />
        )}
      </CardContent>
    </Card>
  )
}

function SessionRowView({
  session,
  onEdit,
}: {
  session: SessionRow
  onEdit: () => void
}) {
  const remove = useSessionAction(api.partySessions.remove)

  return (
    <TableRow>
      <TableCell className="font-medium">
        {session.title}
        {session.hidden && (
          <Badge variant="outline" className="ml-2">
            hidden
          </Badge>
        )}
        {session.needsFacilitator && (
          <Badge variant="secondary" className="ml-2">
            needs facilitator
          </Badge>
        )}
        <ErrorText message={remove.error} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {session.facilitatorNames.join(', ') || '—'}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">
        {session.regularVotes} + {session.strongVotes} strong
      </TableCell>
      <TableCell className="space-x-1 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <ConfirmButton
          label="Delete"
          confirmLabel="Really delete, votes included"
          size="sm"
          busy={remove.busy}
          onConfirm={() => remove.run({ partySessionId: session._id })}
        />
      </TableCell>
    </TableRow>
  )
}

function SessionDialog({
  draft,
  users,
  onClose,
}: {
  draft: Draft
  users: Array<UserRow>
  onClose: () => void
}) {
  const create = useSessionAction(api.partySessions.create)
  const update = useSessionAction(api.partySessions.update)
  const [form, setForm] = useState(draft)
  const busy = create.busy || update.busy

  async function save() {
    const args = {
      title: form.title,
      description: form.description.trim() || undefined,
      facilitatorIds: form.facilitatorIds,
      needsFacilitator: form.needsFacilitator,
      hidden: form.hidden,
    }
    const result =
      form.partySessionId === null
        ? await create.run(args)
        : await update.run({ ...args, partySessionId: form.partySessionId })
    if (result !== undefined) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {form.partySessionId ? 'Edit session' : 'New session'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-title">Title</Label>
            <Input
              id="session-title"
              maxLength={TITLE_MAX_LENGTH}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-description">Description</Label>
            <Textarea
              id="session-description"
              rows={6}
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Facilitators</Label>
            <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto">
              {users.map((user) => (
                <Label
                  key={user._id}
                  className="flex items-center gap-2 font-normal"
                >
                  <Checkbox
                    checked={form.facilitatorIds.includes(user._id)}
                    onCheckedChange={(checked) =>
                      setForm({
                        ...form,
                        facilitatorIds:
                          checked === true
                            ? [...form.facilitatorIds, user._id]
                            : form.facilitatorIds.filter(
                                (id) => id !== user._id,
                              ),
                      })
                    }
                  />
                  {user.name}
                </Label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={form.needsFacilitator}
                onCheckedChange={(checked) =>
                  setForm({ ...form, needsFacilitator: checked === true })
                }
              />
              Looking for a facilitator
            </Label>
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={form.hidden}
                onCheckedChange={(checked) =>
                  setForm({ ...form, hidden: checked === true })
                }
              />
              Hidden from guests
            </Label>
          </div>
          <ErrorText message={create.error ?? update.error} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !form.title.trim()}
            onClick={() => void save()}
          >
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
