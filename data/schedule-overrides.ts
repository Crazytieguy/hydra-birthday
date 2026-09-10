// How the organizers' board becomes the guest schedule. The board (an
// artifact whose placements are exported to a JSON file) speaks in prod
// partySession ids, rooms and internal notes; guests see titles, times and a
// few deliberate labels. Everything guest-facing that isn't on the board
// lives here, keyed by board placement id or activity title.
import { days } from '../convex/lib/slots'

// Board day keys ('sat', 'sun') are the grid's day labels, shortened.
export const dayDates: Partial<Record<string, string>> = Object.fromEntries(
  days.map((day) => [day.label.slice(0, 3).toLowerCase(), day.date]),
)

// Board "frame:*" placements → band labels.
export const frameLabels: Partial<Record<string, string>> = {
  'frame:opening': 'Opening ceremony',
  'frame:brunch': 'Brunch',
  'frame:dinner': 'Dinner',
  'frame:party': 'Party',
}

// Guest-facing activity titles where the catalog title is too long or has
// changed. Keyed by the board (prod) title.
export const titleRenames: Partial<Record<string, string>> = {
  'Libi DJ Set Fusion Dance': "Libi's DJ set",
  'Osho Kundalini or whirling meditation': 'Osho active meditation',
  'REAL Jam Session (+ improvisation lesson)': 'REAL Jam Session',
  'At least moderately spicy authentic relating games':
    'Spicy authentic relating games',
  'Metta Meditation': 'Metta Meditation w/ Optional Cuddling',
}

export type PlacementOverride = {
  title?: string
  ribbon?: boolean
  note?: string
  // Labelled sub-spans inside a ribbon (hours from midnight).
  segments?: Array<{ label: string; start: number; end: number }>
  // Replace the board's time (hours from midnight, decimals for minutes).
  start?: number
  len?: number
  // Leave this placement off the guest schedule.
  drop?: boolean
}

// Keyed by the board's placement id (stable across board saves).
export const placementOverrides: Partial<Record<string, PlacementOverride>> = {
  // Circling runs three closed rounds; guests pick one.
  '8809k9': { title: 'Circling A' },
  z8g320: { title: 'Circling B' },
  hg5pgr: { title: 'Circling C' },
  // Person Do Thing: the 30-minute class folds into one ribbon with the play.
  '9gytpa': { drop: true },
  uvebxv: {
    ribbon: true,
    start: 14,
    len: 4.5,
    segments: [
      { label: 'Class', start: 14, end: 15 },
      { label: 'Play', start: 15, end: 18.5 },
    ],
    note: "Attend the class from 14:00 to 15:00 if you haven't played before!",
  },
  // Hot seat is continuous and come-and-go.
  '7ca8na': { ribbon: true, note: 'Come and go whenever you like.' },
}

// A title-only activity that isn't on the board at all (hours from
// midnight, like the board).
export type Extra = {
  day: string
  start: number
  len: number
  title: string
  note?: string
  open?: boolean
}

// Open slots: the last votes decide what goes there.
const openSlots: Array<[day: string, start: number, len: number]> = [
  ['sat', 20, 4],
  ['sun', 10, 3],
  ['sun', 13, 2],
  ['sun', 15, 3],
  ['sun', 20, 2],
]

export const extras: Array<Extra> = openSlots.map(([day, start, len]) => ({
  day,
  start,
  len,
  title: '?',
  open: true,
  note: 'Nothing is placed here yet. The last votes decide what goes in.',
}))
