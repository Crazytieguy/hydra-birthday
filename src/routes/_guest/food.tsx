import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
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

function FoodPage() {
  const { data } = useSessionQuery(api.food.list, {})
  const [editing, setEditing] = useState<Offer | null>(null)
  const remove = useSessionAction(api.food.remove)

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6 pb-24">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/">← Back</Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Bring food?</h1>
        <p>
          Everyone is already on site, so this is for whoever likes to cook or
          bake. Tell us what you'd bring and roughly how many people it feeds,
          and we'll order the rest.
        </p>
      </div>

      <div className="border-primary bg-primary/8 rounded-lg border px-4 py-3">
        <p className="font-display text-primary text-lg font-bold">
          All food is vegan
        </p>
        <p className="text-sm">
          The whole weekend is vegan, including anything you bring. No meat,
          fish, dairy, eggs, or honey.
        </p>
      </div>

      <OfferForm
        key={editing?._id ?? 'new'}
        editing={editing}
        onDone={() => setEditing(null)}
      />

      {data.meals.map((meal) => (
        <section key={meal.key} className="space-y-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-primary text-xl font-bold">
              {meal.label}
            </h2>
            <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
              {meal.when}
            </span>
          </div>
          {meal.offers.length === 0 ? (
            <p className="text-muted-foreground border-border border-b py-3 text-sm">
              Nothing offered yet.
            </p>
          ) : (
            meal.offers.map((offer) => (
              <div
                key={offer._id}
                className="border-border flex items-center gap-3 border-b py-3"
              >
                <div className="min-w-0 flex-grow">
                  <p className="font-display leading-tight font-bold">
                    {offer.dish}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {offer.name} · feeds {offer.feeds}
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
  const [meal, setMeal] = useState<MealKey>(editing?.meal ?? 'sat-dinner')
  const [dish, setDish] = useState(editing?.dish ?? '')
  const [feeds, setFeeds] = useState(editing ? String(editing.feeds) : '')
  const offer = useSessionAction(api.food.offer)
  const update = useSessionAction(api.food.update)
  const action = editing ? update : offer

  async function submit() {
    const args = { meal, dish, feeds: Number(feeds) }
    const ok = editing
      ? await update.run({ offerId: editing._id, ...args })
      : await offer.run(args)
    if (ok === null || ok) {
      setDish('')
      setFeeds('')
      onDone()
    }
  }

  return (
    <form
      className="border-border space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 className="font-display text-lg font-bold">
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
        <Label htmlFor="dish">What</Label>
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
        <Label htmlFor="feeds">Feeds about how many?</Label>
        <Input
          id="feeds"
          type="number"
          inputMode="numeric"
          min={1}
          max={FEEDS_MAX}
          value={feeds}
          onChange={(e) => setFeeds(e.target.value)}
          className="w-28"
          required
        />
        <p className="text-muted-foreground text-sm">
          As a meal, not a taste. A tray of brownies feeds maybe 4.
        </p>
      </div>
      <div className="flex gap-2">
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
