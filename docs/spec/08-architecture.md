# 08 — Architecture, testing, deployment

## Stack

Use the current stable major of each at scaffold time and pin exact versions in the lockfile.

| Layer | Choice |
|---|---|
| Runtime | Node.js 24 LTS (`.nvmrc`, `engines`) |
| Package manager | pnpm workspaces |
| Language | TypeScript, `strict`, ES modules everywhere |
| API | Express 5, Zod validation, Prisma ORM, PostgreSQL 17+ (`pg_trgm` extension) |
| Auth | Opaque DB sessions in an `httpOnly` cookie, argon2id (`@node-rs/argon2`) |
| Web | React 19, Vite, React Router (data router), TanStack Query, Tailwind CSS v4, `lucide-react`, `react-hook-form` + Zod resolver, `sonner` for toasts (one toast system), Chart.js via `react-chartjs-2` |
| Images | `sharp`, `heic-convert`, `@aws-sdk/client-s3` (R2) |
| Excel | `exceljs` |
| Dates | `@date-fns/tz` + `date-fns`, all business dates in `Africa/Cairo` |
| Money | `decimal.js` |
| Tests | Vitest everywhere; `supertest` for HTTP; `@testing-library/react` + `jsdom` for components |

Don't add other UI kits (no MUI, no component libraries) or a second icon set.

## Repository layout

```
/
├─ AGENTS.md                 rules for Codex (read automatically)
├─ apps/
│  ├─ api/                   Express API (+ serves the built web app in production)
│  │  ├─ AGENTS.md
│  │  ├─ prisma/             schema.prisma, migrations, seed.ts
│  │  └─ src/
│  │     ├─ app.ts, server.ts
│  │     ├─ config/          env (Zod-validated)
│  │     ├─ middleware/      session, requirePermission, scope, origin check, errors, audit
│  │     ├─ modules/<area>/  routes.ts, service.ts, repo.ts (Prisma), schemas.ts, *.test.ts
│  │     ├─ lib/             storage, events bus, sse, whatsapp, phone, money, time
│  │     └─ test/            factories, db reset, helpers
│  └─ web/
│     ├─ AGENTS.md
│     └─ src/
│        ├─ app/             router, providers, shells
│        ├─ styles/          tokens.css, base.css
│        ├─ components/ui/   primitives (Modal/Sheet, Button, Field, StatusChip, Toast, …)
│        ├─ components/shared/ DataTable, FilterBar, DateRange, EmptyState, ActionBar, …
│        ├─ features/<area>/ domain components and hooks
│        ├─ pages/           one per route
│        └─ lib/             api client, useCan, formatters
├─ packages/
│  └─ shared/                permission registry, module registry, lifecycle rules,
│                            stage derivation, event schemas, Zod DTOs, i18n/ar.ts,
│                            phone normalization, money + Cairo-time helpers
├─ docs/                     SPEC (spec/), DESIGN_SYSTEM.md, PHASES.md, PROGRESS.md
├─ assets/brand/             logo.svg, logo-on-black.png
├─ prompts/                  one Codex prompt per phase
└─ docker/, Dockerfile, docker-compose.yml, .github/workflows/ci.yml
```

`packages/shared` must not import from either app and must not touch the network or database. Everything in it is pure and unit-tested.

## Data model outline (Prisma)

`User` (name, username, passwordHash, isSuperadmin, roleId?, isActive, failedAttempts, lockedUntil, lastLoginAt) · `UserSite` · `Role` (name, description, siteScope) · `RolePermission` (roleId, key) · `Session` · `Site` · `Setting` (key/value JSON, typed by a Zod schema in shared) · `CatalogNode` · `AttributeDefinition` · `AttributeOption` · `NodeAttribute` · `Unit` · `CatalogItem` · `CatalogItemAttributeValue` · `CatalogItemImage` · `CatalogItemPrice` · `CodeSequence` (per category) · `Supplier` · `SupplierCategory` · `Request` · `RequestNumberSequence` (per year) · `RequestItem` · `RfqBatch` · `RfqBatchItem` · `RfqBatchSupplier` (message, sentAt, sentById) · `PricingRound` · `PricingRoundItem` · `SupplyOrder` · `SupplyOrderItem` · `Receipt` · `ReceiptLine` · `RequestEvent` · `Notification` · `AuditLog` · `RecentItem` (or derive from requests).

Conventions: integer or UUIDv7 ids (pick one and use it everywhere), `createdAt`/`updatedAt` on everything, `Decimal(14,2)` for money, `Decimal(12,2)` for quantities, foreign keys with explicit `onDelete`, indexes on every filter/sort column, soft deactivation (`isActive`) instead of deletes for anything history refers to.

## API conventions

- REST JSON under `/api/v1`. Resource-oriented routes; workflow transitions as explicit sub-resources (`POST /requests/:id/approve`, `/reject`, `/return`, `/pause`, `/resume`, `/pricing-rounds`, `/pricing-rounds/:n/approve`, …).
- Every route declares its permission(s) with `requirePermission(...keys)` and, for request routes, loads the request and checks site scope **before** any work.
- Input: Zod schemas from `packages/shared`. Output: DTOs with redaction applied (AC-7).
- Errors: `{ "error": "MACHINE_CODE", "message": "رسالة عربية", "fix": "كيف تصلحها (اختياري)" }` with the right HTTP status (400, 401, 403, 404, 409, 422). The web shows `message` and `fix` (DESIGN_SYSTEM §13).
- Pagination: `?page=&pageSize=` (max 100) with `{ items, total, page, pageSize }`.
- Money and quantities as decimal strings. Timestamps ISO-8601 UTC.
- Optimistic concurrency on requests via `version` (409 on mismatch).
- Each transition runs in one database transaction: state change + timeline event + audit row + notifications enqueue. Events are published to SSE only after commit.

## Testing (Vitest only)

- `pnpm test` runs all projects (Vitest workspace): `packages/shared`, `apps/api`, `apps/web`.
- **shared:** unit tests for every lifecycle rule (each transition allowed and refused), stage derivation, phone normalization, money rounding, Cairo date presets, permission dependency resolution, i18n key presence. Coverage ≥ 90 % lines.
- **api:** integration tests through HTTP with `supertest` against a real PostgreSQL test database (`DATABASE_URL_TEST`, from `docker compose up db`). Migrate once per run; truncate between test files; factories in `src/test/factories.ts`. Every route has: happy path, missing permission (403), out-of-scope site (403/404), validation error (422), and for transitions, wrong-state (409). Coverage ≥ 80 % on `modules/*/service.ts`.
- **web:** component tests for primitives, `useCan`-gated rendering, forms and validation, the explorer navigation, the action bar, the timeline. Mock the API at the fetch layer (MSW is fine). No snapshot tests of whole pages.
- **architecture tests** (Vitest, in `packages/shared/test/architecture.test.ts` or the root): no role-name logic (AC-1); no physical CSS direction classes in web; `packages/shared` has no imports from apps or Node built-ins that do I/O.
- A full-lifecycle scenario test (P18) drives one request from draft to completed through the HTTP API with different users.

## CI (GitHub Actions)

On push and PR: install with pnpm cache → `pnpm lint` → `pnpm typecheck` → start a `postgres` service → `prisma migrate deploy` on the test DB → `pnpm test --coverage`. Fail on coverage below thresholds.

## Deployment (Hostinger VPS + Dokploy)

- **One Docker image** (multi-stage): builds `packages/shared`, `apps/web` and `apps/api`; the API serves `/api/*` and the built SPA (with history fallback) from the same origin. Non-root user, `NODE_ENV=production`.
- On container start: `prisma migrate deploy`, then the server. Superadmin bootstrap and first-boot seed run idempotently at start.
- **Dokploy:** an Application from the GitHub repo using the Dockerfile; a PostgreSQL database service; environment variables set in Dokploy; domain + HTTPS through Dokploy's Traefik; health check `GET /api/health` (checks DB). Single replica (the in-memory event bus and SSE assume one instance).
- SSE responses send `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and a 25 s heartbeat.
- Backups: Dokploy scheduled PostgreSQL backups to S3-compatible storage (an R2 bucket works), daily, 14-day retention. Document the restore steps in `docs/DEPLOY.md`.
- Images: `STORAGE_DRIVER=r2` in production. Until the R2 public/private decision is made, the presigned-URL mode works with no public bucket.

### Environment variables

`DATABASE_URL`, `DATABASE_URL_TEST` (dev/CI), `SESSION_SECRET`, `AUDIT_HMAC_SECRET`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`, `PUBLIC_ORIGIN`, `STORAGE_DRIVER` (`local`|`r2`), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `STORAGE_PUBLIC_BASE_URL` (optional), `PORT`. All validated at boot with Zod; the server refuses to start with a clear message if any required one is missing.

## Security checklist

`helmet` with a strict CSP (self only, plus the storage origin for images); login rate limit; Origin check on mutations; argon2id; session revocation on deactivate/password reset; server-side permission + scope on every route; field redaction; upload type sniffing and size limits; no secrets in logs or audit payloads; parameterized raw SQL only; `npm audit`-clean at release (pnpm audit).
