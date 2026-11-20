# P07 — Lifecycle core (pure, shared)

- **Model:** GPT-6.2 Astra (`gpt-6.2-astra`)
- **Reasoning:** High
- **Branch:** `p07-lifecycle-core`
- **Depends on:** P06

Paste everything below the line into a new Codex thread.

---

Phase P07 of Purchasing+: the complete request lifecycle as pure, exhaustively tested TypeScript in `packages/shared/src/lifecycle/`. Every later API and UI phase calls this module instead of writing its own checks, so it must be correct and complete now — including transitions whose endpoints come later. No database, no HTTP. `AGENTS.md` applies.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/02-request-lifecycle.md` — all of it
- `docs/spec/03-purchasing.md` — "Pricing", "Receipt", "Remaining items" (the rules, not the UI)
- `docs/spec/05-timeline-notifications.md` — "Event model" and the notification recipients table
- `docs/spec/01-access-control.md` — "Rules" and the registry keys
- `docs/spec/09-assumptions.md` — A-3, A-4, A-5, A-6, A-11, A-12

## Build
1. **Types:** `RequestStatus`, `ItemState`, `Urgency`, `DisplayedStage`, `Viewer` (userId, isSuperadmin, permissions, siteScope, siteIds), `RequestState` (the minimal shape the rules need: id, status, siteId, createdById, urgency, urgencyLocked, version, deliveryFee, items with state/quantity/receivedQty/pricing fields/flags, rounds summary).
2. **Guards** for every action T1–T26: `can<Action>(state, viewer, input) → { ok: true } | { ok: false, code, message }` with Arabic messages from `i18n/ar.ts`. Each guard checks permission key, site scope, status/item state, required inputs (reasons), and quantity rules.
3. **Reducers** for every action: `apply<Action>(state, viewer, input, now) → { next: RequestState, events: EventDraft[], notify: NotifyIntent[] }`. `NotifyIntent` describes recipients by rule (e.g. `{ holdersOf: "pricing.approve", siteId }`, `{ userId: creator }`), never by role. Includes the automatic rules: item → REMAINING on partial receipt, auto-complete, auto-reject, needsRepricing / modifiedAfterSend on paused edits, urgency lock.
4. **`availableActions(state, viewer)`** — ordered list of actions the viewer can take now, with `primary`/`secondary`/`danger` hints, for the UI action bar.
5. **Derivations:** `deriveStage(state)` (precedence), `stateCounts(state)`, `stageStartedAt(events)`, `isAging(stageStartedAt, now, agingDays)` using Cairo days, queue predicates for each queue in spec 02 "Queues", and the queue sort comparator.
6. **Event payload schemas** (Zod) for every event type in spec 05, plus `describeEvent(event) → Arabic past-tense sentence` for the timeline.
7. **Diff helper** for request edits: field changes and item adds/removes/changes in the payload format `EDITED` uses.

## Tests (this phase is mostly tests)
- A table-driven matrix: every action × every request status → allowed or the exact refusal code. Same for item-level actions × item states.
- Permission and scope refusals for every action (wrong key, site out of scope, superadmin allowed).
- Urgency: creator can lower before lock; after a manager raise nobody can lower; manager can raise further.
- Paused edits set the right flags; resume returns to AT_PURCHASING.
- Pricing submit: needs ≥1 priced item, blocks on unresolved needsRepricing, unavailable items stay.
- Receipts: quantities > 0 and ≤ outstanding, multiple partial receipts, REMAINING then still-coming / reprice / resolve.
- Rejection: round 1 with nothing approved → request REJECTED; a later round → only those items, request continues.
- Auto-complete (including all-resolved-before-pricing) and cancel-any-stage keeping received quantities.
- `deriveStage` precedence and counts; aging across a Cairo day boundary and a DST change.
- Notify intents per spec 05 table, never including the actor.
- Coverage ≥ 95 % lines for `lifecycle/`.

## Not in this phase
Prisma, routes, UI.

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P07 section documents the public API of the module (function names and what each returns) for P08–P13
- [ ] Commit `P07: lifecycle core`
