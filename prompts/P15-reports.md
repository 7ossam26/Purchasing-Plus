# P15 — Reports and records

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p15-reports`
- **Depends on:** P14

Paste everything below the line into a new Codex thread.

---

Phase P15 of Purchasing+: the reports hub, seven reports, three record logs, and Excel export. The pattern follows the reference ERP-V2: a hub of large tiles, report pages with filters, headline numbers, a chart and tables. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/06-reports-import-export.md` — "Shared report rules", "Reports", "السجلات"
- `docs/spec/01-access-control.md` — the reports keys
- `docs/spec/07-ui-design.md` — "Tokens", "Don'ts"
- `docs/DESIGN_SYSTEM.md` — §6 A (report hub tiles), §6 C, §18

## Build
1. **Shared:** Cairo period presets (اليوم، آخر 7 أيام، الشهر ده، الشهر اللي فات، مخصص) → UTC ranges, tested across month ends and DST.
2. **API** (`/api/v1/reports/*`, one key each): the seven reports from spec 06 with SQL aggregations (Prisma `groupBy` or parameterized `Prisma.sql`), scope filtering, redaction of price and supplier columns, delivery fees always separate. Each response includes the period actually used and a `measures` description.
3. **Records API** (`records.view`): requests log, receipts log, approvals log with filters and pagination.
4. **Export** (`reports.export`): `?format=xlsx` on each report's main table and each record log, using `exceljs`, Arabic headers, RTL sheet view, money as numbers with 2-decimal format, exactly the filtered rows.
5. **Web:** reports hub (large tiles with a one-line purpose, gated per key), report pages (filter bar with presets, site and category; KPI tiles that state their time domain; one Chart.js chart styled with the tokens — `ppr` for the main series, `concrete` for comparison, no gradients; the table under it; «تصدير Excel»), record pages (§6 B read-only with filter strip and export). Empty state when the period has no data.

## Tests
- Each report's numbers on a seeded fixture: spend excludes rejected/cancelled and delivery fees; re-pricings dated by re-price; win rate = won ÷ asked; stage durations from events; scope limits rows; redaction hides columns.
- Period presets.
- Export produces the filtered rows with the right headers.
- Hub tiles appear only with their keys.

## Not in this phase
Master-data import/export (P16).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] Each report states what it measures and over which dates
- [ ] `docs/PROGRESS.md` P15 section
- [ ] Commit `P15: reports and records`
