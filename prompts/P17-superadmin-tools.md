# P17 — Superadmin tools

- **Model:** GPT-6 Luna (`gpt-6-luna`)
- **Reasoning:** High
- **Branch:** `p17-superadmin-tools`
- **Depends on:** P16

Paste everything below the line into a new Codex thread.

---

Phase P17 of Purchasing+: the screens only the superadmin (the developer) can reach — audit log viewer, maintenance, and superadmin accounts. Nothing here may be grantable to a role. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/05-timeline-notifications.md` — "Audit log"
- `docs/spec/01-access-control.md` — "Superadmin" (AC-10…AC-13)
- `docs/spec/08-architecture.md` — "Security checklist"

## Build
1. **Audit log viewer** (`system.auditLog`): paginated table (time, user, action, entity, entity id, IP); filters by date range, user, entity, action; detail drawer with old and new values side by side (changed keys highlighted); «تحقق من السلامة» recomputes the HMAC for the current page and flags any mismatch. Read-only API; no update or delete routes exist for this table.
2. **Maintenance** (`system.maintenance`), each action with a clear consequence line, a confirmation that requires typing a phrase and re-entering the superadmin password, and an audit row:
   - Purge notifications older than 90 days now.
   - Rebuild catalog search text (after normalization changes).
   - Verify the whole audit log integrity (streamed in batches, progress shown).
   - **Reset operational data:** deletes requests and everything that hangs off them (items, batches, rounds, supply orders, receipts, events, notifications, request sequences), keeping users, roles, sites, catalog, suppliers and settings. Meant for clearing test data before go-live.
3. **Superadmin accounts** (`system.superadmins`): list, create, deactivate (never the last active one), reset password.
4. All three pages live in the admin console under a separate «الدعم الفني» section, visible only when `isSuperadmin`.

## Tests
- Every route refuses a non-superadmin, even one whose role holds every grantable key.
- Integrity check flags a tampered row.
- Reset deletes exactly the operational tables and nothing else; requires the phrase and password.
- Last active superadmin can't be deactivated.

## Not in this phase
Deployment (P18).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] `docs/PROGRESS.md` P17 section
- [ ] Commit `P17: superadmin tools`
