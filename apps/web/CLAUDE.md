# CLAUDE.md — `@claudelar/web`

Next.js 16 (App Router) + React 19 frontend. See the repo-root `CLAUDE.md` for
monorepo-wide setup.

## Stack

- Next.js `16.3.4`, React `19.2.8`, App Router with Turbopack.
- TypeScript, `strict`, `moduleResolution: bundler`.
- Path alias `@/*` -> `src/*`.
- Tailwind CSS v4 + [HeroUI v3](https://heroui.com) (`@heroui/react`) for UI components — no provider needed in v3, compound component API (e.g. `Card.Header`). CSS Modules (`*.module.css`) still used for one-off layout; `src/app/globals.css` imports `tailwindcss` then `@heroui/styles`, in that order.
- `globals.css` uses Tailwind v4's cascade layers (`@import 'tailwindcss'` sets up `theme`/`base`/`components`/`utilities`). Any custom global rule (resets, `*` selectors, element defaults) must go inside `@layer base { ... }` — an unlayered rule wins over _every_ layered rule regardless of specificity, so it would silently override Tailwind utilities and HeroUI's own component styles app-wide.
- Use the `heroui-react` skill before adding/editing HeroUI components — v3 docs differ from v2 in your training data.
- Server Components by default — add `'use client'` only when a component needs browser APIs, state, or effects.

## Layout

```
src/app/
  layout.tsx            root layout (fonts, <html>)
  page.tsx               route: / — the authenticated user's meeting list; each meeting links to /meeting/[id]
  globals.css
  *.module.css
  login/
    layout.tsx           metadata (title) only
    page.tsx              route: /login
  register/
    layout.tsx            metadata (title) only
    page.tsx               route: /register
  meeting/[id]/
    layout.tsx             metadata (title) only
    page.tsx                route: /meeting/[id] — meeting detail: file upload block (progress, error states) + attached files list
src/lib/
  session.ts              localStorage access token, JWT payload decoding, and the shared client-side auth-gate (readSession/Session) every authenticated page uses
  api-error.ts             ApiError base class + JSON/text error-body parsing, shared by every *-api.ts module below — code that can receive errors from more than one module (e.g. a page loading a meeting and its files together) must catch this base class, not enumerate each concrete subclass, or a missed one silently falls through to a generic error state
  auth-api.ts              register/login against @claudelar/api; AuthApiError extends ApiError
  meeting-api.ts           fetch one/many meetings; MeetingApiError extends ApiError
  meeting-file-api.ts      list a meeting's files; upload one via XMLHttpRequest (progress events; fetch can't report upload progress); MeetingFileApiError extends ApiError
src/components/
  icons.tsx                inline SVG icon components (stroke-based, Lucide-style) — add new ones here rather than pulling in an icon package
public/                   static assets
next.config.ts            currently empty
```

## Commands (from `apps/web`, or `pnpm web <script>` from root)

| Script      | Purpose                                  |
| ----------- | ---------------------------------------- |
| `dev`       | `next dev --port 3000`                   |
| `build`     | `next build`                             |
| `start`     | `next start --port 3000` (needs a build) |
| `lint`      | `eslint .`                               |
| `typecheck` | `next typegen && tsc --noEmit`           |

There is no test setup in this app yet.

## Config

- `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`) — base URL of `@claudelar/api`. See `.env.example`. `NEXT_PUBLIC_` vars are exposed to the browser.

## Conventions

- New routes are folders under `src/app/` with `page.tsx` / `layout.tsx` / `route.ts`.
- Import with the `@/` alias, not long relative paths.
- Keep the client bundle small: fetch data in Server Components; push `'use client'` to the leaves.
- Use `next/image`, `next/font`, and `next/link` rather than raw equivalents (enforced by `eslint-config-next` core-web-vitals).
- The `vercel-react-best-practices` skill applies to non-trivial React/Next work.
- File pickers use a hidden native `<input type="file">` triggered via a `ref` + a HeroUI `Button`'s `onPress` (see `meeting/[id]/page.tsx`), not `react-aria-components`' `FileTrigger` — adding `react-aria-components` as a direct dependency hits a peer-dependency resolution bug in this repo's pnpm setup (it's already a transitive peer of `@heroui/react`, and pnpm links the wrong `.pnpm` store path when it's also listed directly). Reset the input's `value` after reading `files` so the same filename can be re-selected.

## Definition of done for UI changes

Any change that affects what's rendered (a new page/component, a layout or
styling tweak, a form, etc.) is not done once the code compiles. Before
reporting the task as complete:

1. Run the dev server and actually load the affected page(s) in a browser
   (e.g. via the `claude-in-chrome` skill or Playwright) — don't rely on
   reading the code or a type/lint pass to judge whether it looks and
   behaves correctly. Check the real rendered result, not just the intended
   one — computed styles can differ from what the class names imply (see the
   `@layer` cascade note below).
2. Test the actual interaction, not just the resting state: fill in forms,
   trigger validation/error states, click through the flow, and check at
   least one mobile-width viewport (~390px) alongside desktop.
3. Run the `ui-ux-pro-max` skill against the change (relevant `--domain`
   searches, or `--design-system` for a new page) and address what it flags.

Skip this only for changes with no visual/behavioral surface (e.g. pure
refactors, comments, non-UI config).

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

## Test user

Login: user1@gmail.com
Password: Password1!
