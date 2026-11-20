# P10 — Purchasing API

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p10-purchasing-api`
- **Depends on:** P09

Paste everything below the line into a new Codex thread.

---

Phase P10 of Purchasing+: everything the purchasing officer does before approval — price-request batches with WhatsApp text, pricing by line total, unavailable items, the delivery fee, submitting pricing — plus pause, purchasing's «إرجاع للتعديل», and editing while paused. Transitions go through `runTransition` and the P07 module. `AGENTS.md` and `apps/api/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/03-purchasing.md` — "Suppliers and WhatsApp numbers", "Price-request batches", "Pricing", "«أخرى» items"
- `docs/spec/02-request-lifecycle.md` — T11–T16 and T19
- `docs/spec/05-timeline-notifications.md` — event types for batches, pricing, pause
- `docs/spec/09-assumptions.md` — A-3, A-4, A-23

## Build
1. **Shared helpers** (pure, tested): `buildRfqMessage(template, request, items)` (placeholders + `{lineNo}) {name} – {specs} – {quantity} {unit}` lines, omitting empty specs), `buildWhatsAppUrl(digits, text)` returning `{ url, tooLong }` (tooLong when the encoded URL exceeds 4,000 characters), `renderTemplate(template, values)` shared with supply orders later.
2. **Prisma models + migration:** `RfqBatch`, `RfqBatchItem`, `RfqBatchSupplier` (message, sentAt, sentById), `PricingRound`, `PricingRoundItem`.
3. **Endpoints** (under `/api/v1/requests/:id/purchasing`, permission per action):
   - `GET /` purchasing view: items with state, flags, pricing draft, and per item the suppliers it was sent to (with times); the category's active suppliers with how many selected items each already received; existing batches.
   - `POST /batches` (`purchasing.sendRfq`): item ids + supplier ids + message; validates suppliers are active and in the request's category. Returns per-supplier rows with `waUrl` and `tooLong`.
   - `PATCH /batches/:batchId/suppliers/:supplierId` (message tweak), `POST …/sent` (mark sent, idempotent).
   - `PATCH /items/:itemId/pricing` (`purchasing.price`): supplier (any active supplier) + line total (decimal string > 0), or clear. Autosave-friendly; no timeline event.
   - `POST /items/:itemId/unavailable` / `DELETE` (with optional note) — events `ITEM_UNAVAILABLE` / `ITEM_AVAILABLE_AGAIN`.
   - `PUT /delivery-fee` (`purchasing.price`; allowed until COMPLETED; event with before/after).
   - `POST /submit-pricing` → T16 (round 1) or T19 (later rounds for previously unavailable items, P12 handles approval).
4. **Pause and edits:** `POST /requests/:id/pause` (reason), `/resume`, `/purchasing-return` (reason, notifies creator), and `PATCH /requests/:id/paused-edit` (diff; sets `needsRepricing` and clears the pricing draft on edited priced items; sets `modifiedAfterSend` on edited items that were in a batch; `isModified`).
5. Purchasing list support: extend `GET /requests` filters so the officer can list AT_PURCHASING requests and FULFILMENT requests with UNAVAILABLE/REMAINING items or unsent supply orders (the last condition can return none until P12).

## Tests
- Message builder and URL builder (Arabic text encoding, empty specs, tooLong threshold).
- Batch validation (supplier outside category, inactive supplier); re-sending items to more suppliers; mark-sent idempotency.
- Pricing: line total validation, derived unit price rounding (half-up, 2 places) in the DTO, unavailable flow, delivery fee never added to the total.
- Submit pricing: refused with no priced items, refused with unresolved `needsRepricing`; priced → AWAITING_APPROVAL, unavailable stay; notification rows to `pricing.approve` holders in scope.
- Pause → paused edit flags → resume; officer return notifies the creator; pause refused outside AT_PURCHASING.
- Redaction for viewers without price/supplier keys.

## Not in this phase
UI (P11), approval and everything after (P12).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P10 section
- [ ] Commit `P10: purchasing API`
