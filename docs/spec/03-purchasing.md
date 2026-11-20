# 03 — Purchasing: price requests, pricing, supply orders, receipt

The purchasing officer works on a **phone**. Every screen here is designed for one thumb first, then widened for desktop.

## Suppliers and WhatsApp numbers

- Fields: name (required), contact person, WhatsApp number (required, exactly one), categories (one or more top-level nodes), active, notes.
- **Egyptian mobile numbers only.** Accept input with spaces, dashes, `+20`, `0020`, `20` or a leading `0`. Valid = `01` + one of `0, 1, 2, 5` + 8 digits. Store as 12 digits `201XXXXXXXXX`. Display as `0101 234 5678`. Reject anything else with «اكتب رقم موبايل مصري، مثال: 01012345678». Unique across suppliers.
- Normalization and validation is one shared function with exhaustive tests (valid prefixes, each accepted input shape, landlines, too short/long, letters, duplicates).
- A supplier only belongs to categories (top level), never to groups.

## Price-request batches (دفعات طلب الأسعار)

The officer handles the request in rounds of their own choosing: pick some items, pick suppliers for them, send, come back, pick more items, and so on.

**Flow on the request page (tab «المشتريات»):**

1. **Items list.** Every non-removed, non-closed item with a checkbox, «تحديد الكل», line number, name, specs, quantity, unit. Items already sent show a chip «اتبعت لـ 3 موردين» (tap to see which suppliers and when). Items with `modifiedAfterSend` show «اتعدل بعد الإرسال». Used items can be selected again.
2. **«اختار الموردين»** (bottom sheet). Active suppliers of the request's category, with «تحديد الكل». Each row: name, phone, how many of the selected items were already sent to them.
3. **«الرسالة».** One editable textarea for the batch, pre-filled with `settings.rfqIntro` followed by one line per item: `{lineNo}) {name} – {specs} – {quantity} {unit}` (omit `– {specs}` when empty). The officer can rewrite it freely.
4. **«إرسال».** One row per supplier: name, phone, **«افتح واتساب»**, **«نسخ الرسالة»**, **«تم الإرسال»**. Expanding a row allows a per-supplier tweak of the text. «افتح واتساب» opens `https://wa.me/{digits}?text={encodeURIComponent(text)}`, which opens the WhatsApp app on the phone. «تم الإرسال» is the officer's manual confirmation, recorded with time and user. If the encoded URL exceeds 4,000 characters, show «الرسالة طويلة. انسخها والصقها في واتساب.» and keep the copy button prominent.
5. Back to the items list; chips update.

Batches are optional: the officer may price items without sending anything. Nothing is ever sent automatically.

Default `settings.rfqIntro`: «السلام عليكم، ممكن سعر للآتي؟ (طلب {requestNumber})». Placeholders: `{requestNumber}`, `{siteName}`, `{categoryName}`. No images, codes or prices go to suppliers.

## Pricing (تسعير)

- Per item: **supplier** (picker lists the category's suppliers; a «كل الموردين» toggle searches all active suppliers) and **line total** — the final amount for the whole quantity, VAT included. The officer never types a unit price. The UI shows the derived unit price under it in muted text («= 125.00 للوحدة»).
- Only the chosen supplier and amount are recorded. Other quotes stay in WhatsApp.
- «غير متوفر» toggle per item with an optional note. Unavailable items stay with purchasing until priced (→ new approval round) or resolved externally.
- **Delivery fee** (رسوم التوصيل): one optional amount per request, entered at the end, in its own field next to the submit button. Displayed everywhere as a separate line under the total with the note «منفصلة عن الإجمالي». Never added to any total, including reports.
- Pricing drafts autosave per item. The request total = sum of line totals of priced items.
- **«إرسال للاعتماد»** requires at least one priced item. A confirmation sheet shows: priced count, unavailable count, total, delivery fee, items still `needsRepricing` (blocking until priced or marked unavailable).
- Money: `Decimal(14,2)` in the database, decimal strings in JSON, `decimal.js` for arithmetic. Unit price = lineTotal ÷ quantity, rounded half-up to 2 places for display and for the catalog price record.

## Pricing approval (اعتماد التسعير)

The approver sees the round: each item with supplier, line total, derived unit price, the round total, the delivery fee (separate), previously approved rounds (collapsed), and the item's last catalog price with the difference (▲/▼ and percentage) when there is one. Buttons: «اعتماد التسعير» (`pricing.approve`), «رفض التسعير» (`pricing.reject`, reason required). The request header then shows «اعتمد بواسطة {name} ({role}) — {date}».

## Supply orders (أوامر التوريد)

- Created automatically when a round is approved (one per supplier, with that supplier's approved items) and when remaining items are re-priced to a different supplier.
- Same send pattern as batches: editable message, «افتح واتساب», «نسخ الرسالة», «تم الإرسال».
- Default `settings.supplyOrderIntro`: «السلام عليكم، تم اعتماد طلب {requestNumber}. برجاء توريد الآتي إلى موقع {siteName} – {siteAddress}:» followed by `{lineNo}) {name} – {specs} – {quantity} {unit}` lines.
- Sending a supply order never blocks receipt.

## Receipt (الاستلام)

- The engineer opens the request; tab «الاستلام» lists items AWAITING_RECEIPT with outstanding quantity.
- Per item: **«استلمت الكمية كلها»** (one tap) or a quantity field (0 < q ≤ outstanding) with an optional note. A sticky «تسجيل الاستلام» button saves all entered lines at once.
- A receipt that leaves some quantity outstanding moves the item to REMAINING and back to purchasing (T20). No photos in v1.

## Remaining items (البنود المتبقية)

For each REMAINING item the officer chooses one of:
1. **«لسه جاي من نفس المورد»** → AWAITING_RECEIPT (no approval, no new supply order).
2. **«إعادة تسعير»** → new supplier and line total for the outstanding quantity → AWAITING_RECEIPT (no approval). Creates a supply order if the supplier changed. Updates the catalog's latest price.
3. **«اتحل من المهندس»** → RESOLVED_EXTERNALLY.

The engineer can also mark REMAINING or UNAVAILABLE items «اتحل من المهندس». The timeline and the item row always say who did it and in which role.

## «أخرى» items

Items not in the catalog are added as «أخرى» with a name, specs, quantity and unit, remembering the group they were added from. They flow through purchasing exactly like catalog items. On the request page, users with `catalog.create` see «أضف للكتالوج» on such items (04).
