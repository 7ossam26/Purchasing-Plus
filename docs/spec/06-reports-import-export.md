# 06 — Reports, records, import and export

Pattern taken from ERP-V2: a reports hub with large tiles leads to individual reports (DESIGN_SYSTEM §6 C) and to «السجلات», read-only history lists (§6 B in read-only mode). Each tile and report needs its own permission (01).

## Shared report rules

- **Filters:** period presets (اليوم، آخر 7 أيام، الشهر ده، الشهر اللي فات، مخصص) computed in Africa/Cairo; site (limited to the user's scope, «كل المواقع» only for ALL scope); category. Default period: الشهر ده.
- Each report states in its header what it measures and over which dates (P8, §18). Each KPI states its time domain («خلال الفترة» or «حاليًا»).
- Data is always limited to the user's site scope. Price columns need `requests.viewPrices`; supplier columns need `requests.viewSupplierNames` (hidden, not blank).
- **Delivery fees are never added to spend.** Where spend appears, delivery fees appear as their own column.
- «تصدير Excel» (with `reports.export`) exports exactly the filtered rows of the report's main table.
- Charts: one charting library (Chart.js via `react-chartjs-2`, as in ERP-V2), styled with the design tokens. Every chart also has its table.
- Aggregations run in SQL (Prisma `groupBy` or `$queryRaw` with parameters), never by loading rows into Node.

## Reports

1. **نظرة عامة على الطلبات** (`reports.requestsOverview`) — KPIs: requests submitted, completed, rejected, cancelled during the period; open now by displayed stage. Breakdowns by site, category, urgency. Table of requests «متأخر» right now.
2. **زمن المراحل** (`reports.stageTimes`) — average and median time per displayed stage (from timeline events), per site. Table of the 20 slowest requests in the period with the stage that held them longest.
3. **الإنفاق** (`reports.spending`) — committed spend (sum of submitted line totals, dated by submission, or by the decision for rounds approved before 2026-11-25; re-pricings dated by re-price) by site, category, supplier and month; delivery fees in a separate column. Excludes rejected and cancelled items.
4. **الموردين** (`reports.suppliers`) — per supplier: items asked (from batches), items won, win rate = won ÷ asked, submitted amount, supply orders sent.
5. **تاريخ أسعار الأصناف** (`reports.priceHistory`) — pick an item (search by name/code); line chart of unit price over time with supplier per point; table of all price records.
6. **البنود غير المتوفرة والمحلولة خارجيًا** (`reports.unavailable`) — items marked unavailable or resolved externally in the period, by category and site, with who resolved them and their role.
7. **نشاط المستخدمين** (`reports.userActivity`) — per user: requests created, edits after submit, manager decisions, pricing rounds submitted, pricing decisions, receipts recorded.

## السجلات (`records.view`)

Read-only record managers with filter strips:
- **سجل الطلبات:** number, site, category, creator, urgency, displayed stage, created/submitted dates, total (if permitted). Filters: number search, status/stage, site, category, urgency, creator, date range. Opens the request.
- **سجل الاستلام:** every receipt line: date, request, item, quantity, recorded by.
- **سجل الاعتمادات:** every pricing decision: date, request, round, approver/rejector and role, round total (if permitted).

## Import and export (archetype K) — `data.import` / `data.export`

Entities and file layout (first row Arabic headers, second row machine keys, as in ERP-V2 `routes/dataImport.js`):

| Entity | Columns |
|---|---|
| الوحدات | name, active |
| المواقع | name, address, active |
| الخصائص | name, type (`نص`/`رقم`/`اختيار`), unit label, options (separated by `،`), active |
| الفئات والمجموعات | path (`كهربا > مفاتيح وبرايز > سلسلة X`), code prefix (categories only), active |
| الأصناف | code (blank = generate), name, path, unit, description, active, then repeating pairs `خاصية 1`/`قيمة 1` … `خاصية 15`/`قيمة 15` |
| الموردين | name, contact person, WhatsApp number, categories (separated by `،`), active, notes |

Rules:
- Download a template per entity (headers + one example row).
- Upload `.xlsx` or `.csv`, max 10 MB. **Validate the whole file first** and show a preview: rows to create, rows to update (matched by code for items, by name otherwise, by full path for nodes), and every error with row number, column and fix («الصف 14: رقم الموبايل غير مصري»).
- Import only when there are zero errors, in one transaction (all or nothing).
- Paths create missing groups when the category exists; an unknown category is an error.
- Images are never imported.
- Export produces the same layout, so an export can be edited and re-imported (round trip, tested).
- Library: `exceljs` (don't use the npm `xlsx` package; its npm build is outdated).
- Users are never imported.
