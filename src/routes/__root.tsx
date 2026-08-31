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
import { HEART } from '@/components/heart-vote'
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
              <path d={HEART} />
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
