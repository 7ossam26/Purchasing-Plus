# P01 — Access control core (API)

- **Model:** GPT-6.2 Astra (`gpt-6.2-astra`)
- **Reasoning:** High
- **Branch:** `p01-access-control`
- **Depends on:** P00

Paste everything below the line into a new Codex thread.

---

Phase P01 of Purchasing+: users, sessions, fully dynamic roles and permissions, site scope, sites API and the audit log. This is the security foundation; correctness matters more than speed. `AGENTS.md` and `apps/api/AGENTS.md` apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/01-access-control.md` — all of it
- `docs/spec/04-catalog.md` — "Units, sites" (sites only)
- `docs/spec/05-timeline-notifications.md` — "Audit log" only
- `docs/spec/08-architecture.md` — "Data model outline", "API conventions", "Security checklist"
- `docs/spec/09-assumptions.md` — A-16, A-18, A-21

Background: the reference project ERP-V2 hard-coded role names and let "Admin" skip every check. The whole point of this phase is that nothing like that exists here.

## Build
1. **Shared permission registry** in `packages/shared/src/permissions/`: every key from spec 01 with `area`, Arabic `label`, Arabic `consequence`, `requires`, `superadminOnly`. Helpers: `closeOverRequires(keys)`, `validateRoleKeys(keys)` (unknown keys, unmet `requires`, superadmin-only keys), `areas()` for the editor. Also a module registry skeleton (`{ id, label, description, icon, path, kind, anyOf }`) with entries for the admin console pages and «التكويدات».
2. **Prisma models and migration:** `User`, `Role`, `RolePermission`, `UserSite`, `Session`, `Site`, `AuditLog`.
3. **Auth module:** `POST /auth/login`, `POST /auth/logout`, `GET /me`, `POST /me/password`. argon2id. Opaque session id in an `httpOnly`, `Secure` (off in dev), `SameSite=Lax` cookie; sliding 7-day idle expiry. Lockout after 5 failures for 15 minutes with the same message for unknown user and wrong password; rate-limit the login route. `GET /me` returns user, role name (display only), `isSuperadmin`, `siteScope`, sites, effective `permissions`.
4. **Middleware:** `requireSession`, `requirePermission(...keys)` (all), `requireAnyPermission([...])`, Origin check on mutating methods (against `PUBLIC_ORIGIN`). A `Viewer` object on the request: `userId`, `isSuperadmin`, `permissions: Set`, `siteScope`, `siteIds`. Helpers `assertSiteInScope(viewer, siteId)` and `siteWhere(viewer)` for Prisma filters. Effective permissions are read from the DB with an in-process cache keyed by user id and invalidated when the user's or role's `updatedAt` changes (AC-9).
5. **Users API** (`users.view`, `users.manage`): list (pagination, search, role/site/active filters; superadmins hidden from non-superadmins), create, update, deactivate/reactivate, reset password (deletes sessions). Enforce AC-14 to AC-17 with clear Arabic errors. Users are never hard-deleted.
6. **Roles API** (`roles.view`, `roles.manage`): list with user counts and key counts, get, create, update (name, description, siteScope, keys), delete (blocked when users hold it). Validate keys with the shared helpers; reject superadmin-only keys; enforce AC-14, AC-15, AC-18 (the API only returns keys the caller holds when listing assignable keys).
7. **Sites API** (`sites.*`): list, create, update, deactivate. Unique name.
8. **Superadmin bootstrap** at startup from `SUPERADMIN_USERNAME`/`SUPERADMIN_PASSWORD` when no superadmin exists; superadmin-only endpoints for managing superadmins (`system.superadmins`); the last active superadmin can't be deactivated.
9. **First-boot seed** (idempotent, runs only when the roles table is empty): the six sample roles with the keys and scopes in spec 01 "Seed". This file is the only place role names may appear in code.
10. **Audit log:** `writeAudit()` with HMAC-SHA256 over identity fields (see ERP-V2 approach in spec 05) and recursive redaction of password/token/secret keys. Write audit rows for every mutation in this phase and for login, failed login, lockout, logout.

## Tests
- Registry integrity: unique keys, every `requires` exists, no cycles, seed uses only valid non-superadmin keys.
- Login, logout, lockout timing, same error for unknown user/wrong password, session expiry, session revoked on deactivate and on password reset.
- `requirePermission` / scope: a user holding a key on site A is refused on site B; ALL scope passes; superadmin passes everything.
- Every guard AC-14…AC-18 has a refusing test and an allowed test.
- Role save rejects unknown keys, unmet `requires`, superadmin-only keys.
- Changing a role's keys changes `/me` and access on the very next request (no re-login).
- Superadmins invisible in user lists for non-superadmins.
- Audit rows written, HMAC verifies, passwords redacted.
- Every route: 401 without session, 403 without key, 422 on bad input.

## Not in this phase
Any UI, settings, catalog, requests.

## Done when
- [ ] All tests green, architecture tests still green
- [ ] `docs/PROGRESS.md` P01 section lists the endpoints and the `Viewer` contract later phases must use
- [ ] Commit `P01: access control core`
