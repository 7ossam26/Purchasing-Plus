import {
  registry,
  isPermissionKey,
  validateRoleKeys,
} from '@purchasing-plus/shared/permissions';

import { allowed, forbidden, type Viewer } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Tx } from '../access/repo.js';

import { userHoldsRole, type RoleRow } from './repo.js';
export function assignable(v: Viewer) {
  return registry.filter(
    (p) => !p.superadminOnly && (v.isSuperadmin || v.permissions.has(p.key)),
  );
}
function holdsGrant(v: Viewer, scope: string, keys: readonly string[]) {
  return (
    v.isSuperadmin ||
    ((scope !== 'ALL' || v.siteScope === 'ALL') &&
      keys.every((key) => isPermissionKey(key) && v.permissions.has(key)))
  );
}
export function canGrant(v: Viewer, scope: string, keys: readonly string[]) {
  return holdsGrant(v, scope, keys) && validateRoleKeys(keys).valid;
}
export function assertGrant(v: Viewer, scope: string, keys: string[]) {
  const validation = validateRoleKeys(keys);
  if (!validation.valid) {
    const reason = validation.unknown.length
      ? 'صلاحية غير معروفة'
      : validation.restricted.length
        ? 'صلاحية مخصصة للدعم الفني'
        : 'صلاحيات مطلوبة مفقودة';
    throw new AppError(
      422,
      'INVALID_KEYS',
      reason,
      'راجع الصلاحيات المتاحة ومتطلباتها قبل الحفظ',
    );
  }
  if (!holdsGrant(v, scope, keys))
    throw forbidden(
      'لا يمكنك منح صلاحيات أو نطاق مواقع أوسع من صلاحياتك',
      'اختار دورًا أو صلاحيات ونطاقًا في حدود صلاحيات حسابك.',
    );
}
export function roleDto(r: RoleRow, v: Viewer, ownRoleId?: number | null) {
  const { permissions, _count, ...role } = r;
  const visible = new Set<string>(assignable(v).map((p) => p.key));
  return {
    ...role,
    keys: permissions.map((p) => p.key).filter((k) => visible.has(k)),
    userCount: _count.users,
    keyCount: permissions.length,
    canEdit:
      allowed(v, 'roles.manage') &&
      (v.isSuperadmin ||
        (ownRoleId !== role.id &&
          canGrant(
            v,
            role.siteScope,
            permissions.map((p) => p.key),
          ))),
  };
}
export async function assertEditable(tx: Tx, v: Viewer, r: RoleRow) {
  if (v.isSuperadmin) return;
  if (await userHoldsRole(tx, v.userId, r.id))
    throw forbidden(
      'لا يمكنك تعديل دورك الحالي',
      'اطلب من مسؤول آخر تعديل الدور.',
    );
  assertGrant(
    v,
    r.siteScope,
    r.permissions.map((p) => p.key),
  );
}
