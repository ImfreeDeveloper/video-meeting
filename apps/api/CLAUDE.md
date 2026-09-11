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
  app.module.ts         root module (imports PrismaModule, AuthModule, MeetingModule)
  app.controller.ts     + app.controller.spec.ts (unit)
  app.service.ts
  prisma/
    prisma.module.ts    @Global() module exporting PrismaService
    prisma.service.ts   PrismaClient (pg driver adapter), connects/disconnects with the Nest lifecycle
  auth/
    auth.module.ts        registers CqrsModule + JwtModule (secret/expiry from env); exports JwtModule + JwtAuthGuard for other feature modules
    auth.controller.ts    POST /auth/register, POST /auth/login — dispatch only, via CommandBus/QueryBus
    access-token.util.ts  shared JWT-signing helper used by both handlers
    guards/
      jwt-auth.guard.ts   JwtAuthGuard — verifies the `Authorization: Bearer <token>` header via JwtService, attaches `request.user = { userId, email }`; missing/invalid token → 401. Shared by any feature module that needs authenticated routes.
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
  meeting/
    meeting.module.ts       imports CqrsModule + AuthModule (for JwtAuthGuard)
    meeting.controller.ts   POST /meeting, GET /meeting, GET /meeting/:id — all behind JwtAuthGuard, dispatch only, via CommandBus/QueryBus
    dto/
      create-meeting.dto.ts        title (non-empty) + startTime + endTime (ISO date strings)
    commands/
      create-meeting.command.ts            CreateMeetingCommand(ownerId, title, startTime, endTime)
      handlers/create-meeting.handler.ts   creates the meeting scoped to the authenticated user
    queries/
      list-meetings.query.ts               ListMeetingsQuery(ownerId)
      handlers/list-meetings.handler.ts    lists only the authenticated user's meetings
      get-meeting.query.ts                 GetMeetingQuery(ownerId, id)
      handlers/get-meeting.handler.ts      looks up one meeting scoped to the owner; not found (incl. another user's meeting) → 404
  generated/prisma/     Prisma Client output (generated, gitignored — run `prisma generate` after schema changes)
prisma/
  schema.prisma         User model (id, email @unique, passwordHash, timestamps); Meeting model (id, title, startTime, endTime, ownerId → User, timestamps)
  migrations/           Prisma migration history (committed)
test/
  app.e2e-spec.ts      supertest e2e
  auth.e2e-spec.ts     supertest e2e for register/login
  meeting.e2e-spec.ts  supertest e2e for meeting create/list/get-by-id, incl. auth and per-user isolation
  setup-env.ts         loads .env for e2e runs (vitest.config.e2e.ts setupFiles)
```

DTO validation uses `class-validator` + `class-transformer` via a global
`ValidationPipe` (`{ whitelist: true, transform: true }`), applied in both
`main.ts` and each e2e spec's `beforeEach`.

### CQRS

`auth/` and `meeting/` are both built on `@nestjs/cqrs` instead of a single
service class — this is the standard shape for a feature module here, not a
one-off:

- The **controller** only dispatches: build a command/query object and
  `await this.commandBus.execute(...)` / `this.queryBus.execute(...)`. No
  business logic lives in a controller.
- A **command** mutates state (`RegisterCommand`, `CreateMeetingCommand`); a
  **query** only reads (`LoginQuery`, `ListMeetingsQuery`, `GetMeetingQuery`).
  Both are plain classes in `commands/`/`queries/` that just carry input data.
- Exactly **one handler per command/query** — `@CommandHandler(X)` /
  `@QueryHandler(X)` — in the matching `commands/handlers/` or
  `queries/handlers/` folder. The handler is where the actual logic lives
  (Prisma calls, hashing, token signing, `NotFoundException`, …); keep it
  scoped to that one command/query rather than growing it into a
  god-service.
- An optional **event**, published with `EventBus.publish(...)` from inside a
  command handler after a state change (`UserRegisteredEvent`), consumed by
  `@EventsHandler(X)` classes in `events/`. This is the seam for side effects
  (welcome email, analytics, …) without touching the handler that triggered
  them — currently only `auth/` publishes one.
- Every handler (and the event handler, where used) is registered in its
  module's `providers` array, and the module imports `CqrsModule`.
- Adding a use case: add the command/query class, write one handler for it,
  register that handler in the module's `providers` — nothing else changes.

### Auth

Register is a **command** (creates a user); login is a **query** (only
reads — "does this user/password combination exist").

- `POST /auth/register` `{ email, password }` → `RegisterCommand` → `RegisterHandler` → `201 { accessToken }`. Always creates a user; duplicate email → `409`. On success, publishes `UserRegisteredEvent` on the `EventBus` (currently just logged by `UserRegisteredHandler`).
- `POST /auth/login` `{ email, password }` → `LoginQuery` → `LoginHandler` → `200 { accessToken }`. Only looks a user up, never creates one; unknown email or wrong password → `401`.
- Invalid payload (missing/invalid email, password < 8 chars on register, missing password on login) → `400`.
- Passwords are hashed with `bcryptjs` (never stored or returned in plaintext). `accessToken` is a JWT signed with `JWT_SECRET`, payload `{ sub: userId, email }` — built by the shared `signAccessToken` helper so both handlers stay consistent.
- Prisma unique-constraint violations (`P2002`) on `User.email` are the source of truth for the `409` on register — not a separate existence check — to avoid a check-then-create race.

### Meeting

Protected by `JwtAuthGuard` (`@UseGuards(JwtAuthGuard)` on the controller).
Every route requires `Authorization: Bearer <accessToken>`; meetings are
always scoped to the authenticated user (`request.user.userId`, set by the
guard) — there is no cross-user visibility.

- `POST /meeting` `{ title, startTime, endTime }` → `CreateMeetingCommand` → `CreateMeetingHandler` → `201 <Meeting>`. `startTime`/`endTime` are ISO date strings; `title` must be non-empty.
- `GET /meeting` → `ListMeetingsQuery` → `ListMeetingsHandler` → `200 <Meeting[]>`. Only the caller's own meetings.
- `GET /meeting/:id` → `GetMeetingQuery` → `GetMeetingHandler` → `200 <Meeting>`. Looked up by `id` **and** `ownerId` together — an id that exists but belongs to another user 404s the same as one that doesn't exist at all, so existence isn't leaked.
- No token, or an invalid/expired one → `401` (from `JwtAuthGuard`, before the request reaches the CommandBus/QueryBus). Invalid payload on create → `400`.

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

- Feature = a module folder under `src/` (`*.module.ts`, `*.controller.ts`), registered in `app.module.ts`. `auth/` and `meeting/` use CQRS (`commands/`, `queries/`, `events/` — see [CQRS](#cqrs)) instead of a single service; a new feature module that mutates/queries domain state should follow that pattern rather than adding a `*.service.ts`.
- Wire dependencies through constructor DI, not manual instantiation.
- Co-locate unit tests as `*.spec.ts`; put cross-module HTTP tests in `test/*.e2e-spec.ts`.
- ESLint here relaxes `no-explicit-any`, `no-extraneous-class`; `no-floating-promises` is a warning — still await or `void` your promises.
- The `nestjs-best-practices` skill applies to non-trivial NestJS work.

## Keep the docs current

When a change alters this app's architecture, update the docs in the same commit:
new/removed module or changed module boundaries, a new script, a new env var or
config, or a changed port → update this file (and `.env.example` / the root
`CLAUDE.md` + `README.md` when the change is visible from outside the app).
