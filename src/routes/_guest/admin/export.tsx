import { createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { api } from '../../../../convex/_generated/api'
import { dayHourKeys } from '../../../../convex/lib/slots'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { sessionQueryOptions, useSessionQuery } from '@/lib/guest'

// Raw data downloads for offline analysis. The JSON is the full export; the
// CSVs are flat cuts of it with names joined in, one row per fact, for
// spreadsheets and pandas.
export const Route = createFileRoute('/_guest/admin/export')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.export.all, {}, context.sessionToken),
    )
  },
  component: ExportPage,
})

type Export = typeof api.export.all._returnType

const iso = (ms: number | null) =>
  ms === null ? '' : new Date(ms).toISOString()

// RFC 4180: quote any field that could break a row, double the quotes inside.
function csv(rows: Array<Array<string | number | boolean | null>>): string {
  const cell = (value: string | number | boolean | null) => {
    const text = value === null ? '' : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

const stamp = () => new Date().toISOString().slice(0, 10)

const files = [
  {
    label: 'Everything (JSON)',
    build: (data: Export) =>
      download(
        `hydra-birthday-${stamp()}.json`,
        JSON.stringify(
          { exportedAt: new Date().toISOString(), ...data },
          null,
          2,
        ),
        'application/json',
      ),
  },
  {
    label: 'Guests (CSV)',
    build: (data: Export) =>
      download(
        `guests-${stamp()}.csv`,
        csv([
          [
            'guest_id',
            'name',
            'is_admin',
            'created_at',
            'joined_at',
            'votes_confirmed_at',
          ],
          ...data.users.map((user) => [
            user._id,
            user.name,
            user.isAdmin,
            iso(user._creationTime),
            iso(user.joinedAt),
            iso(user.votesConfirmedAt),
          ]),
        ]),
        'text/csv',
      ),
  },
  {
    label: 'Activities (CSV)',
    build: (data: Export) =>
      download(
        `activities-${stamp()}.csv`,
        csv([
          [
            'activity_id',
            'title',
            'description',
            'catalog_key',
            'facilitator_ids',
            'needs_facilitator',
            'hidden',
            'visible_since',
            'proposal',
            'created_at',
          ],
          ...data.activities.map((activity) => [
            activity._id,
            activity.title,
            activity.description,
            activity.catalogKey,
            activity.facilitatorIds.join(' '),
            activity.needsFacilitator,
            activity.hidden,
            iso(activity.visibleSince),
            activity.proposal,
            iso(activity._creationTime),
          ]),
        ]),
        'text/csv',
      ),
  },
  {
    label: 'Votes (CSV)',
    build: (data: Export) => {
      const users = new Map(data.users.map((user) => [user._id, user]))
      const activities = new Map(data.activities.map((a) => [a._id, a]))
      download(
        `votes-${stamp()}.csv`,
        csv([
          [
            'guest_id',
            'guest',
            'activity_id',
            'activity',
            'strength',
            'created_at',
          ],
          ...data.votes.map((vote) => [
            vote.userId,
            users.get(vote.userId)?.name ?? null,
            vote.partySessionId,
            activities.get(vote.partySessionId)?.title ?? null,
            vote.strength,
            iso(vote._creationTime),
          ]),
        ]),
        'text/csv',
      )
    },
  },
  {
    label: 'Availability (CSV)',
    build: (data: Export) => {
      const users = new Map(data.users.map((user) => [user._id, user]))
      const hours = data.grid
        .filter((day) => day.enabled)
        .flatMap((day) => dayHourKeys(day))
      download(
        `availability-${stamp()}.csv`,
        csv([
          ['guest_id', 'guest', 'hour', 'blocked', 'confirmed_at'],
          ...data.availability.flatMap((row) => {
            const blocked = new Set(row.blockedHours)
            return hours.map((hour) => [
              row.userId,
              users.get(row.userId)?.name ?? null,
              hour,
              blocked.has(hour),
              iso(row.confirmedAt),
            ])
          }),
        ]),
        'text/csv',
      )
    },
  },
  {
    label: 'Food (CSV)',
    build: (data: Export) => {
      const users = new Map(data.users.map((user) => [user._id, user]))
      download(
        `food-${stamp()}.csv`,
        csv([
          ['guest_id', 'guest', 'meal', 'dish', 'feeds', 'created_at'],
          ...data.foodOffers.map((row) => [
            row.userId,
            users.get(row.userId)?.name ?? null,
            row.meal,
            row.dish,
            row.feeds,
            iso(row._creationTime),
          ]),
        ]),
        'text/csv',
      )
    },
  },
]

function ExportPage() {
  const { data } = useSessionQuery(api.export.all, {})
  return (
    <Card>
      <CardHeader>
        <CardTitle>Export</CardTitle>
        <CardDescription>
          The raw data, for analyzing however you like. Ids match across files,
          so the tables join. The JSON has every field; the CSVs are flat cuts
          of it with names filled in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <Button
              key={file.label}
              type="button"
              variant="outline"
              onClick={() => file.build(data)}
            >
              <Download data-icon="inline-start" />
              {file.label}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">
          Availability is one row per guest per hour. A guest with no rows never
          confirmed, which means no data, not free all weekend. Timestamps are
          UTC.
        </p>
      </CardContent>
    </Card>
  )
}
