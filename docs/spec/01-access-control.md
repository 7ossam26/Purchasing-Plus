# 01 — Access control: dynamic roles and permissions

ERP-V2 hard-coded role names (`GLOBAL_ROLES`, `ADMIN_ROLES`, `SHIFT_APPROVAL_ROLES` in `config/roles.js`) and let "Admin" bypass every check. Purchasing+ must never do this.

## Rules

- **AC-1 No role names in code.** No code path may branch on a role's name or id. The code asks "does this user hold permission X for site Y?" and nothing else. An architecture test scans `apps/*/src` and `packages/*/src` and fails on `role.name`, `roleName`, `roleId ===` or a role name string used in a condition. Role names may appear only in the one-time seed file and in display components.
- **AC-2 Roles are data.** A role has: name (unique), description, `siteScope` (`ASSIGNED` or `ALL`), a set of permission keys, `createdAt`, `updatedAt`. Created, edited and deleted in the role editor.
- **AC-3 One role per user.** Every non-superadmin user has exactly one role. A user also has 0..n assigned sites.
- **AC-4 The permission registry is the only list of what can be granted.** It lives in `packages/shared/src/permissions/registry.ts`. Each entry: `key`, `area` (grouping in the editor), `label` (Arabic), `consequence` (one Arabic line describing what holding it allows), `requires` (keys it depends on), `superadminOnly` (boolean). The database stores role → permission keys as plain strings. Unknown keys found in the database are ignored and logged. Adding a feature means adding registry entries; they appear in the role editor automatically and no existing role holds them until someone ticks them.
- **AC-5 Dependencies.** Granting a key grants nothing implicitly at runtime. The editor auto-ticks `requires` keys and explains why ("يتطلب: عرض الطلبات"). The API rejects a role save whose keys don't satisfy `requires`.
- **AC-6 Site scope.** `ALL` roles act on every site. `ASSIGNED` roles act only on the user's assigned sites. Every request-related query and mutation filters by scope on the server. A user with no sites and an `ASSIGNED` role sees no requests.
- **AC-7 Visibility is enforced on the server.** Visibility permissions (`requests.viewPrices`, `requests.viewSupplierNames`, `requests.viewTimeline`) remove fields from API responses, including inside timeline events, reports and exports. The UI hiding them is a courtesy.
- **AC-8 Hide, don't disable.** The UI never shows a page, tile, tab or button the user lacks permission for. Disable only for state reasons, with the reason shown (DESIGN_SYSTEM §15).
- **AC-9 Changes apply immediately.** Permissions are read from the database on each request (with a short in-process cache invalidated by role or user `updatedAt`). Changing a role or a user's role, sites or active flag takes effect on the next request, with no re-login. Deactivating a user deletes their sessions.

## Superadmin

- **AC-10** `User.isSuperadmin` is a boolean, not a role. A superadmin has no role, passes every permission check, and has `ALL` scope.
- **AC-11** The first superadmin is created at boot from `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` if no superadmin exists. Only a superadmin can create, edit or deactivate another superadmin. The last active superadmin cannot be deactivated.
- **AC-12** Superadmin accounts are invisible to non-superadmins (user lists, pickers, filters). Timeline and audit entries made by a superadmin show the name with the label «الدعم الفني».
- **AC-13** Keys marked `superadminOnly` never appear in the role editor and can't be saved on a role. Only the superadmin flag satisfies them.

## Guards on managing users and roles

These hold for every non-superadmin who has `users.manage` or `roles.manage`:

- **AC-14** You can only grant keys you hold yourself, and only set `siteScope = ALL` if your own role is `ALL`.
- **AC-15** You can't edit the role you're assigned to, and can't change your own role, sites or active flag.
- **AC-16** You can't assign a user a role that holds keys you don't hold.
- **AC-17** A role with users can't be deleted. The editor says how many users hold it.
- **AC-18** In the role editor, keys you don't hold are hidden, not shown disabled.

## Sessions and login

- Username + password. Usernames: latin letters, digits, `.`, `_`, `-`; unique, case-insensitive. Passwords: at least 8 characters, hashed with argon2id.
- Opaque session id in an `httpOnly`, `Secure`, `SameSite=Lax` cookie; sessions stored in the database (revocable). Idle expiry 7 days, sliding.
- Mutating requests must carry a matching `Origin` header (CSRF defence with `SameSite=Lax`).
- Lockout: 5 failed attempts → locked 15 minutes. Same error for unknown user and wrong password. Rate-limit the login route.
- Users with `users.manage` reset another user's password by typing a new one; this deletes that user's sessions. Every user can change their own password from the user menu.
- Users are deactivated, never hard-deleted (history references them).

## Permission registry (initial)

Keys are stable identifiers; labels are what the editor shows. ✱ = `superadminOnly`.

### الطلبات
| Key | Label | Requires |
|---|---|---|
| `requests.view` | عرض الطلبات | — |
| `requests.create` | إنشاء الطلبات وتعديلها قبل الموافقة | `requests.view` |
| `requests.approve` | الموافقة على الطلب | `requests.view` |
| `requests.reject` | رفض الطلب نهائيًا | `requests.view` |
| `requests.returnForEdit` | إرجاع الطلب للتعديل | `requests.view` |
| `requests.raiseUrgency` | رفع درجة الاستعجال | `requests.view` |
| `requests.editQuantities` | تعديل الكميات قبل الموافقة | `requests.view` |
| `requests.pause` | إيقاف الطلب مؤقتًا واستئنافه | `requests.view` |
| `requests.editWhilePaused` | تعديل الطلب أثناء الإيقاف | `requests.view` |
| `requests.cancelAnyStage` | إلغاء الطلب في أي مرحلة | `requests.view` |
| `requests.viewTimeline` | رؤية السجل الزمني | `requests.view` |
| `requests.viewPrices` | رؤية الأسعار | `requests.view` |
| `requests.viewSupplierNames` | رؤية أسماء الموردين | `requests.view` |

### المشتريات
| Key | Label | Requires |
|---|---|---|
| `purchasing.sendRfq` | إرسال طلبات الأسعار للموردين | `requests.view`, `requests.viewSupplierNames` |
| `purchasing.price` | تسعير البنود وإرسالها للمهندس للاستلام | `requests.view`, `requests.viewPrices`, `requests.viewSupplierNames` |
| `purchasing.returnForEdit` | إرجاع الطلب للتعديل من المشتريات | `requests.view` |
| `purchasing.sendSupplyOrder` | إرسال أوامر التوريد | `requests.view`, `requests.viewSupplierNames` |
| `purchasing.handleRemaining` | التعامل مع البنود المتبقية | `requests.view`, `requests.viewPrices`, `requests.viewSupplierNames` |

### الاستلام
| Key | Label | Requires |
|---|---|---|
| `receipt.record` | تسجيل الاستلام | `requests.view` |
| `items.resolveExternally` | تعليم بند «اتحل من المهندس» | `requests.view` |

`pricing.approve` and `pricing.reject` were retired on 2026-11-25 with the pricing approval step (`retiredPermissionKeys` in the registry). The one-time direct-receipt migration removes them from stored roles with a signed audit row.

### التكويدات
| Key | Label | Requires |
|---|---|---|
| `masterData.view` | فتح صفحة التكويدات | — |
| `catalog.view` | تصفح الأصناف | — |
| `catalog.create` / `.edit` / `.delete` | إضافة وتعديل وإيقاف الأصناف | `masterData.view`, `catalog.view` |
| `catalogTree.view` / `.create` / `.edit` / `.delete` | الفئات والمجموعات | same pattern |
| `attributes.view` / `.create` / `.edit` / `.delete` | الخصائص | same pattern |
| `units.view` / `.create` / `.edit` / `.delete` | الوحدات | same pattern |
| `suppliers.view` / `.create` / `.edit` / `.delete` | الموردين | same pattern |
| `sites.view` / `.create` / `.edit` / `.delete` | المواقع | same pattern |

For the other master-data resources, `.view` requires `masterData.view`, and `.create` / `.edit` / `.delete` require `masterData.view` plus that resource's `.view`. `catalog.view` is the exception: it's also what lets an engineer browse the catalog when adding items, so it requires nothing. The engineer role holds `catalog.view` without `masterData.view`. Adding a «أخرى» item to the catalog requires `catalog.create`.

### التقارير والسجلات
| Key | Label |
|---|---|
| `reports.requestsOverview` | تقرير نظرة عامة على الطلبات |
| `reports.stageTimes` | تقرير زمن المراحل |
| `reports.spending` | تقرير الإنفاق |
| `reports.suppliers` | تقرير الموردين |
| `reports.priceHistory` | تقرير تاريخ أسعار الأصناف |
| `reports.unavailable` | تقرير البنود غير المتوفرة والمحلولة خارجيًا |
| `reports.userActivity` | تقرير نشاط المستخدمين |
| `records.view` | السجلات |
| `reports.export` | تصدير التقارير والسجلات إلى Excel |

All require `requests.view`. Price columns follow `requests.viewPrices`; supplier columns follow `requests.viewSupplierNames`.

### الإدارة
| Key | Label |
|---|---|
| `users.view` / `users.manage` | المستخدمين |
| `roles.view` / `roles.manage` | الأدوار والصلاحيات |
| `settings.manage` | الإعدادات |
| `data.import` / `data.export` | استيراد وتصدير البيانات |

### Superadmin only ✱
| Key | Label |
|---|---|
| `system.auditLog` ✱ | سجل المراجعة |
| `system.maintenance` ✱ | صيانة قاعدة البيانات |
| `system.superadmins` ✱ | إدارة حسابات الدعم الفني |

## Seed (first boot only, editable afterwards)

Create once, only if the roles table is empty. Afterwards the code never references them.

| Role | Scope | Keys |
|---|---|---|
| مهندس الموقع | ASSIGNED | requests.view, create, pause, editWhilePaused, viewTimeline, viewPrices, viewSupplierNames; receipt.record; items.resolveExternally; catalog.view |
| مدير الموقع | ASSIGNED | requests.view, approve, reject, returnForEdit, raiseUrgency, editQuantities, pause, editWhilePaused, viewTimeline, viewPrices, viewSupplierNames; catalog.view; reports.* except userActivity; records.view |
| مسؤول المشتريات | ALL | requests.view, viewTimeline, viewPrices, viewSupplierNames; purchasing.*; items.resolveExternally; catalog.view; suppliers.view; records.view |
| المحاسب | ALL | requests.view, viewTimeline, viewPrices, viewSupplierNames; reports.*; records.view; reports.export (follows every request, approves nothing) |
| صاحب الشركة | ALL | every non-✱ key under الطلبات, الاستلام, التقارير; masterData.view and all `*.view` |
| مدير النظام | ALL | users.*, roles.*, settings.manage, data.*, masterData.view and every master-data key, requests.view, records.view |

Also seed the five categories with suggested prefixes (كهربا ELC، صحي PLM، سيراميك CER، دهانات PNT، أوكر ومقابض HDW), a starter unit list (قطعة، متر، م²، م³، كرتونة، شيكارة، لتر، جالون، لفة، طقم، كيلو), and default settings.

## Frontend contract

- `useCan(key)` and `useCanOnSite(key, siteId)` hooks backed by the current user's effective keys, scope and site ids from `GET /api/v1/me`.
- A module registry in `packages/shared` (`{ id, label, description, icon, path, kind, anyOf: key[] }`, kinds: `operations`, `masterData`, `reports`, `admin`) drives hub tiles and route guards (DESIGN_SYSTEM §2.1). Routes declare `anyOf` keys; missing → "Access denied" page.
- `GET /api/v1/me` returns: user, role name (display only), `isSuperadmin`, `siteScope`, sites, `permissions: string[]`. Refetched quietly on navigation, at most every 10 s.
