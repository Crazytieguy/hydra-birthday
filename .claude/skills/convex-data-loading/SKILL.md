---
name: convex-data-loading
description: How routes load Convex data (loader prefetch + useSuspenseQuery, session token from _guest context). Use when adding or changing a route that reads Convex.
---

Prefetch in the route `loader` with `context.queryClient.ensureQueryData(convexQuery(api.x.y, { ...args, sessionToken: context.sessionToken }))` and read in the component with `useSuspenseQuery(convexQuery(...same key...))`: SSR renders with data through ConvexQueryClient's http client and the browser resumes the same key as a live websocket subscription, because `src/router.tsx` wires Convex into React Query (`setupRouterSsrQueryIntegration`, `defaultPreloadStaleTime: 0`, `gcTime: 5000`). Routes behind an invite live under `src/routes/_guest.tsx`, whose `beforeLoad` puts `sessionToken` and `me` in context (helpers in `src/lib/guest.ts`); `src/routes/_guest/admin.tsx` is the worked example, `src/routes/invite.$token.tsx` the public one.
