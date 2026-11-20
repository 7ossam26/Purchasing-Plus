# Progress log

Codex appends one section per phase. Newest at the bottom. Keep each section short: it's read at the start of every later phase.

## Template

```
## Pxx — <name> (YYYY-MM-DD)
Built:
- …
Key files/modules:
- …
Decisions made (not in the spec):
- …
Deferred / follow-ups:
- …
Open questions:
- …
```

## Open questions (running list)

_None yet._

## P00 — Monorepo scaffold (2026-11-20)
Built:
- pnpm workspace, strict TypeScript, ESLint, Prettier, Vitest projects with v8 coverage, and architecture guardrails with failing fixtures.
- Express API with validated environment, database-backed health check, public errors, Prisma extension migration, and test database helpers.
- Arabic RTL React placeholder with Vite proxy; PostgreSQL 17 development Compose service and GitHub Actions CI.
- Verified install, lint, typecheck, build, 8 tests, coverage thresholds, and the dev proxy. Docker was unavailable locally, so database tests used an isolated PostgreSQL 18 instance; CI uses PostgreSQL 17.
Key files/modules:
- Root workspace/tooling configs, `docker-compose.yml`, `docker/postgres-init/`, `.github/workflows/ci.yml`.
- `apps/api/src/{app,server,config,middleware,test}/`, `apps/api/prisma/`, `apps/web/src/`, `packages/shared/src/`, `packages/shared/test/`.
Decisions made (not in the spec):
- Shared builds with `tsc` before dev/tests; package exports use built JavaScript and source TypeScript types.
- Prisma 7.10.1 is the current stable major; Prisma 8 is a release candidate. `@prisma/adapter-pg` supplies its PostgreSQL driver.
- Extra scaffold tooling: `tsx` runs API TypeScript in development, `eslint-plugin-import-x` checks import order with ESLint 10, and `@tailwindcss/vite` integrates Tailwind v4.
- Development defaults come from `apps/api/.env.example`; an optional ignored `.env` can override them. `DATABASE_URL_TEST` is required by test helpers, not by production startup.
Deferred / follow-ups:
- Domain models, authentication, UI design, and the production Docker image belong to later phases.
- Run the exact Compose command on a machine with Docker; this host has no Docker CLI.
Open questions:
- None.
