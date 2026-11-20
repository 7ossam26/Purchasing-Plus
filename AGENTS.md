# Purchasing+ — rules for Codex

Purchasing+ is a mobile-first, Arabic (RTL) purchase-request system for a finishing contractor: site engineer → site manager → purchasing (WhatsApp price requests) → pricing approval → supply orders → receipt on site.

## Where things are

- `docs/spec/` — the specification. **Read only the sections your phase prompt lists.** The spec wins over anything else.
- `docs/DESIGN_SYSTEM.md` — UX structure (archetypes, shells, states, safeguards). Read only the § numbers you're pointed to.
- `docs/PROGRESS.md` — what previous phases built, decisions, open questions. Read it first, update it last.
- `docs/PHASES.md` — the phase plan. Do only the phase you were given.
- `apps/api/AGENTS.md`, `apps/web/AGENTS.md` — local rules for each app.

## Non-negotiable rules

1. **No role names in code. Ever.** Never branch on a role's name or id. Ask "does this user hold permission key X on site Y?". Keys come only from `packages/shared/src/permissions/registry.ts`. (spec 01, AC-1)
2. **The server is the authority.** Every API route checks permission and site scope before doing work, and redacts prices/supplier names/timeline per permission. The UI hides what the user can't use; it never shows it disabled for permission reasons.
3. **Lifecycle rules live in `packages/shared/src/lifecycle/`** and are used by both apps. Never re-implement a transition check in a route or a component.
4. **Each state change is one transaction:** state + timeline event + audit row + notification rows. Publish live events only after commit.
5. **Arabic RTL only.** Logical CSS properties only. All UI strings in `packages/shared/src/i18n/ar.ts`. Western digits (`ar-EG-u-nu-latn`). Business time zone `Africa/Cairo`.
6. **Money is never a float.** `Decimal(14,2)` in the DB, decimal strings in JSON, `decimal.js` for arithmetic. The delivery fee is never added to a total.
7. **Follow the design tokens and patterns** in `docs/spec/07-ui-design.md`. No new UI libraries, icon sets, gradients, glass effects or decorative animation.

## Commands

```
pnpm install
docker compose up -d db          # PostgreSQL for dev + tests
pnpm dev                         # api + web
pnpm lint && pnpm typecheck
pnpm test                        # Vitest, all workspaces
pnpm --filter api prisma migrate dev
```

## Testing (Vitest only)

- Write tests in the same change as the code. A phase isn't done with failing, skipped or `.only` tests.
- Shared logic: unit tests for every rule and edge case. API: HTTP integration tests against the real test database (happy path, 403 missing permission, out-of-scope site, 422 validation, 409 wrong state). Web: component tests for behaviour, not snapshots.
- Never weaken an assertion or delete a test to make a run pass. If a test reveals a spec conflict, stop and note it in `docs/PROGRESS.md`.

## How to work a phase

1. Read `docs/PROGRESS.md`, then the spec sections named in the prompt.
2. List the files you'll create or change (short), then implement.
3. Keep scope tight: build what the prompt lists, nothing from later phases. Leave clean extension points instead of stubs that pretend to work.
4. Run `pnpm lint && pnpm typecheck && pnpm test` until green.
5. Append to `docs/PROGRESS.md`: what was built, files/modules added, decisions you made, anything deferred, open questions.
6. Commit with message `Pxx: <summary>`. Stop. Don't start the next phase.

If the spec is unclear: choose the conservative option, implement it behind a clearly named function, and record it under "Open questions" in `docs/PROGRESS.md`.

## Dependencies

Use the libraries listed in `docs/spec/08-architecture.md`. Adding anything else needs a one-line justification in `docs/PROGRESS.md`.
