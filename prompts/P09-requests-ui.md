# P09 — Request UI: new request, request page, manager actions

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p09-requests-ui`
- **Depends on:** P08

Paste everything below the line into a new Codex thread.

---

Phase P09 of Purchasing+: the engineer's request flow on a phone, the request page with its stage rail, and the site manager's decisions. `AGENTS.md` and `apps/web/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md` (P05 Explorer contract, P07 module API, P08 endpoints)
- `docs/spec/07-ui-design.md` — "New request", "Request page", "Mobile patterns", "Copy", status tones
- `docs/spec/05-timeline-notifications.md` — "Stage rail" paragraph only
- `docs/spec/02-request-lifecycle.md` — "Request fields", urgency rules, T1–T10, "Copy to new request"
- `docs/spec/04-catalog.md` — "Recent items", "From «أخرى» to the catalog"
- `docs/DESIGN_SYSTEM.md` — §6 E, §6 I, §12, §14

## Build
1. **«طلب جديد» sheet:** site chips (skipped with one site), category tiles with icons → creates the draft → opens the picker.
2. **Picker:** the P05 Explorer in pick mode at `/requests/:id/add/node/:nodeId`, «استخدمته مؤخرًا» strip at the category root, sticky basket bar («السلة: N بنود» + «مراجعة»).
3. **Item sheet** (tap-then-quantify): carousel, attributes, specs pre-filled from attribute values and editable, decimal quantity stepper, unit (default from the item), «أضف للطلب». Adding the same item again offers to increase the quantity instead.
4. **«أخرى» sheet:** name, specs, quantity, unit; records the current folder.
5. **Review screen:** items with specs next to the name, quantity and unit editable, remove; urgency chips; «الوحدة / العميل»; collapsed note; «إرسال للمدير» with the blocking reason under it when disabled. Autosave (1.5 s debounce) with a small «اتحفظ» / «بيتحفظ…» marker; retry on failure with a visible message.
6. **Request page:** header (number, site, category, creator, urgency badge, «معدّل», stage chip with per-state counts), **stage rail** exactly as spec 05, tabs (البنود, السجل الزمني as a simple chronological list for now — P14 replaces it), sticky action bar driven by `availableActions` from the DTO.
7. **Actions in this phase:** submit/resubmit, delete draft (confirm), creator edit while awaiting/returned (edit mode on the items tab), manager approve, reject (reason sheet; consequence-named button «رفض الطلب نهائيًا»), return for edit (note sheet), raise urgency (sheet showing only higher levels), manager quantity edit mode. Show the returned note prominently to the creator.
8. **Overflow:** «نسخ لطلب جديد» (opens the new draft). On «أخرى» items, «أضف للكتالوج» for `catalog.create` holders → P05 item editor pre-filled → links on save.
9. **Requests list** (`/requests`): filters (stage, site, category, urgency, search by number), rows as in spec 05 "Home" rows, pagination. «طلب جديد» action.
10. **Conflict handling:** on 409, toast the message and refetch.

## Tests
- Full new-request flow against a mocked API: category → folder → item sheet → basket → review → submit.
- «أخرى» captures the folder.
- Autosave debounce and failure message.
- Action bar shows exactly what `availableActions` returns; reasons required.
- Stage rail renders current/completed/future and RETURNED marker.
- Urgency sheet hides lower levels after a lock.

## Not in this phase
Purchasing tab (P11), approval/receipt (P13), full timeline design (P14).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] On a 360 px phone viewport an engineer can create and submit a 5-item request in under a minute
- [ ] `docs/PROGRESS.md` P09 section
- [ ] Commit `P09: request UI`
