// The meals guests can offer food for. Runtime-free so the browser shares the
// labels and limits. Times follow the schedule (Sun dinner moved to 18:00).
export const MEALS = [
  { key: 'sat-brunch', label: 'Saturday brunch', when: 'Sat 11:00' },
  { key: 'sat-dinner', label: 'Saturday dinner', when: 'Sat 18:30' },
  { key: 'sun-brunch', label: 'Sunday brunch', when: 'Sun 11:00' },
  { key: 'sun-dinner', label: 'Sunday dinner', when: 'Sun 18:00' },
] as const

export type MealKey = (typeof MEALS)[number]['key']

export const DISH_MAX_LENGTH = 80
export const OFFERS_PER_GUEST = 10
