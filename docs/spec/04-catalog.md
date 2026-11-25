# 04 — Catalog, master data and images

«التكويدات» is the master-data hub (DESIGN_SYSTEM §6 A). Its tiles: الأصناف (the catalog explorer), الفئات والمجموعات, الخصائص, الوحدات, الموردين, المواقع. Each tile appears only with its `.view` permission.

## Catalog tree

- One tree. A node with no parent is a **category**; every other node is a **group**. Depth is unlimited.
- Node fields: name, `parentId`, `codePrefix` (categories only: 2–5 latin capitals, unique, immutable once items exist), `sortOrder`, `isActive`, `path` (materialized ids like `/1/7/23/`, indexed, used for subtree queries and breadcrumbs), `depth`.
- Items can live at any node, including directly under a category.
- **Moving** a group or item is allowed only within its own category (codes and supplier links belong to the category). Moving a group updates every descendant's `path` in one transaction. The timeline of affected request items keeps the old path in their snapshot.
- **Deleting** is allowed only for an empty node (no children, no items). Otherwise the action is «إيقاف» (deactivate): hidden from pickers, still visible in التكويدات with an «موقوف» chip and a filter.
- Categories are created, renamed and reordered by `catalogTree.*` holders. Seed: the five categories listed in 01.

## Attributes (الخصائص)

- Definition: name (unique), type `TEXT` | `NUMBER` | `SELECT`, optional unit label (e.g. «سم»), options list for `SELECT` (ordered, each can be deactivated), active.
- **Default attribute sets on nodes.** A node can list attributes. The effective set for a node = its ancestors' sets (top first) + its own. Subgroups add; they don't remove inherited ones.
- **Per item:** when creating an item at a node, the effective set is pre-selected. The user can add any active attribute or remove any pre-selected one, then fill values. Values: text, number, or one option.

## Catalog items (الأصناف)

| Field | Notes |
|---|---|
| `code` | Auto: `{categoryPrefix}-{seq}` with a 4-digit minimum (`ELC-0001`), per-category sequence, immutable |
| `name` | Required |
| `nodeId` | Where it lives |
| `unitId` | Default unit when added to a request |
| attribute values | As above |
| `description` | Optional |
| images | 0–10, ordered, one cover (first by default) |
| `isActive` | Inactive items disappear from pickers |
| latest purchase price | Read-only, derived from price records: unit price, supplier, date, request number |

### Price records

`CatalogItemPrice`: item, unit price, supplier, request, request item, source (`SUBMITTED` | `REPRICED`; `APPROVED` in history from the removed approval step), timestamp. Appended when pricing is submitted (T16) and on re-pricing remaining items (T22). The latest record is the catalog price. Feeds the price-history report. Prices are visible only with `requests.viewPrices`; supplier names only with `requests.viewSupplierNames`.

### From «أخرى» to the catalog

«أضف للكتالوج» on a «أخرى» request item opens the item editor pre-filled with the name, unit and the group it was added from. Saving links that request item to the new catalog item (its frozen snapshot stays as it was) and writes a timeline event. Requires `catalog.create`.

## Search

- Searches name, code and attribute values within the current category, across all depths.
- Arabic normalization on both the stored search text and the query: strip tashkeel and tatweel; أ إ آ → ا; ى → ي; ة → ه; collapse spaces. Store a normalized `searchText` column with a trigram index (`pg_trgm`).
- Results show each item's folder path under its name.

## Recent items

The picker shows «استخدمته مؤخرًا»: the current user's last 12 distinct catalog items in this category, newest first.

## Units, sites

- **Units:** name (unique), active. Record manager (DESIGN_SYSTEM §6 B).
- **Sites:** name (unique), address, active. Record manager. The users editor assigns sites to users. A site with requests can't be deleted, only deactivated (deactivated sites can't receive new requests).

## Images

- **Storage adapter** `StorageDriver { put(key, buffer, contentType), delete(key), url(key) }` with two drivers: `local` (development and tests, files under `./storage`, served by the API) and `r2` (S3-compatible API, `@aws-sdk/client-s3`). Selected by `STORAGE_DRIVER`. If `STORAGE_PUBLIC_BASE_URL` is set, `url()` returns public URLs; otherwise the API returns short-lived presigned URLs. The R2 public/private decision is still open; both must work.
- **Upload:** multipart to the API, max 15 MB each, max 10 per item. Detect type from magic bytes, not the extension: JPEG, PNG, WebP, HEIC/HEIF. HEIC is decoded with `heic-convert` before `sharp` (sharp's prebuilt binaries don't decode HEIC). Apply EXIF orientation, then strip metadata.
- **Outputs** (generated once at upload, both stored): `thumb` WebP, 400 px on the long side, quality 75; `display` WebP, 1600 px on the long side, quality 82, never upscaled. Keys: `catalog/{itemId}/{imageId}-thumb.webp`, `catalog/{itemId}/{imageId}-display.webp`. The database stores keys, order, cover flag, width and height.
- Reorder by drag (desktop) or move buttons (mobile). Deleting an image deletes both objects.

## Item view and presentation mode

- **Item page / sheet:** swipeable image carousel (snap scrolling, dots, counter «2 / 5», pinch-zoom on the full-screen view), then name, code, attributes as a two-column list, unit, latest price (if permitted), description.
- **«عرض للعميل»:** full-screen view for showing the unit owner on site. Large images, name and the client-relevant attributes only. **No prices, codes, suppliers or internal notes.** Swipe between images; a close button returns to the same place.
- Items without images show a designed placeholder: the item's first letters on a tinted panel with the category's icon. No stock photos.

## Explorer behaviour (applies to both التكويدات and the request picker)

Detailed visual spec in `07-ui-design.md`. The essentials:
- URL reflects the open folder (`/catalog/node/:nodeId`, `/requests/:id/add/node/:nodeId`), so browser back goes up one folder.
- Breadcrumb bar from the category to the current folder; every crumb is tappable.
- Folders first, then items. A folder shows its name, how many groups and items it contains, and up to three cover thumbnails from inside it.
- In the request picker, every folder level ends with «مش لاقي الصنف؟ أضف «أخرى»», which records the current folder.
- In التكويدات mode, each folder and item has a menu: rename/edit, move, add group here, add item here, deactivate/delete.
