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

## P02 — Web foundation (2026-11-20)

Built the Cairo RTL theme, brand assets, three shells, login and account actions, permission guards, system pages and registry-driven home. The shared package exports Cairo formatters, namespaced Arabic copy and presentation metadata for request statuses, displayed stages, item states and urgency.

| Primitive | Main props or interface |
|---|---|
| `Logo` | Inline mark and LTR-isolated wordmark |
| `Button` | `variant`, `loading`, `iconOnly` and native button props |
| `Field` | `label`, `hint`, `error`, `required` and a render function receiving accessible control props |
| `Input`, `Textarea`, `Select`, `NumberInput` | Native props. NumberInput uses a decimal string `value` and `onValueChange`. |
| `Modal` | `open`, `title`, `onClose`, optional `description`, `icon`, `drawer` and `dismissible`. Mark an element with `data-initial-focus` to focus it on open. |
| `useConfirm`, `usePrompt` | Promise-based dialogs with a title, optional description, action label and tone. Prompts accept `mode: 'reason'` and return a string or `null`. |
| `Toast`, `Chip`, `StatusChip` | One RTL Sonner host. Chips take `tone` and `icon`, status chips take `status` and optional `count`. |
| `ChipSelect`, `SelectableCard`, `ToggleRow` | Controlled multi-select, radio selection and switch. All take labels and change handlers. |
| `Tabs` | Controlled segments with content or route links, with optional tab counts. |
| `Skeleton`, `EmptyState` | Skeleton takes a size class. EmptyState takes a title and optional description, icon and action. |
| `DataTable`, `Pagination` | Table takes a caption, columns, rows, row key, state and recovery props, optional actions and dense mode. Pagination takes page, page size, total and change handler. |
| `ActionBar`, `useLeaveGuard` | Bar takes primary, secondary and overflow actions, each with optional progress and a blocking reason. Leave guard takes the dirty flag. |

**App contract.** `SessionProvider` reads P01's `/me` endpoint and refreshes quietly on navigation at 10-second intervals. Check `useCan(key)` and `useCanOnSite(key, siteId)` before rendering controls. Routes can wrap their content in `ProtectedRoute` with an `anyOf` permission list. Login restores the original local URL. The login page includes the 15-minute wait guidance alongside P01's generic credentials error. The standard shell reserves the notification slot for the inbox phase.

**Dependencies and verification.** `@fontsource-variable/cairo` bundles Cairo locally, `lucide-react` supplies the icons, and Sonner handles toasts. `pnpm --filter web icons` uses Sharp to regenerate the PNGs from the brand SVG. Lint, typecheck, 35 Vitest tests and the production web build passed. Chromium exercised real login/logout, return URLs, admin navigation, dialogs and the gallery at 360 px and 1440 px. The production bundle excludes the gallery route.

**Deferred.** Registry destinations have guarded placeholders for later modules. The home inbox is reserved for P14.

## P03 — Admin console (2026-11-20)

Built the users, roles, role editor and settings screens in the Admin shell, plus the sites record manager at `/master-data/sites`. The account menu already called `POST /me/password`. The role editor uses the shared dependency closure and validator, and users see server guard messages with their recovery text.

- **API and shared modules.** The settings migration adds a singleton seeded on API startup. `GET /api/v1/settings` requires a session and `PUT /api/v1/settings` requires `settings.manage`. Writes validate both message templates and the aging range, and audit the update in the same transaction. `GET /api/v1/users/options` supplies scoped sites and assignability flags for the users page. Shared validation and preview substitution live in `packages/shared/src/settings.ts`.
- **Web modules.** Lazy routes in `apps/web/src/pages/admin/` use the module registry, shared Arabic copy, and existing controls. Copying a role replaces the editor's selected permissions with the source's grantable keys and retains the destination's name, description and scope. The Admin sidebar links to Sites under «التكويدات» pending the P05 hub tile.
- **Verification.** Lint, typecheck, 57 Vitest tests, coverage gates and production builds passed. Chromium at 360 px verified site creation, role creation and assignment as the seeded administrator, and settings preview and save. The assignee's existing session gained site access on its next API request. Local database verification used isolated PostgreSQL 18 because Docker's engine was unavailable.
- **Deferred.** The P05 master-data hub and P17 audit viewer remain later work. The record managers use database-assigned IDs on save. A guaranteed pre-save ID preview would require reserving an identifier when the form opens.

## P04 — Catalog API (2026-11-21)

Built the tree, attributes, units, items, and suppliers APIs in `apps/api/src/modules/`. The catalog migration adds materialized paths, per-category code sequences, trigram indexes, and the price-history table. Startup seeds the five categories and 11 units once. Every mutation writes a signed audit row in the same transaction. Shared request schemas, Arabic normalization, and Egyptian mobile helpers live in `packages/shared/src/catalog/`. No dependencies were added.

All endpoints are under `/api/v1`.

| Area | Endpoints |
|---|---|
| Tree | `GET /catalog-tree/categories`, `GET /catalog-tree/nodes/:id`, `GET /catalog-tree/nodes/:id/children`, `POST /catalog-tree/categories`, `POST /catalog-tree/nodes`, `PUT /catalog-tree/nodes/order`, `PATCH /catalog-tree/nodes/:id`, `POST /catalog-tree/nodes/:id/move`, `POST /catalog-tree/nodes/:id/deactivate`, `DELETE /catalog-tree/nodes/:id` |
| Catalog and picker | `GET /catalog/categories`, `GET /catalog/nodes/:id`, `GET /catalog/nodes/:id/children`, `GET /catalog/nodes/:id/items`, `GET /catalog/items/:id`, `GET /catalog/search?categoryId=&q=`, `POST /catalog/items`, `PATCH /catalog/items/:id`, `POST /catalog/items/:id/move`, `DELETE /catalog/items/:id` (deactivate) |
| Attributes | `GET /attributes`, `GET /attributes/:id`, `POST /attributes`, `PATCH /attributes/:id`, `POST /attributes/:id/deactivate`, `DELETE /attributes/:id` |
| Options | `POST /attributes/:id/options`, `PUT /attributes/:id/options/order`, `PATCH /attributes/:id/options/:optionId`, `POST /attributes/:id/options/:optionId/deactivate`, `DELETE /attributes/:id/options/:optionId` |
| Node defaults | `GET /nodes/:id/attributes`, `PUT /nodes/:id/attributes`, `GET /nodes/:id/effective-attributes` |
| Units | `GET /units`, `GET /units/:id`, `POST /units`, `PATCH /units/:id`, `POST /units/:id/deactivate`, `DELETE /units/:id` |
| Suppliers | `GET /suppliers` (optional `categoryId` selects active suppliers), `GET /suppliers/:id`, `POST /suppliers`, `PATCH /suppliers/:id`, `POST /suppliers/:id/deactivate`, `DELETE /suppliers/:id` |

- **Browsing.** The picker uses `catalog.view` alone. An inactive ancestor hides its branch from the picker. Item reads accept `includeInactive=true` with `masterData.view`. Folder results count immediate groups and all items in the subtree and supply an empty `coverThumbs` array. Paginated endpoints use `page` and `pageSize`. Search matches normalized substrings in names, codes, and attribute values within the selected category.
- **Writes.** Reactivate through the resource's `PATCH` endpoint with `{ "isActive": true }`. Reorder requests send the complete sibling or option ID list, including inactive entries. `parentId: null` selects categories for reordering. Effective defaults keep the first occurrence of each active attribute from root to leaf. Item writes take `{ attributeId, value }` entries with text strings, decimal strings, or SELECT option IDs. Renaming a selected option refreshes affected search text in the same transaction.
- **Open questions.** Category deletion returns 409 while suppliers are linked. If automatic unlinking is desired for suppliers with several categories, define that rule before changing the guard. Unit labels are currently limited to NUMBER attributes.
- **Deferred.** P05 owns the UI, P06 owns images and thumbnails, and P12 writes and exposes prices. Recent items and «أخرى» conversion depend on request data. Item detail exposes a null price placeholder to callers holding `requests.viewPrices`.
- **Verification.** Lint, typecheck, 154 Vitest tests, and coverage gates passed on an isolated PostgreSQL 18 instance because the Docker engine was unavailable. The HTTP tests cover permission and validation checks for every endpoint, moves through more than six levels, and 50 concurrent creates with consecutive codes. An Arabic substring query could use the GIN trigram index on the test database's Arabic locale.

## P05 — Master data UI and explorer (2026-11-21)

- **Built.** The permission-gated hub links to the catalog, category tree, attributes, units, suppliers and the P03 Sites manager. The explorer has sticky breadcrumbs, folder rows and tiles, material swatches, category-wide search, directional view transitions and recovery states. The tree supports desktop drag reorder and phone move buttons. The item editor inherits defaults on creation and guards unsaved edits. The supplier form validates and formats Egyptian mobile numbers with the shared helpers.
- **Modules.** The explorer, item editor, node picker and catalog actions live in `apps/web/src/features/catalog/`. The hub, item detail and manager routes are in `apps/web/src/pages/master-data/`. Arabic copy lives in `packages/shared/src/i18n/ar.ts`.
- **Explorer contract for P09.** Use `<Explorer mode="pick" nodeHref={nodeHref} onPickItem={onPickItem} onAddOther={onAddOther} />` inside the request workspace. The router parameter is `:nodeId`. The caller's `nodeHref(nodeId: number): string` should build `/requests/:requestId/add/node/:nodeId`. The item callback receives the `CatalogItem` DTO from `apps/web/src/lib/api/catalog.ts`. The «أخرى» callback receives the open folder ID. The caller owns request item entry and persistence. Pick mode uses `catalog.view` with active-only data. Management mode uses `<Explorer mode="manage" />` and routes at `/catalog` and `/catalog/node/:nodeId`.
- **API and decisions.** Folder reads accept guarded `includeInactive=true`. Item lists and search accept an `active` filter before pagination. Item editor choices and supplier category choices have dedicated write-permission checks. `PATCH /catalog/items/:id/editor` saves edits, a same-category location change and active state in one transaction. Item removal uses deactivation. Empty folders can be permanently deleted. Record IDs are allocated on save, as in P03. No dependencies or database migrations were added.
- **Verification.** Lint, typecheck, 169 Vitest tests, coverage gates and the production build passed. Chromium with the real API exercised five folder levels at 360 px, sticky and collapsed breadcrumbs, backward transitions, reduced motion, both editor layouts, desktop drag reorder and phone move buttons. API verification used isolated PostgreSQL 18 because the Docker engine was unavailable.
- **Deferred.** P06 owns images and thumbnails, P09 owns request item entry, and P12 owns the latest purchase price. No new open questions.
