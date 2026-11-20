# P04 — Catalog and master-data API

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p04-catalog-api`
- **Depends on:** P03

Paste everything below the line into a new Codex thread.

---

Phase P04 of Purchasing+: the API behind «التكويدات» — the nested catalog tree, attributes, units, items with generated codes, suppliers with Egyptian WhatsApp numbers, and Arabic search. `AGENTS.md` and `apps/api/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/04-catalog.md` — everything except "Images" and "Item view and presentation mode"
- `docs/spec/03-purchasing.md` — "Suppliers and WhatsApp numbers"
- `docs/spec/01-access-control.md` — the التكويدات keys and the note on `catalog.view`
- `docs/spec/08-architecture.md` — "Data model outline", "API conventions"
- `docs/spec/09-assumptions.md` — A-9, A-14, A-18

## Build
1. **Shared pure helpers** with exhaustive tests: `normalizeEgyptianMobile(input)` → `{ ok, digits }` or an error code (spec 03 rules), `formatEgyptianMobile(digits)`, `normalizeArabic(text)` for search (spec 04 "Search").
2. **Prisma models + migration:** `CatalogNode` (materialized `path`, `depth`, `codePrefix` on categories), `AttributeDefinition`, `AttributeOption`, `NodeAttribute`, `Unit`, `CatalogItem` (with `searchText` + trigram index), `CatalogItemAttributeValue`, `CatalogItemPrice` (table only; written in P12), `CodeSequence`, `Supplier`, `SupplierCategory`.
3. **Tree API** (`catalogTree.*`): list categories; get node with breadcrumb; list children of a node with counts (child groups, items in the whole subtree) and a `coverThumbs` array (empty until P06); create category (name, prefix, icon key) or group; rename; reorder siblings; move within the same category (updates descendants' `path` in one transaction; refuse cross-category); delete only when empty; deactivate/reactivate.
4. **Attributes API** (`attributes.*`): CRUD with type-specific validation, options management; node default attributes (set list on a node) and `GET /nodes/:id/effective-attributes` (inherited top-down + own).
5. **Units API** (`units.*`): CRUD with unique names, deactivate.
6. **Items API** (`catalog.*`; reads need only `catalog.view`): create at any node (code generated `{prefix}-{seq}` with a 4-digit minimum, concurrency-safe), update (attribute values validated per type), move within category, deactivate; get item (with attributes, unit, node path, latest price placeholder); list items directly in a node; **search** within a category across all depths (normalized, trigram, paginated) returning each item's path.
7. **Suppliers API** (`suppliers.*`): CRUD with phone normalization and uniqueness; categories must be top-level nodes; list by category (active only, for purchasing later).
8. **First-boot seed** (idempotent): the five categories with prefixes and icons, starter units (spec 01 "Seed").
9. Audit rows for every mutation.

## Tests
- Phone helper: every accepted input shape, each valid prefix (010/011/012/015), landlines, wrong lengths, letters, duplicates via API.
- Arabic normalization cases (أ/إ/آ, ى, ة, tashkeel, tatweel, spaces).
- Tree: create deep nesting (6+ levels), move updates every descendant path, cross-category move refused, delete non-empty refused, counts correct.
- Effective attributes inheritance.
- Code generation: 50 concurrent creates in one category produce unique sequential codes.
- Search finds by name, code and attribute value at any depth, honouring normalization; scoped to the category.
- Permission and validation tests for every route (403, 422).

## Not in this phase
Any UI (P05), images (P06), prices (P12).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P04 section with the endpoint list
- [ ] Commit `P04: catalog API`
