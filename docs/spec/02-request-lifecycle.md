# 02 — Request lifecycle

All transition rules live in one pure module, `packages/shared/src/lifecycle/`, used by both the API (to enforce) and the web app (to decide which actions to show). Every rule below gets a Vitest case.

## Request fields

| Field | Notes |
|---|---|
| `number` | `PR-YYYY-NNNNN`, assigned on **first submit**. Year from Cairo time. Per-year sequence, gap-free under concurrency (row-locked sequence table). Drafts show «مسودة» instead |
| `siteId` | One of the creator's sites. Auto-filled and shown read-only when the creator has exactly one |
| `categoryId` | A top-level catalog node. One category per request, chosen first |
| `createdById` | The engineer |
| `urgency` | `NORMAL` «عادي» (default), `URGENT` «عاجل», `VERY_URGENT` «عاجل جدًا» |
| `urgencyLocked` | Set when a manager raises urgency |
| `unitOrClient` | Optional free text «الوحدة / العميل» |
| `note` | Optional free text for the whole request |
| `status` | See below |
| `isModified` | Set when the request was edited after its first submit. Shown as a «معدّل» badge |
| `deliveryFee` | One per request, optional, entered by purchasing. Never added to the total |
| `pausedById`, `pausedAt`, `pauseReason` | While paused |
| `copiedFromId` | When created with «نسخ لطلب جديد» |
| `version` | Optimistic concurrency. Every mutation sends it; a mismatch returns 409 «الطلب اتغير من مستخدم تاني. حدّث الصفحة.» (first action wins) |

## Request item fields

`lineNo` (1..n; renumbered freely while DRAFT, stable after the first submit, new lines appended), `catalogItemId` (null for «أخرى»), `nodeId` (the group it was picked from, also for «أخرى»), `snapshot` (code, name, unit name, attribute values, node path, cover image key — frozen at submit and on every later edit), `specs` (free text, shown next to the name everywhere), `quantity` (decimal, up to 2 places, > 0), `unitId`, `isOther`, `otherName`, `state`, `receivedQty`, pricing fields (`supplierId`, `lineTotal`, `unavailableNote`), flags `needsRepricing`, `modifiedAfterSend`.

When adding from the catalog, `specs` is pre-filled from the item's attribute values (e.g. «أسود مط، موديل H15») and stays editable.

## Request statuses (stored)

| Status | Arabic | Who holds it |
|---|---|---|
| `DRAFT` | مسودة | Creator |
| `AWAITING_MANAGER` | بانتظار موافقة المدير | Site manager (visible to everyone in scope) |
| `RETURNED` | مُعاد للتعديل | Creator |
| `AT_PURCHASING` | عند المشتريات | Purchasing |
| `PAUSED` | موقوف مؤقتًا | Engineer / manager, for editing |
| `FULFILMENT` | (derived, see below) | Depends on item states |
| `COMPLETED` | مكتمل | — |
| `REJECTED` | مرفوض | — (final) |
| `CANCELLED` | ملغي | — (final) |

### Displayed stage during `FULFILMENT`

`deriveStage(items)` in the shared package. Precedence, first match wins:

1. Any item `AWAITING_APPROVAL` → «بانتظار اعتماد التسعير»
2. Any item `AWAITING_RECEIPT` → «بانتظار الاستلام»
3. Any item `UNAVAILABLE` or `REMAINING` → «بنود متبقية»

Every list row, card and detail header also shows per-state counts when more than one state is open, e.g. «8 بانتظار الاستلام» and «2 عند المشتريات» as separate small chips.

The 7-step stage rail (05-timeline) uses: مسودة → بانتظار موافقة المدير → عند المشتريات → بانتظار اعتماد التسعير → بانتظار الاستلام → بنود متبقية → مكتمل. `RETURNED` and `PAUSED` are shown as markers on the rail; `REJECTED` and `CANCELLED` end it.

## Item states

| State | Meaning | Closed? |
|---|---|---|
| `OPEN` | Not yet priced (pricing draft fields may be filled) | no |
| `UNAVAILABLE` | Officer marked it «غير متوفر»; stays with purchasing | no |
| `AWAITING_APPROVAL` | In a submitted pricing round | no |
| `AWAITING_RECEIPT` | Approved (or re-priced / still coming); waiting on site | no |
| `REMAINING` | Part received; the rest is back with purchasing | no |
| `RECEIVED` | Fully received | yes |
| `RESOLVED_EXTERNALLY` | «اتحل من المهندس» — handled outside the system | yes |
| `REJECTED` | Its pricing round was rejected | yes |
| `CANCELLED` | Request cancelled | yes |
| `REMOVED` | Deleted during an edit (kept for history, hidden from lists) | yes |

## Transitions

Each row: who (permission + scope), from → to, required input, side effects. Every transition writes a timeline event (05) and an audit entry.

### Before purchasing

| # | Action | Permission | From → To | Input | Notes |
|---|---|---|---|---|---|
| T1 | Save draft | `requests.create` (creator) | — → DRAFT | — | Autosaves 1.5 s after the last change |
| T2 | Delete draft | creator | DRAFT → (deleted) | confirm | Hard delete; drafts have no number |
| T3 | Submit | creator | DRAFT → AWAITING_MANAGER | ≥1 item | Assigns number. Notifies approvers |
| T4 | Edit before approval | creator | AWAITING_MANAGER or RETURNED → same | diff | Sets `isModified`. Items, specs, quantities, urgency (if not locked), unit/client, note |
| T5 | Edit quantities | `requests.editQuantities` | AWAITING_MANAGER → same | diff | Quantities only |
| T6 | Approve | `requests.approve` | AWAITING_MANAGER → AT_PURCHASING | — | Records approver. Notifies purchasing |
| T7 | Reject | `requests.reject` | AWAITING_MANAGER → REJECTED | reason (required) | Final. Notifies creator |
| T8 | Return for edit | `requests.returnForEdit` | AWAITING_MANAGER → RETURNED | note (required) | Notifies creator |
| T9 | Resubmit | creator | RETURNED → AWAITING_MANAGER | — | Sets `isModified`. Notifies approvers |
| T10 | Raise urgency | `requests.raiseUrgency` | any open status → same | new level > current | Sets `urgencyLocked`. Badge only, no notification |

The creator may change urgency in DRAFT, AWAITING_MANAGER and RETURNED while `urgencyLocked` is false. Once locked, nobody can lower it; a manager can still raise it further.

### At purchasing

| # | Action | Permission | From → To | Input | Notes |
|---|---|---|---|---|---|
| T11 | Pause | `requests.pause` | AT_PURCHASING → PAUSED | reason (required) | Leaves the purchasing queue |
| T12 | Return for edit (purchasing) | `purchasing.returnForEdit` | AT_PURCHASING → PAUSED | reason (required) | Same as pause, plus notifies the creator |
| T13 | Edit while paused | `requests.editWhilePaused` | PAUSED → same | diff | Anyone holding it, whoever paused. Add, remove or edit items, specs, quantities. Edited items with a pricing draft: clear it and set `needsRepricing` («اتعدل – محتاج إعادة تسعير»). Edited items that were in a sent batch: set `modifiedAfterSend` («اتعدل بعد الإرسال»). Sets `isModified` |
| T14 | Resume | `requests.pause` | PAUSED → AT_PURCHASING | — | Notifies purchasing |
| T15 | Batches, pricing, unavailable, delivery fee | see 03 | AT_PURCHASING → same | | |
| T16 | Submit pricing | `purchasing.price` | AT_PURCHASING → FULFILMENT | ≥1 priced item | Creates pricing round 1. Priced items → AWAITING_APPROVAL; unavailable stay UNAVAILABLE. Notifies `pricing.approve` holders |

Pausing is only possible in AT_PURCHASING. No item edits are possible in FULFILMENT.

### Fulfilment

| # | Action | Permission | Effect |
|---|---|---|---|
| T17 | Approve pricing round | `pricing.approve` | Round items → AWAITING_RECEIPT. Records who approved, shown prominently. For each catalog item, append a price record (unit price = lineTotal ÷ quantity) — this becomes the catalog's latest purchase price. Creates supply orders (03). Notifies the creator, `receipt.record` holders and `purchasing.sendSupplyOrder` holders |
| T18 | Reject pricing round | `pricing.reject` | Reason required. Round items → REJECTED. If this was round 1 and no item was ever approved, the request → REJECTED (final). Otherwise the request continues. Notifies the creator. «نسخ لطلب جديد» is offered for the rejected items |
| T19 | Price a previously unavailable item | `purchasing.price` | Item → OPEN with pricing; submitting creates a new round → AWAITING_APPROVAL (needs approval) |
| T20 | Record receipt | `receipt.record` | Quantity > 0 and ≤ outstanding, optional note, several receipts allowed. If outstanding reaches 0 → RECEIVED. If a receipt leaves some outstanding → REMAINING (back with purchasing). Notifies `purchasing.handleRemaining` holders |
| T21 | «لسه جاي من نفس المورد» | `purchasing.handleRemaining` | REMAINING → AWAITING_RECEIPT. Same supplier and price, no approval, no new supply order |
| T22 | Re-price remaining | `purchasing.handleRemaining` | New supplier and line total for the outstanding quantity → AWAITING_RECEIPT. **No approval.** Appends a catalog price record. Creates a supply order if the supplier changed |
| T23 | Resolve externally | `items.resolveExternally` | UNAVAILABLE or REMAINING → RESOLVED_EXTERNALLY. Optional note. The timeline names who did it and their role |
| T24 | Cancel at any stage | `requests.cancelAnyStage` | Any non-final status except DRAFT → CANCELLED. Reason required. Open items → CANCELLED; received quantities stay recorded |
| T25 | Auto-complete | system | When every item is closed and at least one is RECEIVED or RESOLVED_EXTERNALLY → COMPLETED. If every item is REJECTED → REJECTED |
| T26 | Delivery fee edit | `purchasing.price` | Any time until COMPLETED. Logged on the timeline |

If every item becomes RESOLVED_EXTERNALLY while still AT_PURCHASING (nothing ever priced), the request → COMPLETED.

### Copy to new request

`«نسخ لطلب جديد»` is available on every request to users with `requests.create` whose scope includes a site they can pick. It creates a new DRAFT owned by the current user with: site (if still in scope), category, unit/client, and every non-REMOVED item (or only the rejected items when started from a rejected round). Catalog items are re-snapshotted from the current catalog; inactive catalog items become «أخرى» with the old name. Urgency resets to عادي. Both requests get a timeline event linking each other.

## Queues ("needs my action")

A request appears in a user's queue when they can act on it now (permission + scope):

| Queue | Condition |
|---|---|
| مسوداتي | DRAFT or RETURNED, created by me |
| بانتظار موافقتي | AWAITING_MANAGER and I hold `requests.approve` |
| عند المشتريات | AT_PURCHASING, or FULFILMENT with UNAVAILABLE/REMAINING items, or approved items whose supply order isn't marked sent — and I hold the matching purchasing key |
| بانتظار اعتمادي | FULFILMENT with AWAITING_APPROVAL items and I hold `pricing.approve` |
| بانتظار الاستلام | FULFILMENT with AWAITING_RECEIPT items and I hold `receipt.record` |
| موقوفة | PAUSED and I hold `requests.editWhilePaused` |

Sort: urgency (high first), then time in current stage (oldest first).

## Aging («متأخر»)

`settings.agingDays` (default 3). A request is «متأخر» when its current displayed stage started more than N full Cairo days ago. Stage start = the timestamp of the event that moved it into that displayed stage. Not shown for final statuses.
