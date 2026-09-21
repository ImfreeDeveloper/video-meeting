# CLAUDE.md — `@claudelar/api`

NestJS 12 HTTP API. See the repo-root `CLAUDE.md` for monorepo-wide setup.

## Stack

- NestJS 12 on `@nestjs/platform-express`.
- **Native ESM** — `"type": "module"`, `module`/`moduleResolution` = `nodenext`.
  Relative imports **must carry a `.js` extension** (e.g.
  `import { AppModule } from './app.module.js'`), even though the file is `.ts`.
  Match the existing files.
- Decorators + `reflect-metadata` (`emitDecoratorMetadata`, `experimentalDecorators`).
- Vitest for tests (`vitest/globals` — `describe`/`it`/`expect` are ambient, no imports).

## Layout

```
src/
  main.ts               bootstrap; listens on process.env.PORT ?? 3001; loads .env; global ValidationPipe
  app.module.ts         root module — no controllers/providers of its own, just wires up feature modules (imports PrismaModule, UsersModule, AuthModule, MeetingModule, MeetingFileModule)
  prisma/
    prisma.module.ts    @Global() module exporting PrismaService
    prisma.service.ts   PrismaClient (pg driver adapter), connects/disconnects with the Nest lifecycle
  users/
    users.module.ts        registers CqrsModule; no controller — reached only via CommandBus/QueryBus
    commands/
      create-user.command.ts           CreateUserCommand(email, password)
      handlers/create-user.handler.ts  hashes the password (bcryptjs), creates the user, publishes UserRegisteredEvent, returns `{ id, email }`; duplicate email (Prisma P2002) → ConflictException
    queries/
      find-user-by-email.query.ts             FindUserByEmailQuery(email)
      handlers/find-user-by-email.handler.ts  looks up a user by email (full record, incl. passwordHash), or `null`
    events/
      user-registered.event.ts             UserRegisteredEvent(userId, email)
      handlers/user-registered.handler.ts  logs on registration; add more handlers here for side effects (welcome email, analytics, …)
  auth/
    auth.module.ts        registers CqrsModule + JwtModule (secret/expiry from env); exports JwtModule + JwtAuthGuard for other feature modules — does NOT import UsersModule, only talks to it via CommandBus/QueryBus
    auth.controller.ts    POST /auth/register, POST /auth/login — dispatch only, via CommandBus/QueryBus
    access-token.util.ts  shared JWT-signing helper used by both handlers
    guards/
      jwt-auth.guard.ts   JwtAuthGuard — verifies the `Authorization: Bearer <token>` header via JwtService, attaches `request.user = { userId, email }`; missing/invalid token → 401. Shared by any feature module that needs authenticated routes.
    dto/
      register.dto.ts     email + password (min 6 chars)
      login.dto.ts        email + password
    commands/
      register.command.ts           RegisterCommand(email, password)
      handlers/register.handler.ts  dispatches CreateUserCommand (users module) via CommandBus, signs the token from the result
    queries/
      login.query.ts               LoginQuery(email, password)
      handlers/login.handler.ts    dispatches FindUserByEmailQuery (users module) via QueryBus — never creates one — verifies the password (bcryptjs), signs the token
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
  meeting-file/
    meeting-file.module.ts       imports CqrsModule + AuthModule; does NOT import MeetingModule (reaches it via QueryBus, same as auth/ → users/)
    meeting-file.controller.ts   POST/GET /meeting/:meetingId/files, GET/DELETE /meeting/:meetingId/files/:fileId — all behind JwtAuthGuard, dispatch only
    ownership.util.ts    assertMeetingOwnership(queryBus, ownerId, meetingId) — the GetMeetingQuery dispatch shared by all four handlers below
    storage.util.ts      unlinkIfExists(path) — deletes a file, tolerating it already being gone (ENOENT); shared by the upload and delete handlers
    config/
      file-upload.config.ts   MIME/extension allowlist, FILE_STORAGE_DIR/MAX_FILE_SIZE_BYTES resolution, the multer options factory
    commands/
      upload-meeting-file.command.ts             UploadMeetingFileCommand(ownerId, meetingId, file)
      handlers/upload-meeting-file.handler.ts    verifies ownership via GetMeetingQuery (meeting/), moves the file from the temp upload dir into its final <meetingId>/ dir, writes the MeetingFile row
      delete-meeting-file.command.ts             DeleteMeetingFileCommand(ownerId, meetingId, fileId)
      handlers/delete-meeting-file.handler.ts    verifies ownership, unlinks the file from disk (idempotent to ENOENT), then deletes the MeetingFile row
    queries/
      list-meeting-files.query.ts                ListMeetingFilesQuery(ownerId, meetingId)
      handlers/list-meeting-files.handler.ts     verifies ownership, lists a meeting's files ordered by createdAt
      get-meeting-file.query.ts                  GetMeetingFileQuery(ownerId, meetingId, fileId)
      handlers/get-meeting-file.handler.ts       verifies ownership, looks up one file scoped to the meeting; not found (incl. another user's meeting/file) → 404
  generated/prisma/     Prisma Client output (generated, gitignored — run `prisma generate` after schema changes)
prisma/
  schema.prisma         User model (id, email @unique, passwordHash, timestamps); Meeting model (id, title, startTime, endTime, ownerId → User, timestamps); MeetingFile model (id, meetingId → Meeting, filename, mimeType, size, storagePath, uploadedById → User, createdAt)
  migrations/           Prisma migration history (committed)
test/
  auth.e2e-spec.ts         supertest e2e for register/login
  meeting.e2e-spec.ts      supertest e2e for meeting create/list/get-by-id, incl. auth and per-user isolation
  meeting-file.e2e-spec.ts supertest e2e for meeting file upload/list/download/delete, incl. format/size rejection and cross-user isolation
  setup-env.ts         loads .env for e2e runs (vitest.config.e2e.ts setupFiles)
```

DTO validation uses `class-validator` + `class-transformer` via a global
`ValidationPipe` (`{ whitelist: true, transform: true }`), applied in both
`main.ts` and each e2e spec's `beforeEach`.

### CQRS

`users/`, `auth/` and `meeting/` are all built on `@nestjs/cqrs` instead of a
single service class — this is the standard shape for a feature module here,
not a one-off:

- The **controller** only dispatches: build a command/query object and
  `await this.commandBus.execute(...)` / `this.queryBus.execute(...)`. No
  business logic lives in a controller.
- A **command** mutates state (`RegisterCommand`, `CreateUserCommand`,
  `CreateMeetingCommand`); a **query** only reads (`LoginQuery`,
  `FindUserByEmailQuery`, `ListMeetingsQuery`, `GetMeetingQuery`). Both are
  plain classes in `commands/`/`queries/` that just carry input data.
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
  them — currently only `users/` publishes one (from `CreateUserHandler`).
- Every handler (and the event handler, where used) is registered in its
  module's `providers` array, and the module imports `CqrsModule`.
- Adding a use case: add the command/query class, write one handler for it,
  register that handler in the module's `providers` — nothing else changes.
- `CommandBus`/`QueryBus`/`EventBus` are shared app-wide (every module imports
  the same `CqrsModule`), so a handler in one feature module can dispatch a
  command/query whose handler lives in a completely different module without
  either module importing the other. `auth/` uses this to talk to `users/`
  (see below) — that's the intended way for feature modules to depend on each
  other's use cases here, not a direct module import.

### Users

Owns the `User` record: creating one and looking one up. No controller — it's
only reached through the bus, currently by `auth/`.

- `CreateUserCommand(email, password)` → `CreateUserHandler` → hashes the
  password (`bcryptjs`), inserts the row, publishes `UserRegisteredEvent`
  (logged by `UserRegisteredHandler`), returns `{ id, email }`. Duplicate
  email (Prisma `P2002` on `User.email`) → `ConflictException` (`409`) — that
  race-free check, not a separate existence lookup, is the source of truth.
- `FindUserByEmailQuery(email)` → `FindUserByEmailHandler` → returns the full
  `User` row (including `passwordHash`, needed by `auth/` to verify a login)
  or `null` if no match. Read-only, never creates anything.

### Auth

Owns token generation and verification; it creates/looks up users only by
dispatching commands/queries into `users/` — it never touches Prisma or the
`User` model directly. Register is a **command** (creates a user); login is a
**query** (only reads — "does this user/password combination exist").

- `POST /auth/register` `{ email, password }` → `RegisterCommand` → `RegisterHandler` → dispatches `CreateUserCommand` (via `CommandBus`, handled in `users/`) → `201 { accessToken }`. Always creates a user; duplicate email → `409` (propagated from `users/`).
- `POST /auth/login` `{ email, password }` → `LoginQuery` → `LoginHandler` → dispatches `FindUserByEmailQuery` (via `QueryBus`, handled in `users/`), then verifies the password itself → `200 { accessToken }`. Only looks a user up, never creates one; unknown email or wrong password → `401`.
- Invalid payload (missing/invalid email, password < 6 chars on register, missing password on login) → `400`.
- Passwords are hashed in `users/` and verified in `auth/`, both with `bcryptjs` (never stored or returned in plaintext). `accessToken` is a JWT signed with `JWT_SECRET`, payload `{ sub: userId, email }` — built by the shared `signAccessToken` helper so both handlers stay consistent.

### Meeting

Protected by `JwtAuthGuard` (`@UseGuards(JwtAuthGuard)` on the controller).
Every route requires `Authorization: Bearer <accessToken>`; meetings are
always scoped to the authenticated user (`request.user.userId`, set by the
guard) — there is no cross-user visibility.

- `POST /meeting` `{ title, startTime, endTime }` → `CreateMeetingCommand` → `CreateMeetingHandler` → `201 <Meeting>`. `startTime`/`endTime` are ISO date strings; `title` must be non-empty.
- `GET /meeting` → `ListMeetingsQuery` → `ListMeetingsHandler` → `200 <Meeting[]>`. Only the caller's own meetings.
- `GET /meeting/:id` → `GetMeetingQuery` → `GetMeetingHandler` → `200 <Meeting>`. Looked up by `id` **and** `ownerId` together — an id that exists but belongs to another user 404s the same as one that doesn't exist at all, so existence isn't leaked.
- No token, or an invalid/expired one → `401` (from `JwtAuthGuard`, before the request reaches the CommandBus/QueryBus). Invalid payload on create → `400`.

### Meeting files

Lives in `meeting-file/`, not `meeting/` — a separate module so `meeting/` stays
storage-agnostic. Protected by the same `JwtAuthGuard`; ownership of the
`:meetingId` in the route is checked by dispatching `GetMeetingQuery` (from
`meeting/`) via `QueryBus` rather than importing `MeetingModule` directly (same
cross-module pattern as `auth/` → `users/`) — a non-existent or another user's
meeting 404s the same way `GET /meeting/:id` does.

- `POST /meeting/:meetingId/files` (multipart, field name `file`) →
  `UploadMeetingFileCommand` → `UploadMeetingFileHandler` → `201 <MeetingFile>`.
- Upload flow: `FileInterceptor('file', meetingFileMulterOptions())` writes the
  incoming file to a temp dir under `FILE_STORAGE_DIR` with a random name
  (`fileFilter`/`limits.fileSize` reject an unsupported MIME/extension or an
  oversized file — `415`/`413` — **before** any bytes are written, per the
  disk-write requirement in the plan). The handler then verifies meeting
  ownership, moves the file into its final `<meetingId>/` directory, and
  writes the `MeetingFile` row (original filename, MIME type, size, the
  storage path _relative_ to `FILE_STORAGE_DIR`, `uploadedById`). Ownership,
  move (`mkdir`/`rename`), and DB-insert failures each clean up whatever file
  is on disk at that point (temp file, or the moved file if the insert is
  what failed) before rethrowing — no path fails silently into an orphaned
  file.
- Supported types: audio (`.mp3`, `.wav`, `.m4a`), video (`.mp4`, `.mov`),
  documents (`.pdf`, `.docx`, `.txt`) — both extension and MIME type must
  match one allowlist row, case-insensitively
  (`meeting-file/config/file-upload.config.ts`). `defParamCharset: 'utf8'` is
  set explicitly — busboy's default (`latin1`) mis-decodes non-ASCII
  filenames clients send as raw UTF-8 bytes in the multipart part header.
- No token, or an invalid/expired one → `401`. Unsupported format → `415`.
  Oversized file → `413`. Missing/nonexistent/another user's meeting → `404`.
- `GET /meeting/:meetingId/files` → `ListMeetingFilesQuery` → `ListMeetingFilesHandler` → `200 <MeetingFile[]>`, ordered by `createdAt` ascending. Only the meeting owner; empty array if the meeting has no files.
- `GET /meeting/:meetingId/files/:fileId` → `GetMeetingFileQuery` → `GetMeetingFileHandler` → `200`, streamed via `StreamableFile` (`fs.createReadStream`, never buffered into memory) with `Content-Type` set to the stored `mimeType` and an RFC 6266 `Content-Disposition` (ASCII fallback in `filename=`, the real name in `filename*=UTF-8''...`) set from the original `filename`. A missing file id, or a file belonging to another user's meeting, 404s the same way as an unknown/foreign meeting id. A custom `StreamableFile` error handler turns a read-stream `ENOENT` (disk/DB briefly out of sync, e.g. racing a concurrent delete) into a `404` instead of leaking the absolute file path via the default handler's `400`.
- `DELETE /meeting/:meetingId/files/:fileId` → `DeleteMeetingFileCommand` → `DeleteMeetingFileHandler` → `204`. Deletes disk first, then the DB row — `unlink` is idempotent to `ENOENT` (already-missing file doesn't block cleaning up the row), but a different disk error aborts before the row is deleted, so a temporarily-unreachable file never loses its metadata. A concurrent delete of the same file (a Prisma `P2025` on the row-delete, meaning something else already removed it) is treated as success rather than a `500` — the end state either caller wanted. Once deleted, `GET .../files/:fileId` 404s the same as a file that never existed.

### Database (Prisma)

- ORM is Prisma 7 (`prisma/schema.prisma`), pointed at the repo-root Docker Compose Postgres via `DATABASE_URL`.
- Client generator is `prisma-client` (the new TS-first generator), output to `src/generated/prisma` — **inside** `src/` so it stays under `tsconfig.build.json`'s `rootDir`. It's generated, gitignored, and excluded from lint/Prettier; regenerate with `pnpm api prisma:generate` after editing the schema (also runs automatically via `postinstall`).
- The generated client requires a driver adapter — `PrismaService` (`src/prisma/prisma.service.ts`) constructs it with `@prisma/adapter-pg` + `pg`, using `DATABASE_URL`.
- CLI config lives in `prisma7.config.ts` (Prisma 7's config file, auto-discovered by the CLI — not `prisma.config.ts`).
- Migrations: `pnpm api prisma:migrate` (dev, creates + applies) / `pnpm api prisma:deploy` (applies only, for CI/prod). Commit everything under `prisma/migrations/`.

## Commands (from `apps/api`, or `pnpm api <script>` from root)

| Script              | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `dev` / `start:dev` | `nest start --watch`                                                                |
| `start:debug`       | watch + `--debug`                                                                   |
| `build`             | `nest build` -> `dist/`                                                             |
| `start:prod`        | `node dist/main`                                                                    |
| `lint`              | `eslint .`                                                                          |
| `typecheck`         | `tsc --noEmit -p tsconfig.json`                                                     |
| `test`              | `vitest run` (`**/*.spec.ts`; passes with none — currently no unit specs, only e2e) |
| `test:watch`        | `vitest` — reruns on file change                                                    |
| `test:cov`          | `vitest run --coverage` (v8)                                                        |
| `test:debug`        | `vitest --inspect-brk --no-file-parallelism` — attach a debugger                    |
| `test:e2e`          | `vitest run --config ./vitest.config.e2e.ts`                                        |
| `prisma:generate`   | `prisma generate` — regenerate the client from the schema                           |
| `prisma:migrate`    | `prisma migrate dev` — create + apply a migration (local)                           |
| `prisma:deploy`     | `prisma migrate deploy` — apply pending migrations (CI/prod)                        |
| `prisma:studio`     | `prisma studio` — browse the DB                                                     |

### Running tests

- **Unit** (`*.spec.ts`, co-located with source) — `pnpm api test`. There
  are currently none in this app (behavior is covered by the e2e specs
  instead); the run still passes (`passWithNoTests: true` in
  `vitest.config.ts`) rather than failing on an empty suite.
- **E2E** (`test/*.e2e-spec.ts`, supertest against a real `Nest` app) —
  `pnpm api test:e2e`. Requires the local Postgres to be up
  (`docker compose up -d` from the repo root — see
  [Database](../../CLAUDE.md#database)) and `apps/api/.env` populated (copy
  `.env.example`); `test/setup-env.ts` loads it via `vitest.config.e2e.ts`'s
  `setupFiles`. Each spec's `beforeEach` boots a fresh `TestingModule` from
  `AppModule` and tears it down in `afterEach` — specs don't share app state,
  but they do share the one Postgres database, so tests generate unique data
  (e.g. `randomUUID()`-based emails) rather than relying on a clean table.
- **Root `pnpm test`** (`turbo run test`) only runs the `test` task across
  packages — it does **not** run `test:e2e`. E2E has no root-level alias and
  no dedicated Turborepo task, so run it per-app: `pnpm api test:e2e`. Always
  run both before considering API changes done — see
  [Before you finish a change](../../CLAUDE.md#before-you-finish-a-change).
- **Single file / pattern** — pass a path or name filter through to Vitest
  after `--`, e.g. `pnpm api test:e2e -- auth` or
  `pnpm api test:e2e -- test/auth.e2e-spec.ts`.
- **Watch mode** — `pnpm api test:watch` (unit only; there's no
  `test:e2e:watch` script).

## Config

- `PORT` (default `3001`), `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` (default `http://localhost:3000`, the origin allowed to call the API — `@claudelar/web`'s dev server), `FILE_STORAGE_DIR` (default `./storage/uploads`, where meeting file uploads are stored on disk), `MAX_FILE_SIZE_BYTES` (default `524288000` / 500 MiB, max size of a single meeting file upload) — see `.env.example`. No `ConfigModule`; `dotenv/config` loads `.env` at the top of `main.ts` (and in `test/setup-env.ts` for e2e), `main.ts`/services read `process.env` directly. `FILE_STORAGE_DIR` is resolved fresh on every upload (`meeting-file/config/file-upload.config.ts`); `MAX_FILE_SIZE_BYTES` is only read once, when that module is first imported (multer bakes it into the instance it builds) — either way, tests must set both before compiling `AppModule`, which `test/meeting-file.e2e-spec.ts` already does. `MAX_FILE_SIZE_BYTES` is also clamped to Postgres `Int`'s range (~2 GiB), since `MeetingFile.size` is stored as an `Int`.
- `nest-cli.json` — `sourceRoot: src`, `deleteOutDir` on build.

## Conventions

- Feature = a module folder under `src/` (`*.module.ts`, `*.controller.ts` — a controller is optional, e.g. `users/` has none), registered in `app.module.ts`. `users/`, `auth/` and `meeting/` use CQRS (`commands/`, `queries/`, `events/` — see [CQRS](#cqrs)) instead of a single service; a new feature module that mutates/queries domain state should follow that pattern rather than adding a `*.service.ts`. A feature module that needs another module's use case dispatches a command/query into it via `CommandBus`/`QueryBus` rather than importing that module directly (see `auth/` → `users/`).
- Wire dependencies through constructor DI, not manual instantiation.
- Co-locate unit tests as `*.spec.ts`; put cross-module HTTP tests in `test/*.e2e-spec.ts`.
- ESLint here relaxes `no-explicit-any`, `no-extraneous-class`; `no-floating-promises` is a warning — still await or `void` your promises.
- The `nestjs-best-practices` skill applies to non-trivial NestJS work.

## Keep the docs current

When a change alters this app's architecture, update the docs in the same commit:
new/removed module or changed module boundaries, a new script, a new env var or
config, or a changed port → update this file (and `.env.example` / the root
`CLAUDE.md` + `README.md` when the change is visible from outside the app).

## File upload

Phases 1 (upload) and 2 (list/download/delete) are implemented — see
[Meeting files](#meeting-files). @research/research-meeting-upload has the
underlying design rationale (storage layout, streaming, delete ordering) if
it's ever unclear why something is built the way it is.
