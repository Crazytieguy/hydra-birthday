// The meals guests can offer food for. Runtime-free so the browser shares the
// labels and limits. Saturday has no brunch (people arrive at 13:00).
export const MEALS = [
  { key: 'sat-dinner', label: 'Saturday dinner', when: 'Sat 18:30' },
  { key: 'sun-brunch', label: 'Sunday brunch', when: 'Sun 11:30' },
  { key: 'sun-dinner', label: 'Sunday dinner', when: 'Sun 18:30' },
] as const

export type MealKey = (typeof MEALS)[number]['key']
export const mealKeys = MEALS.map((meal) => meal.key)

export const DISH_MAX_LENGTH = 80
export const FEEDS_MAX = 200
export const OFFERS_PER_GUEST = 10
