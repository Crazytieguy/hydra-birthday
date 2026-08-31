import { ConvexError } from 'convex/values'

// "All rows" reads that error loudly instead of silently truncating. The caps
// are generous for a party-sized app; hitting one means an assumption broke,
// and the organizers' scheduling views must never quietly omit data.
export async function takeAll<T>(
  query: { take: (n: number) => Promise<Array<T>> },
  cap: number,
): Promise<Array<T>> {
  const rows = await query.take(cap + 1)
  if (rows.length > cap) throw new ConvexError({ code: 'OVERFLOW' as const })
  return rows
}
