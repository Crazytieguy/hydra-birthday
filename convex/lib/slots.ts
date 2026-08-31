// The weekend's hour grid. Runtime-free so the browser renders the same
// days/hours the server validates against.

export type Day = {
  date: string // ISO date, local to the party
  label: string
  startHour: number // inclusive
  endHour: number // exclusive; 24 = midnight
  enabled: boolean
}

// Friday is built but off until the organizers confirm collecting it;
// flipping `enabled` needs no migration (its blocked hours just start empty).
export const days: Array<Day> = [
  {
    date: '2026-09-11',
    label: 'Friday',
    startHour: 18,
    endHour: 24,
    enabled: false,
  },
  {
    date: '2026-09-12',
    label: 'Saturday',
    startHour: 10,
    endHour: 24,
    enabled: true,
  },
  {
    date: '2026-09-13',
    label: 'Sunday',
    startHour: 10,
    endHour: 24,
    enabled: true,
  },
]

export const enabledDays = () => days.filter((day) => day.enabled)

// An hour block's key: '2026-09-12T10' = Sep 12, 10:00–11:00.
export const hourKey = (date: string, hour: number) =>
  `${date}T${String(hour).padStart(2, '0')}`

export function dayHourKeys(day: Day): Array<string> {
  const keys: Array<string> = []
  for (let hour = day.startHour; hour < day.endHour; hour++)
    keys.push(hourKey(day.date, hour))
  return keys
}

export const enabledHourKeys = () =>
  new Set(enabledDays().flatMap((day) => dayHourKeys(day)))

// Soft cap only: copy asks guests to aim for this many strong votes and the
// UI warns past it; nothing ever blocks.
export const STRONG_VOTE_TARGET = 4

// FNV-1a, for per-user randomized-but-stable session ordering.
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
