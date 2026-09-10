import { defineConfig } from 'vitest/config'

// convex-test runs Convex functions in an edge-like runtime. Add a second
// `test.projects` entry with `environment: 'jsdom'` if frontend tests appear.
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    include: ['convex/**/*.test.ts', 'src/lib/**/*.test.ts'],
  },
})
