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
  main.ts            bootstrap; listens on process.env.PORT ?? 3001
  app.module.ts      root module
  app.controller.ts  + app.controller.spec.ts (unit)
  app.service.ts
test/
  app.e2e-spec.ts    supertest e2e
```

## Commands (from `apps/api`, or `pnpm api <script>` from root)

| Script              | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `dev` / `start:dev` | `nest start --watch`                         |
| `start:debug`       | watch + `--debug`                            |
| `build`             | `nest build` -> `dist/`                      |
| `start:prod`        | `node dist/main`                             |
| `lint`              | `eslint .`                                   |
| `typecheck`         | `tsc --noEmit -p tsconfig.json`              |
| `test`              | `vitest run` (`**/*.spec.ts`)                |
| `test:watch`        | `vitest`                                     |
| `test:cov`          | coverage (v8)                                |
| `test:e2e`          | `vitest run --config ./vitest.config.e2e.ts` |

## Config

- `PORT` (default `3001`) — see `.env.example`. No `ConfigModule` yet; `main.ts` reads `process.env` directly.
- `nest-cli.json` — `sourceRoot: src`, `deleteOutDir` on build.

## Conventions

- Feature = a module folder under `src/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`), registered in `app.module.ts`.
- Wire dependencies through constructor DI, not manual instantiation.
- Co-locate unit tests as `*.spec.ts`; put cross-module HTTP tests in `test/*.e2e-spec.ts`.
- ESLint here relaxes `no-explicit-any`, `no-extraneous-class`; `no-floating-promises` is a warning — still await or `void` your promises.
- The `nestjs-best-practices` skill applies to non-trivial NestJS work.

## Keep the docs current

When a change alters this app's architecture, update the docs in the same commit:
new/removed module or changed module boundaries, a new script, a new env var or
config, or a changed port → update this file (and `.env.example` / the root
`CLAUDE.md` + `README.md` when the change is visible from outside the app).
