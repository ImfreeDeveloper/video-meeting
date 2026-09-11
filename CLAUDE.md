# CLAUDE.md

Guidance for working in this repository.

## Overview

`claudelar` is a **pnpm + Turborepo** monorepo.

| Package          | Path       | Stack                 | Port |
| ---------------- | ---------- | --------------------- | ---- |
| `@claudelar/web` | `apps/web` | Next.js 16 / React 19 | 3000 |
| `@claudelar/api` | `apps/api` | NestJS 12             | 3001 |

Shared libraries go under `packages/*` (currently empty). Each app has its own
`CLAUDE.md` with app-specific detail — read it before working in that app.

## Requirements

- Node.js `>= 22` (`.nvmrc` pins `24`); `engineStrict` — install fails on a wrong version.
- Docker (with Compose v2) — for the local Postgres database.
- pnpm via Corepack (`corepack enable`). `packageManager` is pinned in `package.json`.

## Commands (run from the repo root)

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm install`      | Install all workspace deps                |
| `pnpm dev`          | `turbo run dev` — every app in watch mode |
| `pnpm build`        | `turbo run build`                         |
| `pnpm start`        | Run every app from build output           |
| `pnpm lint`         | ESLint across all packages                |
| `pnpm lint:fix`     | ESLint with `--fix`                       |
| `pnpm typecheck`    | `tsc --noEmit` across all packages        |
| `pnpm test`         | All test suites                           |
| `pnpm format`       | Prettier write across the repo            |
| `pnpm format:check` | Prettier check (CI)                       |
| `pnpm clean`        | Remove build artifacts                    |

Target a single app:

```bash
pnpm web dev        # -> pnpm --filter @claudelar/web dev
pnpm api start:dev  # -> pnpm --filter @claudelar/api start:dev
```

## Before you finish a change

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` (or the app-scoped
equivalents). Turborepo caches results, so reruns are cheap.

## Database

- Local Postgres runs via Docker Compose (`docker-compose.yml` at the repo root, service `postgres`, image `postgres:17-alpine`).
- `docker compose up -d` starts it; `docker compose down` stops it (add `-v` to also drop the `postgres-data` volume).
- Config is env-driven — see `.env.example` (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, default port `5432`). Copy `.env.example` to `.env` to override.
- `apps/api` connects via Prisma (`DATABASE_URL` in its own `.env`) — see `apps/api/CLAUDE.md`.

## Tooling layout

- **Prettier** — one shared config at the root (`.prettierrc.json`). No per-package overrides.
- **ESLint** — flat config. `eslint.config.base.mjs` holds shared rules; each
  package's `eslint.config.mjs` extends the base and adds framework rules.
- **TypeScript** — `tsconfig.base.json` at the root; each package's `tsconfig.json` extends it. `strict` is on.
- **Turborepo** — task graph, dependencies, and cache outputs in `turbo.json`.
  `lint`/`typecheck`/`test`/`build` all depend on `^build`.
- **Auto-format hook** — `.claude/settings.json` runs `prettier --write` on every
  file Claude writes or edits (`PostToolUse` on `Write|Edit|MultiEdit`). Manage it
  via `/hooks`.

## Conventions

- Keep changes within one app unless the task is explicitly cross-cutting.
- Don't add a dependency to the root `package.json` — it holds only shared dev tooling. App deps belong in that app's `package.json`.
- Commit only source. Build output (`.next/`, `dist/`, `coverage/`, `.turbo/`) is gitignored — never stage it.

## Keep the docs current

Documentation is part of the change, not a follow-up. When a change alters the
project's architecture, update the docs **in the same commit / PR**:

- New or removed app or `packages/*` library, or a renamed package → root `README.md` **and** this file's package table.
- New top-level command, script, or changed port → the command tables here and in the affected app's `CLAUDE.md`.
- New env var, config file, or build/test tooling → `.env.example` and the relevant `CLAUDE.md`.
- Changed layout, module boundaries, or conventions within an app → that app's `apps/<app>/CLAUDE.md`.
- Cross-cutting patterns (shared code, data flow between `web` and `api`, auth) → this file.

If a task changes architecture and you can't update every doc, call out what's now stale in your summary.
