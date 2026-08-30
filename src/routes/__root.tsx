import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'
import { ModeToggle } from '@/components/mode-toggle'
import { ThemeProvider } from '@/components/theme-provider'
import { readSessionToken } from '@/lib/session'

interface RouterContext {
  queryClient: QueryClient
  convexQueryClient: ConvexQueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Runs on every navigation, on both sides; every route sees
  // `context.sessionToken` (null when this browser has no invite yet).
  beforeLoad: () => ({ sessionToken: readSessionToken() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Hydra Birthday' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets class/style on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <ThemeProvider defaultTheme="system" storageKey="theme">
          <header className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
            <Link to="/" className="font-semibold tracking-tight">
              Hydra Birthday
            </Link>
            <ModeToggle />
          </header>
          <main className="mx-auto max-w-2xl px-4 pb-16">{children}</main>
        </ThemeProvider>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
