# 09 — Assumptions and open decisions

Where the answers didn't settle something, the spec takes the position below. Change any of them **before** the phase listed; after that phase, a change means rework.

## Open (needs your decision)

| # | Decision | Needed before | Current handling |
|---|---|---|---|
| O-1 | R2 bucket public (custom domain) or private (presigned URLs) | P17 | Storage adapter supports both; development uses local disk |

## Assumptions

| # | Assumption | Phase it lands in |
|---|---|---|
| A-1 | A request's extra fields are urgency (required, default عادي), «الوحدة / العميل» (optional) and a note (optional). No needed-by date | P07 |
| A-2 | The request number is assigned on first submit, so deleted drafts don't burn numbers | P07 |
| A-3 | Quantities: the creator edits freely until the manager approves; the manager edits them at the approval stage (`requests.editQuantities`); while paused, anyone with `requests.editWhilePaused` edits everything including quantities; purchasing never edits quantities | P07, P09 |
| A-4 | Pause and every «إرجاع للتعديل» require a reason. The officer's «إرجاع للتعديل» pauses the request and notifies the creator; resuming needs `requests.pause` | P09 |
| A-5 | Rejecting a later pricing round (items that were unavailable at first) rejects only those items and the request continues. Rejecting round 1 with nothing ever approved makes the whole request «مرفوض» | P11 |
| A-6 | During fulfilment the displayed stage uses the precedence receipt → remaining (approval only for unmigrated history), with per-state counts beside it | P07, 2026-11-25 |
| A-7 | Supply orders are created per supplier when pricing is submitted; the default message includes the site name and address; they never block receipt | P11, 2026-11-25 |
| A-8 | Submitting pricing also notifies `purchasing.sendSupplyOrder` holders so supply orders go out | P13, 2026-11-25 |
| A-9 | Items and groups can only move within their own category | P04 |
| A-10 | «عرض للعميل» hides prices, codes, suppliers and internal notes | P06 |
| A-11 | «اتحل من المهندس» applies to unavailable and remaining items only | P11 |
| A-12 | If every item is resolved externally before anything is priced, the request completes | P11 |
| A-13 | Import validates the whole file first and imports all-or-nothing | P15 |
| A-14 | Catalog search normalizes Arabic letter variants and diacritics | P04 |
| A-15 | One Docker image serves API and web, one replica | P17 |
| A-16 | DB sessions in an httpOnly cookie, argon2id, lockout after 5 failures for 15 minutes | P01 |
| A-17 | «متأخر» uses one threshold for all stages, default 3 days, editable in Settings | P13 |
| A-18 | Sample roles, the five categories and starter units are seeded once on first boot and are ordinary editable data afterwards | P01, P04 |
| A-19 | `exceljs` instead of the npm `xlsx` package | P14, P15 |
| A-20 | Notifications are kept 90 days | P13 |
| A-21 | Superadmins have no role, are hidden from other users, and appear as «الدعم الفني» in history | P01 |
| A-22 | The pricing history shows each item's last catalog price and the change, frozen at submission (small UX addition) | P12, 2026-11-25 |
| A-23 | When an RFQ message is too long for a reliable WhatsApp link (> 4,000 encoded characters), the UI pushes «نسخ الرسالة» instead | P10 |
| A-24 | Engineers browse the catalog with `catalog.view` alone; التكويدات itself needs `masterData.view` | P01, P05 |
| A-25 | «أضف للكتالوج» needs `catalog.create` (which itself needs access to التكويدات). A role that can only *view* التكويدات can't add items to the catalog | P08 |
| A-26 | The Sites record manager is built in P03 (so users can be assigned sites right away); P05 links it from the التكويدات hub | P03 |
