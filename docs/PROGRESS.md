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

## P01 — Access control core (2026-11-20)

Built the shared permission and module registries, seven access-control models, six editable seed roles, superadmin bootstrap, database sessions, scoped administration APIs and append-only audit history. Apply migrations with `pnpm --filter api prisma migrate deploy` with `DATABASE_URL` set before starting the API. The API test project deploys migrations to `DATABASE_URL_TEST` before running.

All endpoints below use the `/api/v1` prefix. Mutations require the configured public Origin, including login and logout.

| Area | Endpoints |
|---|---|
| Session | `POST /auth/login`, `POST /auth/logout`, `GET /me`, `POST /me/password` |
| Users | `GET /users`, `POST /users`, `PATCH /users/:id` (including active state), `POST /users/:id/reset-password` |
| Roles | `GET /roles`, `GET /roles/:id`, `GET /roles/assignable-keys`, `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id` |
| Sites | `GET /sites`, `POST /sites`, `PATCH /sites/:id`, `DELETE /sites/:id` (deactivation) |
| Support | `GET /system/superadmins`, `POST /system/superadmins`, `PATCH /system/superadmins/:id`, `POST /system/superadmins/:id/reset-password` |
| Audit | `GET /system/audit-log` with `from`, `to`, `userId`, `entity`, `action`, pagination and per-row signature verification |

**Contract for later phases.** `requireSession` attaches `req.viewer = { userId: number, isSuperadmin: boolean, permissions: Set<PermissionKey>, siteScope: 'ASSIGNED' | 'ALL', siteIds: number[] }`. Use `requirePermission(...keys)` for all keys or `requireAnyPermission(keys)` for alternatives. Apply `siteWhere(viewer)` to rows with a `siteId` and `assertSiteInScope(viewer, siteId)` to individual records (404 outside scope). The role name in `/me` is for display. A superadmin has ALL scope. An ASSIGNED viewer with no sites has an empty site filter.

**Implementation decisions.** Integer IDs, normalized lowercase usernames, HMAC digests of opaque session tokens, and a 30-second permission cache that checks user and role versions on every request. Access-control writes serialize under a PostgreSQL transaction lock and recheck grants before writing. Managers can administer accounts only within their own grant and site scope, including password resets. Password changes revoke all sessions. Audit signatures cover the event timestamp, action, entity, entity ID, actor ID, actor label and client IP. PostgreSQL rejects updates and deletes of audit rows.

**Dependencies and verification.** The API uses `@node-rs/argon2` for argon2id, `helmet` for security headers and `express-rate-limit` for the per-client login limit (40 requests per 15 minutes). Shared request schemas use Zod. Lint, typecheck, API build, 20 Vitest tests and coverage gates passed on an isolated PostgreSQL 18 database. The built API also passed bootstrap, login and profile checks over HTTP.

**Deferred.** Catalog and settings seeds belong to their respective phases. Configure trusted proxy addresses at deployment so the login limiter and audit IP reflect the client behind the reverse proxy.
