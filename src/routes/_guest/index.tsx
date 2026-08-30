import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { CopyButton } from '@/components/copy-button'
import { useMe, useSessionMutation } from '@/lib/guest'
import { inviteUrl } from '@/lib/invites'

export const Route = createFileRoute('/_guest/')({ component: Home })

function Home() {
  const me = useMe()
  return (
    <div className="space-y-8 py-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Hi, {me.name}</h1>
        <p className="text-muted-foreground">
          You're in. The party details will show up here soon.
        </p>
        {me.isAdmin && (
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Admin</Link>
          </Button>
        )}
      </div>
      <DeviceLinkCard />
    </div>
  )
}

function DeviceLinkCard() {
  const createForSelf = useSessionMutation(api.invites.createForSelf)
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const { token } = await createForSelf({})
                setLink(inviteUrl(token))
              } finally {
                setBusy(false)
              }
            }}
          >
            Create link
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
