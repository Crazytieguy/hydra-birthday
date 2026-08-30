import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexProvider } from 'convex/react'
import { routeTree } from './routeTree.gen'
import { ErrorScreen, NotFoundScreen } from '@/components/screens'

// Convex quickstart shape: Convex answers React Query. During SSR the
// ConvexQueryClient's http client serves loaders/useSuspenseQuery; in the
// browser the same query keys resume as live websocket subscriptions.
export function getRouter() {
  const CONVEX_URL = import.meta.env.VITE_CONVEX_URL
  if (!CONVEX_URL) throw new Error('missing VITE_CONVEX_URL envar')

  const convexQueryClient = new ConvexQueryClient(CONVEX_URL, {
    unsavedChangesWarning: false,
  })
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: 5000,
      },
    },
  })
  convexQueryClient.connect(queryClient)

  const router = createRouter({
    routeTree,
    context: { queryClient, convexQueryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0, // Let React Query handle all caching
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => <ErrorScreen error={error} />,
    defaultNotFoundComponent: () => <NotFoundScreen />,
    Wrap: ({ children }) => (
      <ConvexProvider client={convexQueryClient.convexClient}>
        {children}
      </ConvexProvider>
    ),
  })
  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
