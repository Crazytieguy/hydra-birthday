import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Start internals that Vite only discovers on the first client request; without
  // this the dev server re-optimizes mid-page and loads two React copies
  // ("Invalid hook call"). See TanStack/router#5738.
  optimizeDeps: {
    include: [
      '@tanstack/history',
      '@tanstack/router-core',
      '@tanstack/router-core/ssr/client',
      '@tanstack/router-core/ssr/server',
      'h3-v2',
      'seroval',
    ],
  },
  plugins: [
    devtools(),
    // Emits Vercel Build Output (.vercel/output) when built on Vercel, a Node
    // server (.output/) locally. Keep `nitro` on the dated beta dist-tag —
    // the stale `3.0.0` release 508s on Vercel.
    nitro(),
    tailwindcss(),
    tanstackStart(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
})
