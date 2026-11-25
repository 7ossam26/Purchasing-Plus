# 05 — Timeline, notifications, home inbox

The timeline is the most important screen to the client after the request itself. Treat its UI and UX as a headline feature, not a log dump.

## Event model

`RequestEvent`: `id`, `requestId`, `type`, `actorId` (null for system), `actorName` and `actorRoleName` (snapshots at the time), `at` (UTC), `itemIds[]`, `payload` (JSON, typed per event in `packages/shared/src/events.ts` with Zod), `stageAfter` (displayed stage after the event). Events are append-only.

| Type | Payload highlights |
|---|---|
| `CREATED`, `SUBMITTED`, `RESUBMITTED` | — |
| `EDITED` | per-field and per-item diff: `{ field, before, after }`, items added/removed |
| `URGENCY_CHANGED` | from, to, locked |
| `MANAGER_APPROVED`, `MANAGER_REJECTED`, `RETURNED_FOR_EDIT` | reason / note |
| `PAUSED`, `RESUMED`, `PURCHASING_RETURNED` | reason |
| `BATCH_CREATED` | batch id, item line numbers, supplier ids |
| `BATCH_SENT_MARKED` | batch id, supplier id |
| `ITEM_UNAVAILABLE`, `ITEM_AVAILABLE_AGAIN` | line number, note |
| `PRICING_SENT_FOR_RECEIPT` | round number, items with supplier + line total, round total, delivery fee |
| `PRICING_RELEASED` | round numbers released to receipt by the one-time migration (system actor) |
| `PRICING_SUBMITTED` | history only: a round sent for the removed approval; same payload as above |
| `DELIVERY_FEE_CHANGED` | before, after |
| `PRICING_APPROVED`, `PRICING_REJECTED` | history only: round number, reason |
| `SUPPLY_ORDER_SENT_MARKED` | supplier id, line numbers |
| `RECEIPT_RECORDED` | lines with quantities, note |
| `ITEM_STILL_COMING`, `ITEM_REPRICED` | line, new supplier + amount |
| `ITEM_RESOLVED_EXTERNALLY` | line, note |
| `ADDED_TO_CATALOG` | line, catalog item code |
| `COPIED_TO`, `COPIED_FROM` | other request number |
| `CANCELLED` | reason |
| `COMPLETED`, `REJECTED_AUTO` | — |

Pricing drafts and autosaves are **not** events (too noisy). Their result appears in `PRICING_SENT_FOR_RECEIPT`.

**Redaction (AC-7).** The timeline endpoint requires `requests.viewTimeline`. Amounts are removed from payloads without `requests.viewPrices`; supplier names without `requests.viewSupplierNames` (shown as «مورد»).

## Timeline UI

### Stage rail

Always visible at the top of the request page. A horizontal 6-segment rail: مسودة → بانتظار موافقة المدير → عند المشتريات → بانتظار الاستلام → بنود متبقية → مكتمل. A request rejected at the former pricing approval ends at «عند المشتريات». Completed segments are filled with the accent green, the current one is black with its name and «من يومين» under it, future ones are outlined. RETURNED and PAUSED appear as a notch marker on the current segment with its label. REJECTED and CANCELLED cut the rail with a danger-tone end cap. On phones the rail shows segments without labels plus the current stage name; tapping it scrolls to that stage in the timeline.

### Timeline body

Tab «السجل الزمني».

- Events grouped by stage. Each group header: stage name, who held it («عند: مسؤول المشتريات»), and how long it took («استغرقت يوم و4 ساعات»).
- **Time is visible as space.** Between consecutive groups, the vertical gap grows with the elapsed time on a compressed scale (e.g. 8 px for < 1 hour up to 64 px for ≥ 7 days), with the duration printed in the gap. Long waits are obvious at a glance without reading timestamps.
- Each event row: initials disc, actor name, role, one plain sentence in the past tense («وافق على الطلب», «علّم البند 3 غير متوفر»), absolute time («الأحد 17 نوفمبر، 3:20 م») and relative time («من ساعتين») on a second line. Times in Africa/Cairo.
- **Diffs** render inline: changed field, old value struck through in muted tone, new value in the accent wash; added items marked with a green bar, removed with a danger bar.
- Price-request batches render as one event «طلب أسعار من 3 موردين» that expands to the suppliers (with sent marks and times) and item line numbers.
- Approvals, rejections and «اتحل من المهندس» show the actor's name and role in bold. These are the "who did it" moments the client asked to see clearly.
- Filter chips at the top: الكل، تغييرات الحالة، التعديلات، المشتريات، الاستلام.
- Semantics: an ordered list, `<time datetime>`, focusable rows, no motion beyond the expand/collapse of a group. Respects `prefers-reduced-motion`.
- States: loading skeleton of 3 rows, empty («لسه مفيش أحداث»), error with retry.

## Notifications

Keep them quiet and useful. No sound, no browser push, no per-role settings.

- In-app only: a bell in the top bar with an unread count and a dropdown list (newest first, 30 per page), «تعليم الكل كمقروء». Clicking one opens the request.
- **Recipients = the people who can take the next action** (permission + site scope), plus the creator for outcomes. Never the actor. Never superadmins.

| Event | Notify |
|---|---|
| SUBMITTED, RESUBMITTED | `requests.approve` holders |
| MANAGER_APPROVED, RESUMED | `purchasing.price` holders |
| MANAGER_REJECTED, RETURNED_FOR_EDIT, PURCHASING_RETURNED | creator |
| PRICING_SENT_FOR_RECEIPT, PRICING_RELEASED | creator (the site engineer), `receipt.record` holders, `purchasing.sendSupplyOrder` holders |
| RECEIPT_RECORDED that creates REMAINING | `purchasing.handleRemaining` holders |
| Urgency raised | none (badge only) |

- Delivered live over Server-Sent Events: one stream per session, short-lived single-use ticket to open it (as in ERP-V2), `Last-Event-ID` replay, 25 s heartbeat. The same stream pushes "request changed" signals so open lists, queues, badges and the request page refresh in place.
- In-memory event bus behind an interface (single instance); Redis can be added later without touching callers.
- Notifications older than 90 days are purged daily.

## Home: «محتاج مني»

The home page for every user is their inbox, then the module tiles.

- Top: the queues from `02-request-lifecycle.md` that apply to this user, as status tabs with counts (DESIGN_SYSTEM §3.3). Default tab = the first non-empty queue.
- Each row: request number, site, category, urgency badge, «معدّل» / «متأخر» badges, stage chip with per-state counts, time in stage, creator.
- A prominent «طلب جديد» action for users with `requests.create`.
- Below: hub tiles from the module registry (only permitted ones).
- Empty state: «مفيش حاجة مستنياك دلوقتي.» plus the relevant next action if any.

## Audit log (superadmin)

Separate from the timeline. Every mutating API call writes an append-only `AuditLog` row (action, entity, entity id, actor, IP, old/new values with secrets redacted, HMAC-SHA256 over the identity fields, as in ERP-V2 `utils/auditLogger.js`). Logins, failed logins and lockouts too. The viewer is superadmin-only (`system.auditLog`): filters by date, user, entity, action; detail drawer with old/new values side by side; an integrity check that recomputes the HMAC per row.
