import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../../convex/_generated/api'
import { DISH_MAX_LENGTH, FEEDS_MAX, MEALS } from '../../../convex/lib/meals'
import type { MealKey } from '../../../convex/lib/meals'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorText } from '@/components/screens'
import {
  sessionQueryOptions,
  useSessionAction,
  useSessionQuery,
} from '@/lib/guest'

export const Route = createFileRoute('/_guest/food')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.food.list, {}, context.sessionToken),
    )
  },
  component: FoodPage,
})

type Offer =
  (typeof api.food.list._returnType)['meals'][number]['offers'][number]

// Hairline-separated sections on paper, no cards: intro, the vegan rule, the
// form, then everything already offered.
function FoodPage() {
  const { data } = useSessionQuery(api.food.list, {})
  const [editing, setEditing] = useState<Offer | null>(null)
  const remove = useSessionAction(api.food.remove)

  return (
    <div className="divide-border mx-auto max-w-2xl divide-y py-6 pb-24">
      <div className="space-y-2 pb-5">
        <h1 className="text-3xl font-bold tracking-tight">Bring food?</h1>
        <p>
          Let us know if you'd like to bring food to share, and we'll fill the
          gaps as needed.
        </p>
      </div>

      <p className="font-display py-4 font-bold">
        All food is vegan, yours too. No meat, fish, dairy, eggs, or honey.
      </p>

      <OfferForm
        key={editing?._id ?? 'new'}
        editing={editing}
        onDone={() => setEditing(null)}
      />

      <div className="space-y-5 pt-5">
        <h2 className="font-display text-primary text-xl font-bold">
          Already on offer
        </h2>
        {data.meals.map((meal) => (
          <section key={meal.key}>
            <div className="border-border flex items-baseline gap-2 border-b pb-1">
              <h3 className="font-display font-bold">{meal.label}</h3>
              <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
                {meal.when}
              </span>
            </div>
            {meal.offers.length === 0 ? (
              <p className="text-muted-foreground py-2.5 text-sm">
                Nothing yet.
              </p>
            ) : (
              meal.offers.map((offer) => (
                <div
                  key={offer._id}
                  className="border-border flex items-center gap-3 border-b py-2.5"
                >
                  <div className="min-w-0 flex-grow">
                    <p className="leading-tight font-bold">{offer.dish}</p>
                    <p className="text-muted-foreground text-sm">
                      {offer.mine ? (
                        <span className="text-primary font-bold">You</span>
                      ) : (
                        offer.name
                      )}
                      {' · feeds '}
                      {offer.feeds}
                    </p>
                  </div>
                  {offer.mine && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(offer)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.busy}
                        onClick={() => void remove.run({ offerId: offer._id })}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </section>
        ))}
        <ErrorText message={remove.error} />
      </div>
    </div>
  )
}

// Add a dish, or edit one of yours (the form is remounted per `editing`).
function OfferForm({
  editing,
  onDone,
}: {
  editing: Offer | null
  onDone: () => void
}) {
  const [meal, setMeal] = useState<MealKey>(editing?.meal ?? 'sat-brunch')
  const [dish, setDish] = useState(editing?.dish ?? '')
  const [feeds, setFeeds] = useState(editing ? String(editing.feeds) : '')
  const offer = useSessionAction(api.food.offer)
  const update = useSessionAction(api.food.update)
  const action = editing ? update : offer

  async function submit() {
    const args = { meal, dish, feeds: Number(feeds) }
    // run() resolves undefined on failure (the error is shown below).
    const result = editing
      ? await update.run({ offerId: editing._id, ...args })
      : await offer.run(args)
    if (result !== undefined) {
      setDish('')
      setFeeds('')
      onDone()
    }
  }

  return (
    <form
      className="space-y-3 py-5"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className="font-display text-primary text-xl font-bold">
        {editing ? 'Edit your dish' : 'Add a dish'}
      </h2>
      <div className="flex flex-wrap gap-2">
        {MEALS.map((option) => (
          <Button
            key={option.key}
            type="button"
            size="sm"
            variant={meal === option.key ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() => setMeal(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="dish">Dish</Label>
        <Input
          id="dish"
          value={dish}
          onChange={(e) => setDish(e.target.value)}
          maxLength={DISH_MAX_LENGTH}
          placeholder="Lentil stew, banana bread, a big salad"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="feeds">Feeds how many?</Label>
        <div className="flex items-center gap-3">
          <Input
            id="feeds"
            type="number"
            inputMode="numeric"
            min={1}
            max={FEEDS_MAX}
            value={feeds}
            onChange={(e) => setFeeds(e.target.value)}
            className="w-24"
            required
          />
          <p className="text-muted-foreground text-sm">
            As a meal, not a taste.
          </p>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={action.busy || !dish.trim() || !feeds}>
          {editing ? 'Save' : 'Add'}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
      <ErrorText message={action.error} />
    </form>
  )
}
