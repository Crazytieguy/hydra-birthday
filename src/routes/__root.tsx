import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import appCss from '../styles.css?url'
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
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Nunito+Sans:ital,wght@0,400;0,600;0,700;1,400&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <header className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <Link
            to="/"
            className="font-display flex items-center gap-1.5 text-lg font-bold tracking-tight"
          >
            Hydra Birthday
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="fill-primary"
            >
              <path d="M12 20.5C7.5 16.5 4 13.6 4 9.9 4 7.4 6 5.5 8.4 5.5c1.4 0 2.7.7 3.6 1.8.9-1.1 2.2-1.8 3.6-1.8C18 5.5 20 7.4 20 9.9c0 3.7-3.5 6.6-8 10.6z" />
            </svg>
          </Link>
        </header>
        <main className="mx-auto w-full px-4 pb-16">{children}</main>
        <TanStackDevtools
          config={{ position: 'bottom-right' }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
            { name: 'Tanstack Query', render: <ReactQueryDevtoolsPanel /> },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
