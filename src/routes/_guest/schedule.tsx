import { Navigate, createFileRoute, redirect } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { dayHourKeys, enabledDays } from '../../../convex/lib/slots'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { sessionQueryOptions, useMe, useSessionQuery } from '@/lib/guest'

// Organizer-only raw-data views for hand-scheduling. Deliberately stateless:
// everything renders from schedule.raw, so views can change freely.
export const Route = createFileRoute('/_guest/schedule')({
  beforeLoad: ({ context }) => {
    if (!context.me.isAdmin) throw redirect({ to: '/' })
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.schedule.raw, {}, context.sessionToken),
    )
  },
  component: SchedulePage,
})

type Raw = typeof api.schedule.raw._returnType

function SchedulePage() {
  const me = useMe()
  const { data } = useSessionQuery(api.schedule.raw, {})
  if (!me.isAdmin) return <Navigate to="/" replace />
  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Scheduling data</h1>
      <People data={data} />
      <Sessions data={data} />
    </div>
  )
}

const userById = (data: Raw) =>
  new Map(data.users.map((user) => [user._id, user]))

function People({ data }: { data: Raw }) {
  const votesByUser = new Map<string, { regular: number; strong: number }>()
  for (const vote of data.votes) {
    const counts = votesByUser.get(vote.userId) ?? { regular: 0, strong: 0 }
    counts[vote.strength]++
    votesByUser.set(vote.userId, counts)
  }
  const availabilityByUser = new Map(
    data.availability.map((row) => [row.userId, row]),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>
          Unconfirmed availability means no data, not free-all-weekend.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Votes</TableHead>
              <TableHead>Done voting</TableHead>
              <TableHead>Availability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.users.map((user) => {
              const counts = votesByUser.get(user._id)
              const availability = availabilityByUser.get(user._id)
              return (
                <TableRow key={user._id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>
                    {user.joinedAt === null ? (
                      <Badge variant="outline">not joined</Badge>
                    ) : (
                      'yes'
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {counts
                      ? `${counts.regular} + ${counts.strong} strong`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {user.votesConfirmedAt !== null ? 'yes' : '—'}
                  </TableCell>
                  <TableCell>
                    {availability?.confirmedAt != null ? (
                      `${availability.blockedHours.length} hours blocked`
                    ) : (
                      <Badge variant="outline">no data</Badge>
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

function Sessions({ data }: { data: Raw }) {
  const users = userById(data)
  const nameOf = (id: Id<'users'>) => users.get(id)?.name ?? '?'
  const availabilityByUser = new Map(
    data.availability.map((row) => [row.userId, row]),
  )

  const sessions = data.sessions
    .map((session) => {
      const votes = data.votes.filter(
        (vote) => vote.partySessionId === session._id,
      )
      return {
        ...session,
        strongVoters: votes
          .filter((vote) => vote.strength === 'strong')
          .map((vote) => vote.userId),
        regularVoters: votes
          .filter((vote) => vote.strength === 'regular')
          .map((vote) => vote.userId),
      }
    })
    .sort(
      (a, b) =>
        b.strongVoters.length * 2 +
        b.regularVoters.length -
        (a.strongVoters.length * 2 + a.regularVoters.length),
    )

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">
        Sessions, most wanted first
      </h2>
      {sessions.map((session) => {
        // Everyone whose availability matters for this session.
        const people = [
          ...new Set([
            ...session.facilitatorIds,
            ...session.strongVoters,
            ...session.regularVoters,
          ]),
        ]
        const confirmed = people.filter(
          (id) => availabilityByUser.get(id)?.confirmedAt != null,
        )
        const noData = people.filter(
          (id) => availabilityByUser.get(id)?.confirmedAt == null,
        )
        const availableAt = (hour: string) =>
          confirmed.filter(
            (id) => !availabilityByUser.get(id)!.blockedHours.includes(hour),
          )

        return (
          <Card key={session._id}>
            <CardHeader>
              <CardTitle className="text-base">
                {session.title}
                {session.hidden && (
                  <Badge variant="outline" className="ml-2">
                    hidden
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {session.facilitatorIds.length > 0
                  ? `Facilitated by ${session.facilitatorIds.map(nameOf).join(', ')}`
                  : session.needsFacilitator
                    ? 'Needs a facilitator'
                    : 'No facilitator linked yet'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Strong:</span>{' '}
                {session.strongVoters.map(nameOf).join(', ') || '—'}
              </p>
              <p>
                <span className="font-medium">Regular:</span>{' '}
                {session.regularVoters.map(nameOf).join(', ') || '—'}
              </p>
              {confirmed.length > 0 && (
                <div className="space-y-2 overflow-x-auto">
                  {enabledDays().map((day) => (
                    <div key={day.date} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-muted-foreground">
                        {day.label.slice(0, 3)}
                      </span>
                      <div className="flex gap-0.5">
                        {dayHourKeys(day).map((hour) => {
                          const available = availableAt(hour)
                          const facilitatorsAvailable =
                            session.facilitatorIds.length === 0 ||
                            session.facilitatorIds.every(
                              (id) =>
                                availabilityByUser.get(id)?.confirmedAt ==
                                  null ||
                                available.some(
                                  (availableId) => availableId === id,
                                ),
                            )
                          const fraction =
                            confirmed.length > 0
                              ? available.length / confirmed.length
                              : 0
                          return (
                            <div
                              key={hour}
                              title={`${hour.slice(11)}:00 — ${available
                                .map(nameOf)
                                .join(', ')}`}
                              className={`flex h-8 w-8 shrink-0 flex-col items-center justify-center rounded-sm border text-[10px] tabular-nums ${
                                facilitatorsAvailable
                                  ? ''
                                  : 'border-destructive'
                              }`}
                              style={{
                                backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(fraction * 60)}%, transparent)`,
                              }}
                            >
                              <span className="text-muted-foreground">
                                {hour.slice(11)}
                              </span>
                              <span>{available.length}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Cell = people available that hour, out of {confirmed.length}{' '}
                    with confirmed availability. Red border = a facilitator is
                    busy then.
                  </p>
                </div>
              )}
              {noData.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  No availability data: {noData.map(nameOf).join(', ')}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
