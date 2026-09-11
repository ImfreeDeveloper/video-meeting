# ClaudeLar

pnpm + Turborepo monorepo.

| Package          | Path       | Stack   | Dev port |
| ---------------- | ---------- | ------- | -------- |
| `@claudelar/web` | `apps/web` | Next.js | 3000     |
| `@claudelar/api` | `apps/api` | Nest.js | 3001     |

Shared packages live under `packages/*`.

## Requirements

- Node.js `>= 22` (see `.nvmrc` — `24`)
- pnpm (managed via Corepack: `corepack enable`)

## Setup

```bash
pnpm install
```

## Database

Local Postgres runs via Docker Compose:

```bash
docker compose up -d     # start
docker compose down      # stop (add -v to also drop the data volume)
```

Config is env-driven — copy `.env.example` to `.env` to override
`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT`
(default port `5432`).

`apps/api` connects to it via Prisma — copy `apps/api/.env.example` to
`apps/api/.env` (sets `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`), then
run `pnpm api prisma:migrate` to apply migrations. See `apps/api/CLAUDE.md`.

## Common scripts (run from the repo root)

| Command             | Description                             |
| ------------------- | --------------------------------------- |
| `pnpm dev`          | Run every app in watch mode (Turborepo) |
| `pnpm build`        | Build every package                     |
| `pnpm start`        | Start every app from its build output   |
| `pnpm lint`         | ESLint across all packages              |
| `pnpm lint:fix`     | ESLint with `--fix`                     |
| `pnpm typecheck`    | `tsc --noEmit` across all packages      |
| `pnpm test`         | Run all test suites                     |
| `pnpm format`       | Prettier write across the repo          |
| `pnpm format:check` | Prettier check (CI)                     |
| `pnpm clean`        | Remove build artifacts                  |

### Targeting one app

```bash
pnpm web dev      # -> pnpm --filter @claudelar/web dev
pnpm api start:dev
```

## Tooling layout

- **Prettier** — single shared config at the repo root (`.prettierrc.json`).
- **ESLint** — flat config. `eslint.config.base.mjs` holds the shared rules;
  each package has its own `eslint.config.mjs` that extends the base and adds
  framework-specific rules (Next.js in `apps/web`, NestJS in `apps/api`).
- **TypeScript** — `tsconfig.base.json` at the root; each package's
  `tsconfig.json` extends it.
- **Turborepo** — task graph and caching in `turbo.json`.
