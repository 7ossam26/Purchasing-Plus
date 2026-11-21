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

## P06 — Catalog images (2026-11-21)

- **Storage and upload.** Local disk and R2 implement the same put, delete and URL contract. The API issues one-hour signed URLs by default. A configured `STORAGE_PUBLIC_BASE_URL` serves the public path. Local files live under `./storage` relative to the API process. Apply the catalog-images migration before starting the API.
- **API.** `POST /catalog/items/:id/images` accepts one multipart `file` per request. The editor queues multiple selections so each file gets its own progress and result. `PUT /catalog/items/:id/images/order` takes the complete ordered ID list. `PUT /catalog/items/:id/images/:imageId/cover` and `DELETE` on the image resource set cover and delete. All writes require `catalog.edit`. The server validates the image signature, enforces 15 MiB, 50 megapixels and 10 live images per item, and stores 400 px and 1600 px WebP variants without metadata or upscaling. Upload rollback cleans up written objects. If deletion of an object fails, the same DELETE can retry using the retained cleanup record.
- **Catalog and client view.** Item responses carry ordered image URLs. A single folder query collects up to three cover thumbnails per subtree. The explorer uses them for folder stacks and the item's cover for swatches. The read-only catalog is reachable from Home with `catalog.view`. The image manager, carousel, and full-screen viewer live in `apps/web/src/features/catalog/`. Client presentation includes the item name, images and active attributes explicitly marked «تظهر في عرض العميل». Existing attributes default to hidden in this mode.
- **Dependencies.** Sharp and heic-convert process images, file-type sniffs signatures, Busboy bounds multipart input, and the AWS S3 SDK and presigner implement R2. The small HEIC fixture was generated for this repository and runs through the real decoder.
- **Verification.** Lint, typecheck, production builds and 175 Vitest tests passed. The R2 contract uses a mocked client. Chromium at 360 px with touch emulation verified upload of a generated 12 megapixel HEIC to real local storage, WebP display, folder thumbnails, pinch zoom and double-tap zoom. The client view was also checked at desktop width. A physical iPhone was unavailable for verification.
- **Open questions.** O-1 remains open. The same driver supports a public R2 domain and a private bucket.

## P07 — Lifecycle core (2026-11-21)

Import the rules from `@purchasing-plus/shared/lifecycle`. `RequestState` carries the request, item flags and quantities, pricing rounds, RFQ batches and supply orders. `Viewer` accepts the P01 user ID, superadmin flag, permission set, site scope and site IDs. Creator actions still require ownership. T25 takes a null system actor.

### Commands for P08–P13

Each suffix below has two named functions. For example, `canRecordReceipt(state, viewer, input)` returns `{ ok: true }` or `{ ok: false, code, message }` with Arabic copy. `applyRecordReceipt(state, viewer, input, now)` enforces the same rules and returns `{ next, events, notify, priceRecords, copiedDraft? }`. A refusal throws `LifecycleError` with the same code and message. All commands take the expected `version`. A successful command advances it once, including when an automatic event follows the user action. Inputs and prior state remain usable after success or refusal.

| Transitions | Function suffixes | Result or inputs of interest |
|---|---|---|
| T1–T5 | `SaveDraft`, `DeleteDraft`, `Submit`, `EditBeforeApproval`, `EditQuantities` | Start with `draftState(identity)` at version 0. Edits take `fields`, `add`, `remove` and `change`. Deletion returns `next.deleted` for hard deletion. Submit takes the transaction-allocated yearly sequence and formats the number using Cairo time. |
| T6–T10 | `Approve`, `Reject`, `ReturnForEdit`, `Resubmit`, `RaiseUrgency` | Manager decisions, reasons, creator resubmission and the urgency lock. |
| T11–T14 | `Pause`, `PurchasingReturnForEdit`, `EditWhilePaused`, `Resume` | Pause metadata, edit diff, invalidated draft prices and previously sent lines. |
| T15–T16 | `CreateBatch`, `MarkBatchSent`, `SavePricingDraft`, `MarkUnavailable`, `MarkAvailable`, `SubmitPricing` | Batch and supplier selection, per-line draft or availability, and a frozen pricing round. Draft autosaves are quiet. The round event keeps its total and delivery fee separate. |
| T17–T19 | `ApprovePricing`, `MarkSupplyOrderSent`, `RejectPricing`, `PriceUnavailable` | Decide a numbered round, record catalog unit prices and supplier orders, mark an order sent, or price a newly available line for another round. |
| T20–T23 | `RecordReceipt`, `StillComing`, `RepriceRemaining`, `ResolveExternally` | Atomic receipt lines with an optional note, outstanding quantities, supplier-specific follow-up and closure. |
| T24–T26 and copy | `Cancel`, `AutoComplete`, `EditDeliveryFee`, `CopyRequest` | Cancellation retains receipts. Closing the last line automatically emits the terminal event. Copy returns a separate draft and events for both requests. |

`actions[name]` exposes the same `can` and `apply` functions. `ActionInput<Name>` gives the command-specific TypeScript input. Pass an explicit `Date` to reducers. The persistence layer owns ID allocation, current catalog snapshots at submission and edit, and active catalog lookups for copies. It must compare the stored version and persist the result, actor name and role snapshots, audit entry and notifications in one transaction. Resolve recipient rules with `matchesRecipient(intent, viewer)` and deduplicate by event and user. Publish after commit.

### Queries and events

- `availableActions(state, viewer)` returns ordered `{ action, hint }` entries for the action bar. The API can compute this before redacting sensitive fields from a response.
- `deriveStage(state)` returns the displayed stage. `stateCounts(state)` returns counts for every item state. `stageStartedAt(events)` takes events in append order and returns the current stage's entry timestamp, or null for empty and final histories. `isAging(start, now, agingDays)` compares Cairo calendar days.
- `inQueue(queue, state, viewer)` tests membership in `drafts`, `manager`, `purchasing`, `pricingApproval`, `receipt` or `paused`. `compareQueue(a, b)` orders rows with urgency and stage-start time.
- `diffRequest(before, after)` returns the typed `EDITED` payload. `eventPayloadSchemas[type]` validates each of the 30 event payloads. `describeEvent(event)` renders the Arabic timeline sentence and accepts historical actor name and role snapshots. The schemas and formatter are also exported from `@purchasing-plus/shared/events`.
- `openItem(data, lineNo)` initializes an unpriced line. `outstanding(item)` and `unitPrice(total, quantity)` return decimal strings. `sameDecimal`, `isClosed`, `isFinal`, `holds` and `inSite` return booleans. The shared package now uses the specified `decimal.js` dependency for arithmetic.

**Open questions and decisions.** T16 permits submission with at least one priced line. If ordinary unpriced OPEN lines remain, purchasing can finish them during fulfilment. When only OPEN lines remain, the displayed stage is AT_PURCHASING and the purchasing queue includes them. T26 treats all three final statuses as read-only for fee edits. Draft deletion yields an audit operation for the adapter, since the event model defines no draft-deletion timeline event.

**Verification.** Lint, typecheck, production builds and all 772 Vitest tests passed. The 597 new lifecycle tests cover the transition matrices, permissions, sites, event recipients, pricing and receipt sequences, Cairo midnight and DST. V8 measured 99.8% lifecycle line coverage against an enforced 95% threshold. The lifecycle tests run without a database. The existing API suite used isolated PostgreSQL 18.

## P08 — Requests API (2026-11-21)

Apply the request and event-history migrations with `pnpm --filter api prisma migrate deploy` and the target `DATABASE_URL` before starting the API. The six request models live in `apps/api/prisma/schema.prisma`. The API lives in `apps/api/src/modules/requests/` and imports request input schemas from the shared package.

All paths below are relative to `/api/v1/requests`.

| Endpoint | Input and result |
|---|---|
| `POST /` | Create a draft with `siteId`, `categoryId` and optional `urgency`, `unitOrClient`, `note`. Returns 201 and the request DTO. |
| `PATCH /:id/draft`, `PATCH /:id` | Save a draft or edit a request before manager approval. A full `items` array replaces live lines. Existing lines carry their `id` and new lines omit it. Each line sends `specs`, a decimal-string `quantity`, and either `catalogItemId` or `nodeId`, `unitId`, `otherName`. Drafts can change site and line order. Category and submitted line numbers are fixed. |
| `DELETE /:id` | Hard-delete the caller's draft with `confirm: true`. Returns 204. |
| `POST /:id/submit`, `/resubmit`, `/approve`, `/reject`, `/return`, `/urgency` | Submit or decide a request. Reject and return take `reason`. Urgency takes the higher `urgency` value. Submit refreshes catalog snapshots and uses a gap-free Cairo-year number. |
| `PATCH /:id/quantities` | Takes `lines: [{ itemId, quantity }]`. Returns the updated request. |
| `GET /`, `GET /:id`, `GET /:id/timeline` | List filters are `status`, `stage`, `siteId`, `categoryId`, `urgency`, `createdById`, `q`, `from`, `to`, `page`, `pageSize`. Dates filter creation time and date-only bounds use whole Cairo dates. Lists sort by urgency descending and stage start ascending. Timeline returns `{ items }` in append order. |
| `POST /:id/copy` | Optional `siteId` or a list of rejected `itemIds`. Returns 201 with a fresh draft and records both timeline links. |
| `POST /:id/items/:itemId/add-to-catalog` | Takes optional catalog editor fields and defaults to the line's name, unit and group. Returns the updated request with the new catalog ID and its original snapshot. Requires `catalog.create` and `requests.view`. |
| `GET /recent-items?categoryId=` | Returns `{ items }` with up to 12 distinct active items from the caller's scoped request history. Requires `requests.create` and `catalog.view`. |

**Transition contract.** Call `runTransition(ctx, requestId, action, read, prepare)` inside the authenticated `endpoint` transaction. `ctx.viewer` supplies the effective grants and `ctx.now` supplies the timestamp. `read` parses input after the scoped row lock, and `prepare(state, input)` resolves database-backed values into `{ command, state? }` for P07. Existing commands supply `version`. The runner checks it, invokes the shared guard and reducer, persists the result and any copied draft, appends actor snapshots and signed audits, and resolves active, scoped notification recipients in the same transaction. It returns the redacted DTO or null for hard deletion. Later purchasing phases can extend this path with price-history writes. P14 owns post-commit delivery.

**Read contract.** `toRequestDto` includes `displayedStage`, `stageStartedAt`, `stateCounts` and permission-aware `availableActions`. Item prices and supplier IDs follow their independent permissions. Timeline requires `requests.viewTimeline` and applies additional payload redaction, including copy links outside the viewer's scope. A scoped collection returns an empty result for a foreign site filter. Foreign individual requests return 404. Submitted removals are kept for history.

**Verification.** All 810 Vitest tests passed, including HTTP tests on isolated PostgreSQL 18 and the 30 concurrent submits. Coverage measured 96.79% lines in the requests module and 98.69% in the shared lifecycle. No new dependencies.

## P09 — Request UI (2026-11-21)

- **Engineer flow.** Home links to `/requests`. The new-request sheet skips the site choice when only one active site is in scope. It creates a draft and opens the catalog picker at `/requests/:id/add/node/:nodeId`. The picker shows recent items at the root, a sticky basket, and sheets for catalog and «أخرى» lines. Repeated catalog items with the same unit and specs can be combined using decimal arithmetic. The review route at `/requests/:id/review` autosaves after 1.5 seconds and flushes pending edits before submit. Failed saves keep the form and show retry. A 409 shows the API message and reloads the request.
- **Request detail.** `/requests/:id` shows the stage rail, items and the permission-gated timeline. The action bar uses the DTO's available actions for this phase. It supports creator revisions, manager quantity edits, approval, reason-based rejection and return, higher urgency, deletion and copying. Tapping the rail with timeline access jumps to the current stage's entry. Catalog conversion reuses the item editor and the existing atomic linking endpoint.
- **API additions.** `GET /requests/options` supplies scoped sites and category filter choices to request viewers, with active units for request creators. Catalog lines accept an optional `unitId` override that persists through submission. The creator receives `returnReason` while the request is returned. Supplier names follow the existing supplier visibility permission.
- **Verification.** Lint, typecheck, coverage gates and 818 Vitest tests passed on isolated PostgreSQL 18. In Chromium's 360 px phone emulation, a scripted engineer completed and submitted five lines in about 2 seconds. The real API also passed manager return, phone edit and resubmit, desktop approval and catalog conversion. Mobile and desktop captures were reviewed. No dependencies or migrations were added.

## P10 — Purchasing API (2026-11-21)

Apply the purchasing migration before starting the API. It replaces the empty request batch and round placeholders with relational RFQ batches, supplier send records and immutable submitted round lines. The shared package exports `buildRfqMessage`, `buildWhatsAppUrl` and `renderTemplate` for the purchasing screens. WhatsApp URLs include a `tooLong` flag above 4,000 encoded characters. Sending is manual.

| Endpoint under `/api/v1/requests/:id` | Contract |
|---|---|
| `GET /purchasing?itemIds=1,2` | Request DTO with RFQ history and active category suppliers. Optional comma-separated item IDs drive each supplier's distinct sent-item count. `pricing` contains the request total, pending total, counts and repricing blockers. The fee is separate. Supplier identity and prices follow their separate visibility keys. RFQ message text and links additionally require `purchasing.sendRfq`. |
| `POST /purchasing/batches` | Takes `itemIds`, `supplierIds` and `message`. Returns 201 with `{ version, batch }`, including each supplier's message, WhatsApp URL and length flag. A supplier must be active in the request's category. |
| `PATCH /purchasing/batches/:batchId/suppliers/:supplierId` and `POST …/sent` | Change an unsent supplier's message or record its sender and time. Repeating a recorded confirmation returns the original marker and current version, including when the retry carries the old version. |
| `PATCH /purchasing/items/:itemId/pricing` | Takes a positive decimal-string `lineTotal` and any active `supplierId`. Send both as null to clear the draft. The DTO derives unit price with half-up rounding. Draft writes are quiet on the timeline. |
| `POST` or `DELETE /purchasing/items/:itemId/unavailable` | Marks or clears unavailability with an optional `note`. In fulfilment, pricing a previously unavailable line opens it for the next round. |
| `PUT /purchasing/delivery-fee`, `POST /purchasing/submit-pricing` | Set `deliveryFee` to a decimal string or null. Submit captures the fee and priced lines in the round, leaves unavailable lines in place, and notifies scoped approvers. Final requests keep the P07 fee lock. |
| `POST /pause`, `POST /purchasing-return`, `POST /resume`, `PATCH /paused-edit` | Pause and purchasing return require `reason`. Paused edit takes `fields`, `add`, `remove` and `change: [{ itemId, fields }]`. The lifecycle determines pricing invalidation and sent-item flags. |

Mutations use `version`. `runTransition` can now dispatch between shared actions from the locked state and commit supplemental records alongside the request, audit, timeline and notifications. The pricing approval phases can load the persisted round snapshots by request ID and round number. Use `GET /api/v1/requests?queue=purchasing` for the scoped purchasing queue. It uses shared rules for open pricing work, remaining lines and unsent orders.

Lint, typecheck and all 853 Vitest tests passed. Coverage reached 96.64% lines in the purchasing API and 97.83% in the shared lifecycle. All migrations applied to an empty PostgreSQL 18 database. The upgrade also preserved the request, item and event counts in a P09 database copy.

## P11 — Purchasing UI (2026-11-21)

- **Queue.** The home module opens `/purchasing` for viewers with a purchasing key. The queue uses the API's scoped urgency and stage-time order, shows the request facts and item counts, and links directly to the request's purchasing tab.
- **Price requests.** The three bottom sheets handle supplier selection with prior-send counts, an editable message filled from `settings.rfqIntro`, and individual WhatsApp links, copy, message edits and send confirmation. Long links show a copy-and-paste instruction. Phone numbers are LTR-isolated and copyable. Line chips show distinct supplier counts and open the timestamped history. Unfinished batches can be reopened.
- **Pricing.** The request tab has per-line supplier and decimal total inputs, a derived unit price, and an availability switch with an optional note. The supplier picker starts with active category suppliers and can search all active suppliers. Quotes and fees autosave with retry, sharing a request-version queue with RFQ writes. The server supplies the pricing blocker. The confirmation shows the pending round total and the separate delivery fee.
- **Paused requests.** The action bar uses the server's available actions for pause, resume and purchasing return. The banner shows the pauser, reason and time. Viewers allowed to edit while paused use the existing request editor, which sends a diff to `/paused-edit`.
- **API support.** `GET /api/v1/requests/:id/purchasing/suppliers` provides paginated active supplier search to a pricing viewer in the request's scope. The purchasing DTO adds `pricing.submitBlocker` from the shared lifecycle guard. The request DTO includes the pauser's display name, and request options supply active units to paused editors.
- **Verification.** Lint, typecheck and both Vitest runs passed, with 861 tests and the coverage thresholds met on isolated PostgreSQL 18. Three consecutive runs against the development API used a 360 px Chromium touch viewport. Each recorded sends for three suppliers, saved five prices and a separate fee, and moved the request to pricing approval. The page, tabs and open sheets fit their containers without horizontal scrolling. WhatsApp links opened in separate tabs and were intercepted locally. Mobile and desktop captures were reviewed.

## P12 — Fulfilment API (2026-11-21)

- **Storage and transitions.** The fulfilment migration creates `SupplyOrder`, `SupplyOrderItem`, `Receipt` and `ReceiptLine` and links catalog price records to their source request and line. `apps/api/src/modules/fulfilment/` persists P07 results through `runTransition`. A scoped request lock and version check cover the decision, order lines, receipts, prices, timeline, audit and notifications. Detail reads hold a shared lock while assembling the response.
- **Round API.** Under `/api/v1/requests/:id`, use `GET /rounds/:n`, `POST /rounds/:n/approve` or `POST /rounds/:n/reject`. The round view includes previous approved summaries and the submitted delivery fee separately from the round total. Pending rounds compare against the latest catalog unit price. A decision saves the comparison record so subsequent purchases preserve the historical comparison. A zero previous price gives a null percentage. Decisions and external resolutions use actor and role snapshots.
- **Orders and receipts.** `GET /supply-orders` returns ordered items, editable messages and WhatsApp links for the sender. `PATCH /supply-orders/:n` takes `message`, and `POST /supply-orders/:n/sent` accepts a repeated confirmation. Order numbers are local to each request. `POST /receipts` takes `lines: [{ itemId, quantity, note? }]` and an optional receipt note. Use `POST /items/:itemId/still-coming`, `/reprice` or `/resolve-externally` for follow-up, and `POST /cancel` with a reason. Mutations take the request version.
- **Request and catalog reads.** Request detail includes rounds, supply orders, receipts and outstanding quantities. Later-round pricing uses the existing pricing and submission routes. Copy accepts rejected `itemIds` and an optional `roundNo` to constrain selection. Catalog detail returns the latest purchase price to price viewers and applies supplier visibility separately.
- **Verification.** Lint, typecheck and all 888 Vitest tests passed on Node 24 with isolated PostgreSQL 18. Coverage measured 100% of fulfilment module lines and 97.51% of shared lifecycle lines. HTTP races produced one successful approval or receipt and one 409. The migration also preserved a populated pre-P12 pending round, its line total and its separate delivery fee.
- **Open question.** Catalog prices are shared master data. The API limits the source request number to viewers in the source site's scope. Confirm whether cross-site catalog price provenance needs a different display rule.
- **Deferred.** P13 owns the UI and P14 owns live delivery. No dependencies were added.
