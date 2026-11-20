# P16 — Import and export of master data

- **Model:** GPT-6 Luna (`gpt-6-luna`)
- **Reasoning:** High
- **Branch:** `p16-import-export`
- **Depends on:** P15

Paste everything below the line into a new Codex thread.

---

Phase P16 of Purchasing+: Excel/CSV import with a validate-first preview, and export in the same layout so files can round-trip. Reuse existing services and shared validators; don't duplicate business rules. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/06-reports-import-export.md` — "Import and export"
- `docs/spec/03-purchasing.md` — "Suppliers and WhatsApp numbers"
- `docs/spec/04-catalog.md` — "Catalog tree", "Attributes", "Catalog items"
- `docs/DESIGN_SYSTEM.md` — §6 K
- `docs/spec/09-assumptions.md` — A-13, A-19

## Build
1. **Entity definitions** (one module per entity: units, sites, attributes, catalog tree, catalog items, suppliers): columns (Arabic header row + key row), parser per column, validator (reusing the shared phone and normalization helpers and the P04 services' rules), matcher (items by code; nodes by full path; others by name).
2. **API** (`/api/v1/data/*`): `GET /templates/:entity` (xlsx with headers and one example row), `POST /import/:entity/preview` (multipart, ≤ 10 MB, xlsx or csv; returns counts to create/update and every error with row, column, message and fix), `POST /import/:entity/commit` (re-validates; imports only with zero errors; one transaction; audit row with counts), `GET /export/:entity` (same layout). Keys: `data.import`, `data.export`.
3. **Catalog paths:** `كهربا > مفاتيح وبرايز > سلسلة X` creates missing groups under an existing category; an unknown category is an error. Items: blank code → generated; attribute pairs `خاصية 1`/`قيمة 1` … `خاصية 15`/`قيمة 15` validated by attribute type.
4. **Web page** (admin console, §6 K): «إزاي تشتغل» in three numbered steps, a tab per entity, template download, drop zone, preview with an errors table (row, column, message) and the create/update counts, «استيراد» enabled only with zero errors, export button per entity.

## Tests
- Round trip per entity: export → import preview shows only updates, no errors.
- Errors reported with correct row and column (bad phone, unknown unit, unknown category path, wrong attribute type, duplicate name in file).
- Commit is all-or-nothing (a forced failure mid-way leaves the DB unchanged).
- CSV and xlsx both work; oversize and wrong type rejected.
- Permissions.

## Not in this phase
Users import (never), images import (never).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P16 section
- [ ] Commit `P16: import and export`
