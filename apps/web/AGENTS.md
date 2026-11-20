# apps/web — local rules

- Read `docs/spec/07-ui-design.md` before any UI work. Tokens live in `src/styles/tokens.css` (Tailwind v4 `@theme`); never hard-code a hex value in a component.
- Layers (DESIGN_SYSTEM §10.1): `components/ui` (primitives, no domain knowledge) → `components/shared` (domain-agnostic composites) → `features/<area>` → `pages`. A layer imports only from layers below it.
- One `Modal` primitive that renders as a bottom sheet on phones and a dialog on desktop. One toast system (`sonner`). Confirmations through `useConfirm()`, single-value prompts and reasons through `usePrompt()`.
- Permissions: `useCan(key)` / `useCanOnSite(key, siteId)`. Hide what the user can't do. Workflow buttons come from the shared lifecycle module (`availableActions(request, viewer)`), never from ad-hoc conditions.
- Data: TanStack Query; one service module per API area in `src/lib/api/`; components never call `fetch` directly. Invalidate queries on SSE "request changed" signals.
- Every data region handles loading, empty (a specific sentence), filtered-to-nothing, error with `fix` hint, and saving states (DESIGN_SYSTEM §13).
- Mobile first: design at 360 px wide, then widen. Touch targets ≥ 44 px. Sticky bottom action bar for primary actions on phones.
- RTL: logical utilities only (`ms-`, `pe-`, `start-`, `text-start`…). Wrap Latin/number strings that must stay LTR in `<bdi>`.
- Strings come from `@purchasing-plus/shared/i18n/ar`. Numbers and money through the shared formatters.
- Tests: `@testing-library/react` + `jsdom`; test behaviour (what the user sees and can do), mock the API at the fetch layer.
