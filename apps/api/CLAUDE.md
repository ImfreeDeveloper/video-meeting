# CLAUDE.md — `@claudelar/api`

NestJS 12 HTTP API. See the repo-root `CLAUDE.md` for monorepo-wide setup.

## Stack

- NestJS 12 on `@nestjs/platform-express`.
- **Native ESM** — `"type": "module"`, `module`/`moduleResolution` = `nodenext`.
  Relative imports **must carry a `.js` extension** (e.g.
  `import { AppService } from './app.service.js'`), even though the file is `.ts`.
  Match the existing files.
- Decorators + `reflect-metadata` (`emitDecoratorMetadata`, `experimentalDecorators`).
- Vitest for tests (`vitest/globals` — `describe`/`it`/`expect` are ambient, no imports).

## Layout

```
src/
  main.ts               bootstrap; listens on process.env.PORT ?? 3001; loads .env; global ValidationPipe
  app.module.ts         root module (imports PrismaModule, AuthModule)
  app.controller.ts     + app.controller.spec.ts (unit)
  app.service.ts
  prisma/
    prisma.module.ts    @Global() module exporting PrismaService
    prisma.service.ts   PrismaClient (pg driver adapter), connects/disconnects with the Nest lifecycle
  auth/
    auth.module.ts        registers CqrsModule + JwtModule (secret/expiry from env)
    auth.controller.ts    POST /auth/register, POST /auth/login — dispatch only, via CommandBus/QueryBus
    access-token.util.ts  shared JWT-signing helper used by both handlers
    dto/
      register.dto.ts     email + password (min 8 chars)
      login.dto.ts        email + password
    commands/
      register.command.ts           RegisterCommand(email, password)
      handlers/register.handler.ts  creates the user (bcryptjs hash), publishes UserRegisteredEvent, signs the token
    queries/
      login.query.ts               LoginQuery(email, password)
      handlers/login.handler.ts    looks the user up only — never creates one — verifies password, signs the token
    events/
      user-registered.event.ts           UserRegisteredEvent(userId, email)
      handlers/user-registered.handler.ts  logs on registration; add more handlers here for side effects (welcome email, analytics, …)
  generated/prisma/     Prisma Client output (generated, gitignored — run `prisma generate` after schema changes)
prisma/
  schema.prisma         User model (id, email @unique, passwordHash, timestamps)
  migrations/           Prisma migration history (committed)
test/
  app.e2e-spec.ts    supertest e2e
  auth.e2e-spec.ts   supertest e2e for register/login
  setup-env.ts       loads .env for e2e runs (vitest.config.e2e.ts setupFiles)
```

DTO validation uses `class-validator` + `class-transformer` via a global
`ValidationPipe` (`{ whitelist: true, transform: true }`), applied in both
`main.ts` and each e2e spec's `beforeEach`.

### Auth (CQRS)

Auth is built on `@nestjs/cqrs`: the controller only dispatches through
`CommandBus`/`QueryBus` and contains no business logic. Register is a
**command** (it mutates state — creates a user); login is a **query** (it
only reads — "does this user/password combination exist").

- `POST /auth/register` `{ email, password }` → `RegisterCommand` → `RegisterHandler` → `201 { accessToken }`. Always creates a user; duplicate email → `409`. On success, publishes `UserRegisteredEvent` on the `EventBus` (currently just logged by `UserRegisteredHandler` — this is the seam for side effects like a welcome email, without touching the handler).
- `POST /auth/login` `{ email, password }` → `LoginQuery` → `LoginHandler` → `200 { accessToken }`. Only looks a user up, never creates one; unknown email or wrong password → `401`.
- Invalid payload (missing/invalid email, password < 8 chars on register, missing password on login) → `400`.
- Passwords are hashed with `bcryptjs` (never stored or returned in plaintext). `accessToken` is a JWT signed with `JWT_SECRET`, payload `{ sub: userId, email }` — built by the shared `signAccessToken` helper so both handlers stay consistent.
- Prisma unique-constraint violations (`P2002`) on `User.email` are the source of truth for the `409` on register — not a separate existence check — to avoid a check-then-create race.
- Adding an auth use case: new command/query classes go in `commands/`/`queries/`, one handler per class in the matching `handlers/` folder, registered in `auth.module.ts`'s `providers`. Keep handlers focused on one command/query each — don't grow a handler into a god-service.

### Database (Prisma)

- ORM is Prisma 7 (`prisma/schema.prisma`), pointed at the repo-root Docker Compose Postgres via `DATABASE_URL`.
- Client generator is `prisma-client` (the new TS-first generator), output to `src/generated/prisma` — **inside** `src/` so it stays under `tsconfig.build.json`'s `rootDir`. It's generated, gitignored, and excluded from lint/Prettier; regenerate with `pnpm api prisma:generate` after editing the schema (also runs automatically via `postinstall`).
- The generated client requires a driver adapter — `PrismaService` (`src/prisma/prisma.service.ts`) constructs it with `@prisma/adapter-pg` + `pg`, using `DATABASE_URL`.
- CLI config lives in `prisma7.config.ts` (Prisma 7's config file, auto-discovered by the CLI — not `prisma.config.ts`).
- Migrations: `pnpm api prisma:migrate` (dev, creates + applies) / `pnpm api prisma:deploy` (applies only, for CI/prod). Commit everything under `prisma/migrations/`.

## Commands (from `apps/api`, or `pnpm api <script>` from root)

| Script              | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `dev` / `start:dev` | `nest start --watch`                                         |
| `start:debug`       | watch + `--debug`                                            |
| `build`             | `nest build` -> `dist/`                                      |
| `start:prod`        | `node dist/main`                                             |
| `lint`              | `eslint .`                                                   |
| `typecheck`         | `tsc --noEmit -p tsconfig.json`                              |
| `test`              | `vitest run` (`**/*.spec.ts`)                                |
| `test:watch`        | `vitest`                                                     |
| `test:cov`          | coverage (v8)                                                |
| `test:e2e`          | `vitest run --config ./vitest.config.e2e.ts`                 |
| `prisma:generate`   | `prisma generate` — regenerate the client from the schema    |
| `prisma:migrate`    | `prisma migrate dev` — create + apply a migration (local)    |
| `prisma:deploy`     | `prisma migrate deploy` — apply pending migrations (CI/prod) |
| `prisma:studio`     | `prisma studio` — browse the DB                              |

## Config

- `PORT` (default `3001`), `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` — see `.env.example`. No `ConfigModule`; `dotenv/config` loads `.env` at the top of `main.ts` (and in `test/setup-env.ts` for e2e), `main.ts`/services read `process.env` directly.
- `nest-cli.json` — `sourceRoot: src`, `deleteOutDir` on build.

## Conventions

- Feature = a module folder under `src/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`), registered in `app.module.ts`. `auth/` is the exception — it uses CQRS (`commands/`, `queries/`, `events/`) instead of a single service; follow that pattern there rather than adding an `auth.service.ts`.
- Wire dependencies through constructor DI, not manual instantiation.
- Co-locate unit tests as `*.spec.ts`; put cross-module HTTP tests in `test/*.e2e-spec.ts`.
- ESLint here relaxes `no-explicit-any`, `no-extraneous-class`; `no-floating-promises` is a warning — still await or `void` your promises.
- The `nestjs-best-practices` skill applies to non-trivial NestJS work.

## Keep the docs current

When a change alters this app's architecture, update the docs in the same commit:
new/removed module or changed module boundaries, a new script, a new env var or
config, or a changed port → update this file (and `.env.example` / the root
`CLAUDE.md` + `README.md` when the change is visible from outside the app).
