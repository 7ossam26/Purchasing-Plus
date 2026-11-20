# P19 — Full-lifecycle tests, security and accessibility pass

- **Model:** GPT-6.2 Astra (`gpt-6.2-astra`)
- **Reasoning:** High
- **Branch:** `p19-hardening`
- **Depends on:** P18

Paste everything below the line into a new Codex thread.

---

Phase P19 of Purchasing+: a fresh-eyes review of the whole system against the spec, end-to-end scenario tests, and fixes. Treat yourself as the reviewer who didn't write any of this. `AGENTS.md` applies.

## Read first
- `docs/PROGRESS.md` — all phases, especially every "Open questions" and "Deferred" entry
- `docs/spec/01-access-control.md`, `docs/spec/02-request-lifecycle.md` — all
- `docs/spec/05-timeline-notifications.md` — "Notifications"
- `docs/spec/08-architecture.md` — "Testing", "Security checklist"

## Build
1. **Scenario tests** (Vitest + supertest, real DB, separate users created only through permission keys and scopes):
   - Happy path: draft → submit → manager approve → batch → pricing → approval → supply order → partial receipt → «لسه جاي» → full receipt → completed.
   - Unavailable item later priced in round 2 → approval → received; another resolved externally by the engineer.
   - Round 1 rejected → request REJECTED → copy to new request.
   - Later round rejected → request continues and completes.
   - Pause by the engineer, edit by the manager (flags set), resume, re-price, submit.
   - Return for edit by the manager and by purchasing.
   - Cancel at any stage with received quantities kept.
   - Each scenario asserts statuses, item states, timeline events (types and actors), notification recipients and the absence of notifications to the actor.
2. **Permission matrix test:** build a manifest of every API route with its required keys; for each route, a user holding everything except that route's key gets 403; out-of-scope site gets 404 for request routes.
3. **Redaction sweep:** prices, supplier names and timeline hidden consistently in request DTOs, timeline, lists, inbox, reports, record logs and exports.
4. **Security review** against spec 08's checklist: headers, CSP, cookie flags, Origin check, rate limits, lockout, upload sniffing, raw SQL parameterization, secrets never logged or audited, `pnpm audit` clean (or justified). Fix what you find.
5. **Accessibility:** `vitest-axe` on login, home, request page, explorer, role editor; keyboard focus order and visible focus; labels on every input; colour never the only signal; touch targets ≥ 44 px on the main operational screens. Fix what you find.
6. **Performance:** run `EXPLAIN` on the list, inbox, search and report queries with a seeded dataset (e.g. 20k requests, 50k items, 10k catalog items); add missing indexes; remove N+1 queries.
7. **Spec conformance:** walk `docs/spec/` section by section and list any gap in `docs/PROGRESS.md` under "P19 gaps", fixing the small ones now.

## Done when
- [ ] Green lint, typecheck, tests, coverage thresholds met
- [ ] `docs/PROGRESS.md` P19 section: what was fixed, remaining gaps with severity
- [ ] Commit `P19: hardening`
