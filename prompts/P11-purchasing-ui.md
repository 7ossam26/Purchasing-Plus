# P11 — Purchasing UI (phone first)

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p11-purchasing-ui`
- **Depends on:** P10

Paste everything below the line into a new Codex thread.

---

Phase P11 of Purchasing+: the purchasing officer's screens. He works on his phone all day: one thumb, quick taps, WhatsApp open in another app. `AGENTS.md` and `apps/web/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/03-purchasing.md` — "Price-request batches", "Pricing", "«أخرى» items"
- `docs/spec/07-ui-design.md` — "Mobile patterns", "Request page", status tones
- `docs/spec/02-request-lifecycle.md` — T11–T16
- `docs/DESIGN_SYSTEM.md` — §6 F (settlement cards pattern), §12 (bulk selection, progressive disclosure), §13, §14

## Build
1. **Purchasing queue** page (`/purchasing`, for holders of any purchasing key): requests needing purchasing, sorted by urgency then time in stage, with urgency badge, site, category, item counts, «معدّل».
2. **Tab «المشتريات»** on the request page:
   - **Items list** with checkboxes, «تحديد الكل», line number, name + specs, quantity + unit, and chips: «اتبعت لـ N موردين» (tap → list of suppliers and times), «اتعدل بعد الإرسال», «اتعدل – محتاج إعادة تسعير», «غير متوفر».
   - **Batch flow** as three bottom-sheet steps: «اختار الموردين» (category suppliers, select all, how many of these items each already got) → «الرسالة» (one textarea pre-filled from `settings.rfqIntro` + item lines) → «إرسال» (one row per supplier: «افتح واتساب», «نسخ الرسالة», «تم الإرسال», expandable per-supplier tweak; the long-message notice when `tooLong`). «افتح واتساب» opens the URL in a new context so the app keeps its state when the officer comes back.
   - **Pricing mode:** per item a supplier picker (category suppliers first, «كل الموردين» toggle with search) and a line-total field (numeric keypad, Western digits); the derived unit price in muted text under it; «غير متوفر» toggle with an optional note. Autosave per item with a subtle saved marker.
   - **Footer:** total of priced items, the delivery-fee field («رسوم التوصيل — منفصلة عن الإجمالي»), and «إرسال للاعتماد» with the blocking reason under it when disabled. Confirmation sheet: priced count, unavailable count, total, delivery fee.
3. **Pause / resume / «إرجاع للتعديل»** actions in the action bar for the matching keys (reason sheets). A paused request shows a distinct-tone banner with who paused it, why and when. Editing while paused reuses the P09 edit mode (engineer and manager both, whoever paused).
4. Copy a supplier's phone number with one tap; show phones formatted and LTR-isolated.

## Tests
- Batch flow end to end with a mocked API: select items → suppliers → edit message → open/copy/mark sent → chips update.
- Re-selecting an already-sent item works and shows the right count.
- Pricing: line total updates the derived unit price; unavailable toggle; delivery fee shown separately and not in the total.
- Submit disabled with the reason when there are no priced items or unresolved re-pricing.
- Paused banner and action visibility per permission.

## Not in this phase
Approval, supply orders, receipt, remaining items (P13).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] On a 360 px viewport the officer can send a batch to three suppliers and price five items without horizontal scrolling
- [ ] `docs/PROGRESS.md` P11 section
- [ ] Commit `P11: purchasing UI`
