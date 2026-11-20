# P06 — Catalog images, carousel, «عرض للعميل»

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p06-images`
- **Depends on:** P05

Paste everything below the line into a new Codex thread.

---

Phase P06 of Purchasing+: image storage, the upload pipeline, and the ways images are shown — including the full-screen mode an engineer uses to show options to the unit owner on site. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/04-catalog.md` — "Images", "Item view and presentation mode", "Explorer behaviour" (thumbnail stack)
- `docs/spec/07-ui-design.md` — "Catalog explorer" (folder visuals), "Motion"
- `docs/spec/08-architecture.md` — "Environment variables"
- `docs/spec/09-assumptions.md` — A-10, O-1

## Build
1. **StorageDriver** interface with `local` (files under `./storage`, served by the API at a non-guessable path) and `r2` (`@aws-sdk/client-s3`, endpoint `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`). `url(key)`: public URL when `STORAGE_PUBLIC_BASE_URL` is set, otherwise a presigned GET valid for 1 hour (local driver: signed token URL). Driver chosen by env.
2. **Prisma:** `CatalogItemImage` (item, keys for thumb/display, width, height, order, isCover).
3. **Upload pipeline** (`POST /catalog/items/:id/images`, `catalog.edit`): multipart, ≤ 15 MB each, ≤ 10 per item. Sniff type from bytes (`file-type`); accept JPEG, PNG, WebP, HEIC/HEIF. HEIC → `heic-convert` → buffer → `sharp`. Auto-orient, strip metadata, write `thumb` (400 px long side, WebP q75) and `display` (1600 px long side, WebP q82, no upscaling). Store both, then the DB row. On any failure, delete what was written.
4. **Image actions:** reorder, set cover (first image is cover by default), delete (removes both objects).
5. **DTOs:** item responses include ordered image URLs; tree children include up to three cover thumbnail URLs from inside each folder's subtree (one efficient query).
6. **UI:**
   - Image manager in the item editor: multi-select upload with per-file progress and errors, reorder (drag on desktop, move buttons on phones), set cover, delete with confirm.
   - Folder rows/tiles show the stacked thumbnails (offset like sample cards); swatch cards show the cover; designed placeholder when none.
   - `Carousel` component: scroll-snap swipe, dots, «2 / 5» counter, arrow keys, lazy loading of display images.
   - Full-screen viewer with pinch-zoom and double-tap zoom.
   - **«عرض للعميل»** full-screen mode on the item page: large images and only client-relevant attributes; never prices, codes, suppliers or notes; close returns to the same place.

## Tests
- Pipeline with small fixtures for JPEG, PNG, WebP and HEIC (if a tiny permissively-licensed HEIC sample isn't available offline, mock the decoder for that branch and say so in PROGRESS.md): output sizes, WebP type, metadata stripped, oversize and wrong-type rejected, 11th image rejected.
- Driver contract tests: local fully; r2 with a mocked S3 client (put/delete/presign).
- Cover thumbnails in tree children.
- Carousel and «عرض للعميل»: hides price/code even when the viewer has `requests.viewPrices`.

## Not in this phase
Any request screen.

## Done when
- [ ] Green lint, typecheck, tests
- [ ] Uploading an iPhone photo on a phone works end to end in dev with the local driver
- [ ] `docs/PROGRESS.md` P06 section
- [ ] Commit `P06: catalog images`
