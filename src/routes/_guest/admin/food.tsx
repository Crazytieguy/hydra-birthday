import { createFileRoute } from '@tanstack/react-router'
import { api } from '../../../../convex/_generated/api'
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
import { sessionQueryOptions, useSessionQuery } from '@/lib/guest'

export const Route = createFileRoute('/_guest/admin/food')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(api.food.all, {}, context.sessionToken),
    )
  },
  component: FoodAdminPage,
})

function FoodAdminPage() {
  const { data: meals } = useSessionQuery(api.food.all, {})
  return (
    <div className="space-y-6">
      {meals.map((meal) => (
        <Card key={meal.key}>
          <CardHeader>
            <CardTitle>{meal.label}</CardTitle>
            <CardDescription>
              {meal.offers.length === 0
                ? 'No offers yet.'
                : `${meal.offers.length} dish${meal.offers.length === 1 ? '' : 'es'}, feeding about ${meal.totalFeeds} by the guests' own estimates.`}
            </CardDescription>
          </CardHeader>
          {meal.offers.length > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guest</TableHead>
                    <TableHead>Dish</TableHead>
                    <TableHead className="text-right">Feeds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meal.offers.map((offer) => (
                    <TableRow key={offer._id}>
                      <TableCell>{offer.name}</TableCell>
                      <TableCell>{offer.dish}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {offer.feeds}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  )
}
