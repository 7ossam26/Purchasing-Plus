# P08 — Requests API

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p08-requests-api`
- **Depends on:** P07

Paste everything below the line into a new Codex thread.

---

Phase P08 of Purchasing+: persistence and endpoints for requests from draft through the site manager's decision, plus timeline events, notification rows, copy, recent items and «أضف للكتالوج». All rules come from the P07 lifecycle module. `AGENTS.md` and `apps/api/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md` (especially the P07 module API)
- `docs/spec/02-request-lifecycle.md` — "Request fields", "Request item fields", T1–T10, "Copy to new request", "Queues"
- `docs/spec/04-catalog.md` — "From «أخرى» to the catalog", "Recent items"
- `docs/spec/05-timeline-notifications.md` — "Event model" (incl. redaction), notification recipients table
- `docs/spec/01-access-control.md` — AC-6, AC-7
- `docs/spec/09-assumptions.md` — A-1, A-2

## Build
1. **Prisma models + migration:** `Request`, `RequestItem` (snapshot JSON, specs, quantity, unit, state, flags, pricing columns used later), `RequestNumberSequence` (per Cairo year), `RequestEvent`, `Notification`.
2. **A persistence helper** `runTransition(requestId, viewer, action, input)` that loads `RequestState`, checks `version`, calls the shared guard and reducer, writes the new state, events (with actor name and role snapshots), audit row and notification rows (resolving `NotifyIntent` to user ids by permission key + site scope; never the actor; never superadmins) in one transaction, then returns the DTO. Every transition route in this and later phases uses it.
3. **Endpoints** (under `/api/v1/requests`):
   - `POST /` create draft (site in scope and active, category is a top-level node, creator has `requests.create`).
   - `PATCH /:id/draft` autosave (header fields + full item list; catalog items snapshotted; specs pre-fill rule from spec 02 is the client's job, store what's sent).
   - `DELETE /:id` delete draft.
   - `POST /:id/submit`, `/resubmit`, `/approve`, `/reject`, `/return`, `/urgency`, `PATCH /:id/quantities` (manager), `PATCH /:id` (creator edit while AWAITING_MANAGER or RETURNED, producing an `EDITED` diff and `isModified`).
   - `GET /:id` → DTO with redaction, `displayedStage`, `stateCounts`, `availableActions` for this viewer.
   - `GET /` list with filters (status/stage, site, category, urgency, creator, number search, date range), scope, pagination, sort (urgency then time in stage).
   - `GET /:id/timeline` (`requests.viewTimeline`, redacted).
   - `POST /:id/copy` → new draft for the caller (optional `itemIds` for P12's rejected-items shortcut).
   - `POST /:id/items/:itemId/add-to-catalog` (`catalog.create`): creates the catalog item (reusing the P04 service) and links the request item; event `ADDED_TO_CATALOG`.
   - `GET /recent-items?categoryId=` → the caller's last 12 distinct catalog items in that category.
4. **Number assignment** on first submit: `PR-YYYY-NNNNN`, Cairo year, row-locked per-year sequence, gap-free under concurrency.
5. **Redaction** in one `toRequestDto(request, viewer)` used by every response.

## Tests
- Draft lifecycle: create, autosave, delete; site/category validation; out-of-scope site refused.
- Submit assigns numbers; 30 concurrent submits produce unique consecutive numbers; year rollover in Cairo time.
- Manager approve/reject/return with reasons; creator resubmit; quantity edits; creator edit sets `isModified` and writes a correct diff.
- Urgency raise locks; creator can't lower afterwards.
- `version` conflict returns 409 with the Arabic message.
- Notifications: rows created for the right users only (permission + scope), never the actor or a superadmin.
- Redaction: viewer without `requests.viewPrices` / `viewSupplierNames` / `viewTimeline`.
- Copy and add-to-catalog.
- Each route: 401, 403, out-of-scope 404, 422, wrong-state 409.

## Not in this phase
Purchasing, fulfilment (P10, P12), SSE delivery (P14), UI.

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P08 section with endpoints and the `runTransition` contract
- [ ] Commit `P08: requests API`
