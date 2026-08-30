<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Tooling

This project uses `bun` (not npm/yarn/pnpm): `bun install`, `bun run dev` (Convex + Vite together), `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check` (prettier).

After making a change, check the dev server logs (including Convex's) for errors and run `bun run typecheck` before considering the change done. Use `playwright-cli` for manual verification in the browser.

## Auth model

There is no sign-up. Guests enter through one-time invite links (`/invite/<token>`); joining binds the browser via the `hb_session` cookie (set over HTTP by a server function — Safari caps JS-written cookies at 7 days — and refreshed on every SSR), whose token is passed as the `sessionToken` argument to every gated Convex function (`convex/lib/auth.ts`: `sessionQuery` / `sessionMutation` / `adminQuery` / `adminMutation`). Routes behind an invite live under the `_guest` pathless layout (`src/routes/_guest.tsx`), which puts `sessionToken` and `me` into route context — use `src/lib/guest.ts` (`useMe`, `useSessionQuery`, `useSessionAction`, `sessionQueryOptions` for loaders). Admins are users with `isAdmin: true`: toggle on `/admin`, mint admin invites with `bun run invite --admin`, or as a last resort `bunx convex run users:setAdminInternal '{"userId":"...","isAdmin":true}' --prod`. Admins can also mint recovery links and sign a guest out everywhere from `/admin`.

Mint links with `bun run invite Alice Bob` (`--prod`, `--admin`, `--file names.txt`; prints `name<TAB>url`) or on `/admin`. The invite page never consumes a link on render (link previews must not burn them); only the Join mutation does.

## Copy

Every user-facing string (routes, components, error messages) goes through the `unslop` skill (`.claude/skills/unslop/SKILL.md`) before it ships, and the user reviews new or changed copy before it goes live: don't push copy changes to `main` until they've approved them. Present copy for review as an artifact, grouped by screen, with the previous wording next to anything that changed.

## Deploy

Pushes to `main` deploy to production: Vercel runs `npx convex deploy --cmd 'npm run build'` (`vercel.json`). `bun run wizard` checks the whole chain (GitHub ↔ Vercel ↔ Convex ↔ DNS) and walks through the one manual step (Namecheap CNAME).
