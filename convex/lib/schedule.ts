// Time helpers shared by the schedule query, the sync script and the page.
// Entries store minutes from local midnight; a block that runs past midnight
// has end > 1440 and still belongs to the day it started on.

export const MINUTES_PER_DAY = 1440

export const hoursToMinutes = (hours: number) => Math.round(hours * 60)

// '13:30', and '01:00' for 25:00.
export function formatMinutes(minutes: number): string {
  const total =
    ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const formatRange = (start: number, end: number) =>
  `${formatMinutes(start)} to ${formatMinutes(end)}`
