# P12 — Fulfilment API

- **Model:** GPT-6.2 Astra (`gpt-6.2-astra`)
- **Reasoning:** High
- **Branch:** `p12-fulfilment-api`
- **Depends on:** P11

Paste everything below the line into a new Codex thread.

---

Phase P12 of Purchasing+: everything after pricing is submitted — approval rounds, supply orders, receipts, remaining items, later rounds for previously unavailable items, cancel at any stage, automatic completion, and catalog price records. This is where item states diverge within one request, so correctness and concurrency matter most. All rules come from the P07 module through `runTransition`. `AGENTS.md` and `apps/api/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/02-request-lifecycle.md` — "Fulfilment" (T17–T26), "Copy to new request", "Displayed stage"
- `docs/spec/03-purchasing.md` — "Pricing approval", "Supply orders", "Receipt", "Remaining items"
- `docs/spec/04-catalog.md` — "Catalog items" (price records)
- `docs/spec/05-timeline-notifications.md` — the related event types and recipients
- `docs/spec/09-assumptions.md` — A-5, A-7, A-8, A-11, A-12, A-22

## Build
1. **Prisma models + migration:** `SupplyOrder`, `SupplyOrderItem`, `Receipt`, `ReceiptLine`; start writing `CatalogItemPrice`.
2. **Approval** (`/api/v1/requests/:id/rounds/:n`): `GET` round view for approvers (items, supplier, line total, derived unit price, round total, delivery fee separate, and for catalog items the last price record with the change in amount and percent); `POST /approve` (T17: items → AWAITING_RECEIPT, price records with unit price = lineTotal ÷ quantity rounded half-up, supply orders grouped by supplier, approver recorded); `POST /reject` (T18 with reason; round-1 rule vs later-round rule).
3. **Supply orders** (`/supply-orders`): list per request with `waUrl` built from `settings.supplyOrderIntro` (placeholders incl. site name and address) + item lines; message tweak; mark sent (idempotent). Unsent supply orders now count for the purchasing queue filter from P10.
4. **Receipts** (`POST /receipts`, `receipt.record`): several lines at once, each 0 < q ≤ outstanding, optional note; partial → REMAINING; full → RECEIVED; notifications per spec 05.
5. **Remaining items** (`purchasing.handleRemaining`): `still-coming` (T21), `reprice` (T22: new supplier + line total for the outstanding quantity, no approval, price record with source `REPRICED`, supply order when the supplier changed).
6. **Resolve externally** (`items.resolveExternally`, T23) on UNAVAILABLE and REMAINING items, recording who and their role.
7. **Later rounds:** pricing previously UNAVAILABLE items and submitting creates round n+1 → AWAITING_APPROVAL (T19).
8. **Cancel at any stage** (`requests.cancelAnyStage`, T24) with reason. **Auto-complete / auto-reject** (T25) evaluated after every fulfilment transition.
9. **Copy rejected items:** `POST /requests/:id/copy` with `itemIds` from a rejected round (extends P08).
10. Request DTO additions: rounds summary with who approved/rejected and when (shown prominently), supply orders, receipts, outstanding quantity per item.

## Tests
- Full matrix through HTTP for T17–T26, including refusals for wrong state and missing keys.
- Two approvers approving the same round concurrently: exactly one succeeds, the other gets 409.
- Receipts: over-receipt refused, multiple partials, REMAINING then each of the three outcomes.
- Price records: correct unit price and source; latest price returned on the catalog item; approval view shows the change vs the previous price.
- Rejection rules: round 1 with nothing approved → request REJECTED; later round → only those items; copy of rejected items.
- Supply orders grouped by supplier; created again on re-price to a new supplier; not on still-coming.
- Cancel keeps received quantities; auto-complete when all closed; all-resolved-before-pricing completes.
- Delivery fee never in any total.
- Notification rows for each event per the spec table.

## Not in this phase
UI (P13), SSE (P14).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P12 section
- [ ] Commit `P12: fulfilment API`
