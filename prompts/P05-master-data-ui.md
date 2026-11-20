# P05 — التكويدات UI and the folder explorer

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p05-master-data-ui`
- **Depends on:** P04

Paste everything below the line into a new Codex thread.

---

Phase P05 of Purchasing+: the master-data screens and the catalog explorer. The explorer must feel like opening folders of material samples: smooth, physical and fast. The client explicitly wants this UX to be excellent and visually distinctive. `AGENTS.md` and `apps/web/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/07-ui-design.md` — "Identity", "Motion", "Catalog explorer — opening folders", "Screens" (master-data rows), "Don'ts"
- `docs/spec/04-catalog.md` — "Catalog tree", "Attributes", "Catalog items", "Search", "Units, sites", "Explorer behaviour"
- `docs/spec/03-purchasing.md` — "Suppliers and WhatsApp numbers"
- `docs/DESIGN_SYSTEM.md` — §6 A, §6 B, §12, §13

## Build
1. **«التكويدات» hub** (§6 A) with tiles for الأصناف، الفئات والمجموعات، الخصائص، الوحدات، الموردين، المواقع, each gated by its `.view` key.
2. **Explorer** (`features/catalog/Explorer`) with a `mode` prop: `"manage"` (التكويدات) and `"pick"` (used by the request flow in P09; expose `onPickItem(item)` and `onAddOther(nodeId)` props now, render the «أخرى» row in pick mode).
   - Route holds the node id (`/catalog/node/:nodeId`), so browser back = up one folder.
   - Sticky breadcrumb bar with collapse to «…» on phones beyond three crumbs.
   - Folders first (phone rows / desktop tiles with the thumbnail-stack slot; thumbnails arrive in P06, so render the letter placeholder now), then item swatch cards.
   - Search within the category: debounced, flattened results with the folder path under each name.
   - View Transitions through React Router's `viewTransition` for forward/back with direction-aware slide (spec 07 motion values); instant under reduced motion or when unsupported.
   - Loading skeletons, empty folder state, error with retry keeping the last content.
   - Manage-mode menus on folders and items: rename/edit, add group here, add item here, move («نقل إلى…» opens a node picker limited to the same category), deactivate/reactivate, delete (only when empty; otherwise explain and offer deactivate).
3. **Category tree manager:** categories list (name, prefix, icon from the curated lucide list), create/edit; expandable tree for groups with reorder (drag on desktop, move up/down on phones).
4. **Item editor** (full page on phones, wide modal on desktop): name, unit, location (node picker), description, attributes section pre-filled with the node's effective set, «أضف خاصية» / remove, inputs by type (text, number with unit label, select), active. Code shown read-only after creation («يتولد تلقائيًا» before). Leave guard.
5. **Item page** (read view): name, code, path, attributes as a two-column list, unit, latest price slot (shown only with `requests.viewPrices`; empty «—» until P12), image area placeholder (P06).
6. **Record managers** (§6 B) for attributes (with options editor for select type), units, suppliers (live phone validation and formatted display, categories multi-select of top-level nodes only, active). The المواقع tile links to the Sites manager built in P03.

## Tests
- Explorer: navigating into a folder updates URL and breadcrumbs; back goes up one level; search shows paths; «أخرى» row only in pick mode; manage menus only with the right keys.
- Move picker refuses other categories.
- Item editor: inherited attributes pre-selected, add/remove, typed validation.
- Supplier form rejects a landline and formats a valid number.
- Record managers: empty, loading, error states.

## Not in this phase
Images and carousel (P06), adding items to requests (P09).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] At 360 px width, browsing five levels deep feels smooth and the breadcrumb always shows where you are
- [ ] `docs/PROGRESS.md` P05 section, including the Explorer props contract for P09
- [ ] Commit `P05: master data UI and explorer`
