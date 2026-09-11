# CLAUDE.md — `@claudelar/web`

Next.js 16 (App Router) + React 19 frontend. See the repo-root `CLAUDE.md` for
monorepo-wide setup.

## Stack

- Next.js `16.3.4`, React `19.2.8`, App Router with Turbopack.
- TypeScript, `strict`, `moduleResolution: bundler`.
- Path alias `@/*` -> `src/*`.
- CSS Modules (`*.module.css`) + a global `src/app/globals.css`. No CSS framework.
- Server Components by default — add `'use client'` only when a component needs browser APIs, state, or effects.

## Layout

```
src/app/
  layout.tsx      root layout (fonts, <html>)
  page.tsx        route: /
  globals.css
  *.module.css
public/           static assets
next.config.ts    currently empty
```

## Commands (from `apps/web`, or `pnpm web <script>` from root)

| Script      | Purpose                              |
| ----------- | ------------------------------------ |
| `dev`       | `next dev --port 3000`               |
| `build`     | `next build`                         |
| `start`     | `next start --port 3000` (needs a build) |
| `lint`      | `eslint .`                           |
| `typecheck` | `next typegen && tsc --noEmit`       |

There is no test setup in this app yet.

## Config

- `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`) — base URL of `@claudelar/api`. See `.env.example`. `NEXT_PUBLIC_` vars are exposed to the browser.

## Conventions

- New routes are folders under `src/app/` with `page.tsx` / `layout.tsx` / `route.ts`.
- Import with the `@/` alias, not long relative paths.
- Keep the client bundle small: fetch data in Server Components; push `'use client'` to the leaves.
- Use `next/image`, `next/font`, and `next/link` rather than raw equivalents (enforced by `eslint-config-next` core-web-vitals).
- The `vercel-react-best-practices` skill applies to non-trivial React/Next work.

## Keep the docs current

When a change alters this app's architecture, update the docs in the same commit:
new route groups or a changed `src/app/` layout, a new script, a new
`NEXT_PUBLIC_*` var or `next.config.ts` option, or a new dependency that shapes
the stack → update this file (and `.env.example` / the root `CLAUDE.md` +
`README.md` when the change is visible from outside the app).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
