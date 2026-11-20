# P13 — Fulfilment UI

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p13-fulfilment-ui`
- **Depends on:** P12

Paste everything below the line into a new Codex thread.

---

Phase P13 of Purchasing+: the screens for approving pricing, sending supply orders, recording receipt on site, handling remaining items, and cancelling. `AGENTS.md` and `apps/web/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/03-purchasing.md` — "Pricing approval", "Supply orders", "Receipt", "Remaining items"
- `docs/spec/02-request-lifecycle.md` — T17–T26, "Displayed stage"
- `docs/spec/07-ui-design.md` — "Request page", "Mobile patterns", status tones, "Copy"
- `docs/DESIGN_SYSTEM.md` — §6 G, §12 (inline consequence), §14

## Build
1. **Approval card** on the البنود tab for `pricing.approve`/`pricing.reject` holders: round items with supplier, line total and unit price; last catalog price with ▲/▼ and percent in the matching tone; round total; delivery fee on its own line («منفصلة عن الإجمالي»); earlier rounds collapsed. Actions «اعتماد التسعير» (primary) and «رفض التسعير» (danger outline, reason sheet naming the consequence). After a decision, the header shows «اعتمد بواسطة {name} ({role})» or «رفض بواسطة …» with the date — make this attribution clear and prominent.
2. **Supply orders panel** (purchasing): one card per supplier with its items, editable message, «افتح واتساب», «نسخ الرسالة», «تم الإرسال» and the sent time.
3. **Tab «الاستلام»** (for `receipt.record`): items awaiting receipt with outstanding quantity; per item «استلمت الكمية كلها» (one tap) or a quantity field and optional note; sticky «تسجيل الاستلام» saving all lines; receipt history below.
4. **Remaining items panel** (purchasing): for each REMAINING item the three choices — «لسه جاي من نفس المورد», «إعادة تسعير» (supplier + line total form), «اتحل من المهندس». Unavailable items show «سعّر البند» and «اتحل من المهندس».
5. **«اتحل من المهندس»** for engineers too (`items.resolveExternally`), with optional note; the item row then shows who did it and their role.
6. **Cancel at any stage** (`requests.cancelAnyStage`) in the overflow, danger tone, reason required, consequence spelled out.
7. **Rejected items:** struck-through rows with the rejection reason and «نسخ البنود المرفوضة لطلب جديد».
8. Item state chips and per-state counts update everywhere (header, lists) after each action.

## Tests
- Approve and reject flows (reason required); attribution rendered.
- Receipt: receive-all, partial quantity validation, multiple lines saved together.
- Remaining choices call the right endpoints and update states.
- Resolve externally shows actor and role.
- Cancel requires a reason.
- Visibility per permission (no approve button without the key; prices hidden without `requests.viewPrices`).

## Not in this phase
Timeline redesign, notifications, inbox (P14).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] A request can be walked from submitted to completed in the browser with one user per sample role
- [ ] `docs/PROGRESS.md` P13 section
- [ ] Commit `P13: fulfilment UI`
