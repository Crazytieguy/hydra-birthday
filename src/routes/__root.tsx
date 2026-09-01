import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useMatch,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import type { QueryClient } from '@tanstack/react-query'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import appCss from '../styles.css?url'
import baloo2Woff2 from '@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2?url'
import nunitoSansWoff2 from '@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2?url'
import { HEART } from '@/components/heart-vote'
import { Button } from '@/components/ui/button'
import { readSessionToken } from '@/lib/session'

interface RouterContext {
  queryClient: QueryClient
  convexQueryClient: ConvexQueryClient
}

const PROD_ORIGIN = 'https://hydra-birthday.code-bloom.app'
const DESCRIPTION =
  "You're invited to a birthday weekend, Sep 12-13! Vote on sessions and tell us when you're free."

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
      { name: 'description', content: DESCRIPTION },
      // Link previews (Signal, WhatsApp, iMessage) need absolute URLs and
      // only ever fetch the prod site, so the prod origin is hardcoded
      // (it's also in scripts/config.ts).
      { property: 'og:title', content: 'Hydra Birthday' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { property: 'og:image', content: `${PROD_ORIGIN}/og.jpg` },
      { property: 'og:image:width', content: '920' },
      { property: 'og:image:height', content: '920' },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [
      // Fonts are self-hosted (Fontsource, imported in styles.css); preload
      // the latin faces so text renders in them on first paint.
      {
        rel: 'preload',
        href: baloo2Woff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'preload',
        href: nunitoSansWoff2,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
})

// Admins get an Admin link in the nav on every signed-in page. The `me`
// snapshot comes from the _guest layout's context; outside it there's no
// signed-in guest, so no button.
function AdminNavButton() {
  const match = useMatch({ from: '/_guest', shouldThrow: false })
  if (!match?.context.me.isAdmin) return null
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/admin">Admin</Link>
    </Button>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        {/* Same max width as the widest page bodies (sessions, admin) so the
            nav edges line up with content and never shift between pages. */}
        <header className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
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
          <AdminNavButton />
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
