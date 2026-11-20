# P03 — Admin console: users, role editor, settings

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p03-admin-console`
- **Depends on:** P02

Paste everything below the line into a new Codex thread.

---

Phase P03 of Purchasing+: the screens the client's admin uses to manage people and access, plus the settings store. `AGENTS.md` and both app `AGENTS.md` files apply.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/01-access-control.md` — "Guards on managing users and roles", "Sessions and login" (password rules), "Frontend contract"
- `docs/spec/07-ui-design.md` — "Shells" (admin), "Role editor", "Screens" rows for users/roles/settings
- `docs/spec/03-purchasing.md` — default texts for `rfqIntro` and `supplyOrderIntro`
- `docs/spec/02-request-lifecycle.md` — "Aging" (for `agingDays`)
- `docs/DESIGN_SYSTEM.md` — §6 B, §6 F (selectable cards), §6 J, §14

## Build
1. **Settings API:** typed settings with a Zod schema in shared: `rfqIntro` (string), `supplyOrderIntro` (string), `agingDays` (int 1–60, default 3). Defaults seeded on first boot. `GET /settings` (any signed-in user), `PUT /settings` (`settings.manage`). Placeholder validation: only `{requestNumber}`, `{siteName}`, `{siteAddress}`, `{categoryName}` allowed.
2. **Admin console routes** inside the Admin shell, registered in the module registry with their keys.
3. **Users page** (record manager): table with name, username, role, scope, sites, status; filters (search, role, site, active). Create/edit modal: name, username, password (create only), role picker listing only roles the caller may assign (show each role's scope), sites multi-select shown when the chosen role's scope is «المواقع المسندة فقط», active toggle. Row actions: edit, reset password (prompt for the new one), deactivate/reactivate (confirm). Show API guard errors (AC-14…AC-17) inline with their fix text.
4. **Roles list:** name, scope, number of permissions, number of users; create, edit, delete (blocked with the user count when in use).
5. **Role editor page** exactly as spec 07 "Role editor": scope cards, permissions grouped by area as toggle rows with consequences, automatic `requires` ticking with the explanation, search, per-area select-all, «انسخ من دور تاني», running count, leave guard. Only keys the caller holds are shown. Save validates with the shared helper before calling the API.
6. **Settings page** (§6 J): the two message templates (textareas with a placeholder legend and a live preview using sample data) and `agingDays`.
7. **User menu → change password** wired to `POST /me/password` (if P02 left it as a stub).
8. **Sites record manager** (§6 B, `sites.*`, API from P01) at `/master-data/sites`: name, address, active; deactivate instead of delete. It sits under التكويدات (the hub tile comes in P05), and the users form needs it now.

## Tests
- Role editor: ticking a key ticks its `requires` and shows why; un-ticking a required key that another ticked key needs is prevented with a message; keys the caller lacks are absent; copy-from-role; save payload.
- Users form: scope-dependent sites field, validation messages, guard error display.
- Settings: placeholder validation and preview.
- API: settings permission and validation.

## Not in this phase
The rest of التكويدات (P05), audit log viewer (P17).

## Done when
- [ ] Green lint, typecheck, tests
- [ ] As the seeded «مدير النظام» you can create a role, assign it, and see the new user's access change immediately
- [ ] `docs/PROGRESS.md` P03 section
- [ ] Commit `P03: admin console`
