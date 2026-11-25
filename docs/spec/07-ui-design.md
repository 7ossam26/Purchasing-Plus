# 07 — UI design

`docs/DESIGN_SYSTEM.md` defines structure and behaviour (archetypes, shells, navigation, states, safeguards, keyboard, responsive rules). Follow it. This file adds the Purchasing+ visual identity and the screen-by-screen decisions. Cite DESIGN_SYSTEM sections by number in code comments only where a rule is non-obvious.

## Identity

Purchasing+ serves people standing on construction sites, holding a phone, often in sunlight. The visual language borrows from the site itself: plaster walls, black marking, and the green of PPR water pipes. It is calm, high-contrast and plain, so the two signature moments — the stage rail and the folder explorer — carry the personality.

**Principle: green acts, labels confirm.** The primary action on a screen is a solid green button (`action`: `#146B48` with a white label in light, `#63CA95` with a near-black label in dark), and it is the only solid green control there. Done, selected and approved states keep their own treatments, never a solid action fill: completed rail stages carry a checkmark, success chips carry their glyph and label, selected tabs and rows use the pale `ppr-wash` tint (tabs add a `ppr` underline), and focus is a `ppr` ring. Headings and the current stage stay `ink`.

## Tokens (Tailwind v4 `@theme` in `apps/web/src/styles/tokens.css`)

| Token | Hex | Use |
|---|---|---|
| `ink` | `#000000` | Logo, headings, current stage |
| `action` / `action-fg` | `#146B48` / `#FFFFFF` | Primary action buttons, e.g. «طلب جديد» (label 6.5:1; hover `action-hover` `#0F5739`, 8.6:1) |
| `paper` | `#FFFFFF` | Surfaces: panels, sheets, tables |
| `plaster` | `#F1F2EE` | App background behind surfaces |
| `concrete` | `#61645D` | Secondary text, icons, placeholders (6.0:1 on paper) |
| `seam` | `#DADBD5` | Borders and dividers |
| `ppr` | `#1F7A56` | Accent fills: completed rail segments, selected state, focus ring, checkmarks (white text on it 5.3:1) |
| `ppr-deep` | `#155C40` | Accent text and links on paper (8.0:1) |
| `ppr-wash` | `#E7F1EC` | Selected rows, success chips, diff "after" |

Status tones (text on background, all ≥ 5:1):

| Role (DESIGN_SYSTEM §9) | Text | Background | Used for |
|---|---|---|---|
| Neutral | `#4A4D47` | `#ECEDE9` | مسودة |
| Primary | `#FFFFFF` | `#000000` | Current stage on the rail |
| Pending | `#8A5A00` | `#FBF0D9` | بانتظار موافقة المدير، بانتظار اعتماد التسعير، عاجل |
| Info | `#3D5A73` | `#EAF0F5` | عند المشتريات، بانتظار الاستلام |
| Distinct | `#5B3E8C` | `#F1ECF8` | مُعاد للتعديل، موقوف مؤقتًا، بنود متبقية |
| Success | `#155C40` | `#E7F1EC` | مكتمل، approved, received |
| Danger | `#B42318` | `#FCEBE9` | مرفوض، ملغي، عاجل جدًا، متأخر، rejected items |

Status chips always carry a small leading glyph as well as the colour, so status is never colour-only. One `StatusChip` with one status → label + tone + glyph map in `packages/shared`.

**Themes (light and dark).** The tables above are the light theme. A dark theme re-tunes the same semantic tokens under `:root[data-theme='dark']`, so components never carry dark-specific classes. The primary action green is tuned separately for charcoal: `action` `#63CA95` with `action-fg` `#0B0D0A` (label 9.7:1; hover `#7FD6A9`). `ink` becomes soft near-white `#ECEEE8` on dark surfaces, `paper` `#1D201C`, `plaster` `#111310`, `seam` `#3A3E36`, `concrete` `#A6AAA0`, `ppr` `#3FAE7D`, `ppr-deep` `#80D5AA`, `ppr-wash` `#1A3A2A`; status pairs keep ≥ 7.5:1. Two extra roles: `console` / `console-fg` (the admin sidebar and drawer: black in light, `#0A0B09` in dark) and `switch-off` / `switch-knob` (an off switch is a dim track with a light knob in both themes, so it never reads as on). The choice «المظهر» (حسب الجهاز، فاتح، داكن) lives in the account menu «حسابك». It follows the device until the user picks one, remembers an explicit choice on that device, applies before first paint (`public/theme-init.js`) and stays in sync across open tabs. `theme-color` follows the top-bar surface.

**Type.** Cairo variable font, self-hosted with `@fontsource-variable/cairo` (bundled by Vite; no CDN). One family for everything. `font-variant-numeric: tabular-nums` on every number column, money and counter.

| Style | Size / line height | Weight |
|---|---|---|
| Page title | 24/34 mobile, 28/40 desktop | 800 |
| Section title | 20/30 | 700 |
| Subtitle / row title | 17/28 | 600 |
| Body | 16/28 | 400 |
| Small | 14/22 | 400 or 600 |
| Micro (chips, counters) | 12/18 | 600 |

Arabic needs the generous line heights above; don't tighten them.

**Shape.** Radius follows hierarchy, not one value: inputs and buttons 8 px; content panels 12 px; bottom sheets 20 px on the top corners; image thumbnails 6 px; chips fully rounded. In-page panels have **no shadow**, only a `seam` border. Only overlays (sheets, menus, dialogs, toasts) get elevation: `0 12px 32px rgba(0,0,0,.14)` over a `rgba(0,0,0,.4)` backdrop.

**Spacing.** 4 px base: 4, 8, 12, 16, 24, 32, 48. Mobile page padding 16, desktop 24–32. Touch targets ≥ 44 × 44 px.

**Icons.** `lucide-react` only, stroke 1.75, 20 px (24 in navigation). Category icons: كهربا `Zap`, صحي `Droplet`, سيراميك `Grid3x3`, دهانات `PaintRoller`, أوكر ومقابض `DoorOpen`; new categories pick from a short curated list in the category editor.

**Logo.** The PLACES lockup `assets/brand/places-logo.svg` (uses `currentColor`, so ink in light and soft white in dark; accessible name «PLACES»). Top bar: the lockup at 28 px tall (32 px from `lg`), isolated left-to-right inside the RTL bar, followed from `sm` up by a divider and the product name "Purchasing+" in `concrete`. The login card shows the lockup at 36 px with the product name. The mark alone (`assets/brand/logo.svg`) stays the favicon and PWA icons: white mark on a black square (like `logo-on-black.png`), including a maskable icon.

## Motion

Exactly three kinds:
1. **Folder navigation** in the explorer (below), using the View Transitions API through React Router's `viewTransition`.
2. **Overlays** (sheets slide up 200 ms, dialogs fade/scale 150 ms) and expand/collapse that shows what changed (disclosure chevrons rotate 150 ms).
3. **Interaction feedback**, 120–200 ms: colour transitions on hover, press and selection; buttons settle to 98 % scale while pressed; switching the theme cross-fades colours for 180 ms.

Nothing animates on page load. No hover lifts on cards, no looping or bouncing motion. Everything is instant under `prefers-reduced-motion`.

## Don'ts

No gradients, glass or blur effects, coloured shadows, emoji, stock photos or illustrations, hero banners, grids of identical shadowed cards, «→» glued to button text, metadata strings joined with «·», placeholder or fake numbers, letter-spaced labels above headings.

## RTL and layout

- `<html lang="ar" dir="rtl">`. Logical properties only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `border-s`). An architecture test fails on physical `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right` classes in `apps/web/src` (DESIGN_SYSTEM §21 item 5).
- Directional icons (chevrons, back arrows) flip for RTL.
- Latin strings (codes, usernames, phone numbers, the wordmark) are wrapped in `<bdi>` or `dir="ltr"` spans.
- Content is start-aligned (right). Numbers in tables are end-aligned.
- Scrollbars stay visible except on horizontal chip strips (§21 item 6).

## Shells

| Shell | Where | Notes |
|---|---|---|
| Standard (§4.1) | All operational pages | Light top bar on `paper`: back, home, logo, bell with count, user menu (name, role, change password, logout with confirm). No scope switcher: lists filter by site instead |
| Admin console (§4.2) | Users, roles, settings, import/export, audit log, maintenance | **Black sidebar** with white text — clearly a different place. Becomes a drawer on phones |
| Bare (§4.4) | Login, access denied, not found | Centred card on `plaster` |

## Mobile patterns

- Primary actions sit in a **sticky bottom action bar** that shows only the actions allowed now (from the shared lifecycle module). One primary (solid `action` green), the rest secondary; destructive actions in danger outline; overflow in a «المزيد» sheet.
- Pickers, reasons and confirmations open as **bottom sheets** on phones and dialogs on desktop (one `Modal` primitive, §21 item 1).
- Reasons are a required textarea in a sheet; the confirm button explains the consequence («رفض الطلب نهائيًا»).
- Disabled actions show the reason on a line under them (§13 "Disabled with reason").

## Screens

| Screen | Archetype | Notes |
|---|---|---|
| Login | §6 L | Username, password, «دخول»; lockout message names the wait time |
| Home «محتاج مني» (heading: `Welcome {label}`) | Queue + hub (§6 G + §6 A) | See 05 |
| New request | Guided workspace (§6 E), simplified for phones | Below |
| Request page | Entity detail (§6 I) | Below |
| Catalog explorer (picker and التكويدات) | Custom | Below |
| Item page / sheet, «عرض للعميل» | Custom | See 04 |
| Units, attributes, suppliers, sites | Record manager (§6 B) | Supplier form validates the phone live |
| Category tree manager | Custom tree list | Expand/collapse, drag to reorder siblings on desktop, move via «نقل إلى…» picker |
| Reports hub, reports | §6 A (large tiles), §6 C | See 06 |
| Records | §6 B read-only | See 06 |
| Users | §6 B | Role picker shows each role's scope; site multi-select |
| Roles list, role editor | §6 B, §6 J | Below |
| Settings | §6 J | rfqIntro, supplyOrderIntro (with placeholder help), agingDays |
| Import / export | §6 K | See 06 |
| Audit log, maintenance | §6 B, §6 J | Superadmin only |
| Access denied, not found | §6 L | Two exits each |

### New request (phone first)

1. «طلب جديد» opens a sheet: **site** as chips (skipped when the user has one site) and **category** as five large tiles with their icons. Choosing creates the draft and opens the picker at the category root.
2. **Picker** = the explorer in picker mode, with «استخدمته مؤخرًا» at the category root and a sticky **basket bar** at the bottom: «السلة: 6 بنود» and «مراجعة».
3. Tapping an item opens the **item sheet**: carousel, attributes, editable specs (pre-filled from attributes), quantity stepper with decimal input, unit, «أضف للطلب» (tap-then-quantify, §12).
4. **Review:** items (name with specs next to it, quantity, unit, remove), urgency as three chips (عادي، عاجل، عاجل جدًا), «الوحدة / العميل», «أضف ملاحظة» (collapsed), and «إرسال للمدير». Under a disabled submit, the reason («أضف بند واحد على الأقل»). A small «اتحفظ» marker shows autosave.

### Request page

- **Header:** request number (large, tabular), site, category, creator, urgency badge, «معدّل», «متأخر», stage chip with per-state counts. «نسخ لطلب جديد» in the overflow menu.
- **Stage rail** (05) under the header.
- **Tabs** (only those the user can use): البنود، المشتريات، الاستلام، السجل الزمني.
- **البنود:** item rows (line number, name, specs inline, quantity, unit, item-state chip; supplier and line total when permitted). Pricing-round summary for approvers with total and delivery fee as a separate line. «أضف للكتالوج» on «أخرى» items for `catalog.create` holders.
- **Sticky action bar** with the actions allowed now.

### Catalog explorer — opening folders

The explorer should feel like opening drawers of material samples: smooth, physical and fast.

- **Breadcrumb bar**, sticky under the top bar: category (with its icon) › group › group. Every crumb is tappable. On phones, more than three crumbs collapse the middle ones into «…» which opens a list.
- **Search** field at the top: «ابحث في كهربا». Results flatten into one list with each item's folder path under its name.
- **Folders come first.**
  - Phone: rows 64 px tall. The leading visual is a stack of up to three cover thumbnails from inside the folder, offset like sample cards in a drawer, or a `plaster` square with the folder's first letter when it has no images. Then the name (17/600), the counts («4 مجموعات، 37 صنف») in `concrete`, and a chevron pointing toward the inline end.
  - Desktop: a 3–5 column grid of the same idea as tiles, with the thumbnail stack on top.
- **Items** as swatch cards: square cover thumbnail (6 px radius) or the designed placeholder, name (max 2 lines), code in `concrete`, the first two attribute values, latest price when permitted.
- **Navigation motion:** opening a folder slides the current content 24 px toward the inline start while fading out, and the new folder enters from 24 px at the inline end, 180 ms `cubic-bezier(.2,.8,.2,1)`. Going back reverses it. The new crumb enters with the same motion. Browser back = up one folder (the URL holds the node id).
- **Every folder level ends with** «مش لاقي الصنف؟ أضف «أخرى»» in picker mode, or «أضف مجموعة» / «أضف صنف» in التكويدات mode.
- **Empty folder:** «الفولدر ده فاضي.» plus the same add actions.
- **States:** skeleton rows while loading; the last good content stays visible on error with a retry.

### Role editor

- Name, description, and **scope** as two large selectable cards: «المواقع المسندة فقط» / «كل المواقع» (§6 F settlement-card pattern).
- Permissions grouped by area (from the registry), each as a full-width toggle row: label + its one-line consequence (§6 J ToggleRow). Dependencies tick automatically with a note («اتفعّل تلقائيًا لأن …»).
- A search box over permissions, a per-area «تحديد الكل», «انسخ من دور تاني», a running count («23 صلاحية»), and a leave guard for unsaved changes.
- Non-superadmins only see keys they hold (AC-18).

## Copy

- Plain Egyptian Arabic, short, sentence-like, written for the person holding the phone. Use the exact strings in this spec where given.
- All UI strings live in `packages/shared/src/i18n/ar.ts` (one place to change wording later).
- A button's verb matches its toast: «اعتماد التسعير» → «اتعمد التسعير». Errors say what happened and how to fix it (§14). Empty states invite the next action.
