# P02 — Web foundation

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** High
- **Branch:** `p02-web-foundation`
- **Depends on:** P01

Paste everything below the line into a new Codex thread.

---

Phase P02 of Purchasing+: the visual system, primitives, shells, login and permission-aware routing that every screen will use. `AGENTS.md` and `apps/web/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/07-ui-design.md` — "Identity", "Tokens", "RTL and layout", "Shells", "Mobile patterns", "Copy"
- `docs/spec/01-access-control.md` — "Frontend contract"
- `docs/DESIGN_SYSTEM.md` — §1.1, §3.1–3.2, §4, §10, §11.4, §13, §14, §15, §17, §21

## Build
1. **Tokens** in `src/styles/tokens.css` as a Tailwind v4 `@theme` (colours, radii, shadows for overlays, spacing, type scale) exactly as spec 07. Base styles: Cairo via `@fontsource-variable/cairo`, body text 16/28, tabular numbers utility, visible focus ring in `ppr`, reduced-motion rules.
2. **Brand:** `Logo` component from `assets/brand/logo.svg` (currentColor) + wordmark "Purchasing+" (Cairo 800, LTR-isolated). Favicon, PWA manifest (`name: Purchasing+`, `lang: ar`, `dir: rtl`, `theme_color: #FFFFFF`) and icons 192/512 + maskable, generated from the SVG as white mark on black (commit the PNGs; a small script with `sharp` is fine).
3. **Shared helpers** in `packages/shared`: `i18n/ar.ts` structure (namespaced keys), formatters (`formatMoney` EGP with 2 decimals, `formatNumber`, `formatDate`, `formatDateTime`, `formatRelative`) all with `ar-EG-u-nu-latn` and `Africa/Cairo`, plus the status → label/tone/glyph map from spec 07 (statuses from spec 02). Unit tests.
4. **App plumbing:** API client (fetch wrapper with credentials, JSON, `{ error, message, fix }` errors as typed exceptions), TanStack Query provider with sensible retries (none on 4xx), session context from `GET /api/v1/me`, refreshed quietly on navigation at most every 10 s. `useCan(key)`, `useCanOnSite(key, siteId)`.
5. **Routing:** data router; `ProtectedRoute` with `anyOf` keys; not signed in → login with return URL; missing key → Access denied page; unknown → Not found. Both error pages offer back and home.
6. **Shells:** Standard (top bar per spec 07: back, home, logo, bell placeholder slot, user menu with change password and logout confirm), Admin (black sidebar, drawer on phones), Bare.
7. **Login page** (bare shell): username, password, progress on the button, lockout message.
8. **Home placeholder:** module tiles from the module registry filtered by `useCan` (Hub archetype §6 A). The inbox comes in P14.
9. **Primitives** (`components/ui`): `Button` (primary ink, secondary, danger-outline, ghost; loading state), `Field` + `Input` + `Textarea` + `Select` + `NumberInput` (decimal, Western digits), `Modal` (bottom sheet under 640 px, dialog above; Esc, backdrop, focus trap, stacking), `useConfirm`, `usePrompt` (with "reason required" mode), `Toast` (sonner, RTL, top-centre), `StatusChip`, `Chip`, `ChipSelect`, `SelectableCard`, `ToggleRow`, `Tabs` (segmented and route-based, optional counts), `Skeleton`, `EmptyState`.
10. **Composites** (`components/shared`): `DataTable` (sticky header, loading/empty/filtered-empty/error rows, dense mode, actions column, horizontal scroll on phones), `Pagination`, `ActionBar` (sticky bottom on phones, inline on desktop; primary + secondary + overflow sheet), `useLeaveGuard`.
11. A hidden `/dev/ui` route (only in development) showing every primitive, for review.

## Tests
- Formatters and status map (shared).
- `ProtectedRoute`: redirect to login with return URL; Access denied for a missing key; renders with the key.
- `useCan` hides elements; nothing is rendered disabled for permission reasons.
- `Modal`: Esc closes the top one only; focus returns to the trigger.
- `usePrompt` blocks confirm until a required reason is typed.
- `DataTable` states.
- Login flow against a mocked API: success, wrong password, lockout.

## Not in this phase
Admin pages (P03), catalog (P05), any request screen.

## Done when
- [ ] Green lint, typecheck, tests (including the RTL architecture test)
- [ ] Login works against the real API in `pnpm dev`; `/dev/ui` shows all primitives at 360 px and desktop widths
- [ ] `docs/PROGRESS.md` P02 section lists the primitives and their props briefly
- [ ] Commit `P02: web foundation`
