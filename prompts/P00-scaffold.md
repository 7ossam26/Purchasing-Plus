# P00 — Monorepo scaffold, tooling, CI

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p00-scaffold`
- **Depends on:** the kit committed to an empty repo

Paste everything below the line into a new Codex thread.

---

You're starting Purchasing+. This phase sets up the empty monorepo so every later phase can build and test. `AGENTS.md` applies.

## Read first
- `docs/spec/00-overview.md`
- `docs/spec/08-architecture.md` — "Stack", "Repository layout", "Testing", "CI", "Environment variables"
- `docs/PHASES.md` (skim the table only)

## Build
1. **pnpm workspace** with `apps/api`, `apps/web`, `packages/shared` (package name `@purchasing-plus/shared`). Root `package.json` scripts: `dev` (api + web together), `build`, `lint`, `typecheck`, `test`, `test:coverage`. `.nvmrc` = 24, `engines.node` set. `.editorconfig`, `.gitignore`, Prettier, ESLint flat config (TypeScript, React hooks, import order). `tsconfig.base.json` with `strict: true`; each package extends it. ES modules everywhere.
2. **Vitest workspace** at the root with three projects (shared: node, api: node, web: jsdom). Coverage with v8. `pnpm test` runs all.
3. **docker-compose.yml** with PostgreSQL 17: an init script creates `purchasing_dev` and `purchasing_test` and enables `pg_trgm` in both. Port 5432, named volume.
4. **apps/api:** Express 5 + TypeScript. `createApp()` (exported for tests) and `server.ts`. `config/env.ts` validates env with Zod and refuses to start with a clear Arabic+English message when something required is missing. `GET /api/health` → `{ status: "ok", db: "ok" }` (checks DB). `AppError(status, code, messageAr, fixAr?)` and an error middleware rendering `{ error, message, fix }`. Prisma initialized (generator + datasource only, no models yet) with the `pg_trgm` extension declared. `src/test/` helpers: test DB URL from `DATABASE_URL_TEST`, `resetDb()` (truncate all tables except `_prisma_migrations`).
5. **apps/web:** Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router + TanStack Query. `index.html` has `lang="ar" dir="rtl"`. One placeholder route showing «Purchasing+». Dev server proxies `/api` to the API.
6. **packages/shared:** `src/index.ts`, empty `permissions/`, `lifecycle/`, `i18n/ar.ts` folders with index files, and subpath exports (`@purchasing-plus/shared/permissions`, `/lifecycle`, `/i18n/ar`). Built with `tsc` or consumed as TS source via workspace references — pick the simplest setup that works for both apps, Vitest and the production Docker build later.
7. **Architecture tests** (they pass now and guard every later phase):
   - No role-name logic: scan `apps/*/src` and `packages/*/src` (excluding seed files and tests) for `role.name`, `roleName`, `roleId ===`, `.role?.name` in conditions. Fail with file and line.
   - No physical direction classes in `apps/web/src`: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l`, `rounded-r`, `border-l`, `border-r` (as Tailwind classes). Fail with file and line.
   - `packages/shared/src` imports nothing from `apps/*`, `node:fs`, `node:net`, `@prisma/*`.
8. **CI:** `.github/workflows/ci.yml` — pnpm cache, install, lint, typecheck, Postgres 17 service, `pnpm test:coverage`.
9. `.env.example` for the API with every variable from spec 08 and safe dev defaults.

## Tests
- `GET /api/health` returns ok against the test DB.
- Env validation rejects a missing `DATABASE_URL`.
- Error middleware renders the `{ error, message, fix }` shape.
- The three architecture tests, plus a fixture-based test proving each one actually fails on a bad sample.

## Not in this phase
Any domain model, auth, UI design, Docker production image.

## Done when
- [ ] `pnpm install && docker compose up -d db && pnpm lint && pnpm typecheck && pnpm test` passes from a clean clone
- [ ] `pnpm dev` serves the web app and `/api/health` through the proxy
- [ ] CI workflow is valid
- [ ] `docs/PROGRESS.md` has a P00 section; commit `P00: monorepo scaffold`
