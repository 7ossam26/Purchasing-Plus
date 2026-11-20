import {
  registry,
  isPermissionKey,
  validateRoleKeys,
} from '@purchasing-plus/shared/permissions';

import { forbidden, type Viewer } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Tx } from '../access/repo.js';

import { userHoldsRole, type RoleRow } from './repo.js';
export function assignable(v: Viewer) {
  return registry.filter(
    (p) => !p.superadminOnly && (v.isSuperadmin || v.permissions.has(p.key)),
  );
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
  if (
    !v.isSuperadmin &&
    ((scope === 'ALL' && v.siteScope !== 'ALL') ||
      keys.some((k) => !isPermissionKey(k) || !v.permissions.has(k)))
  )
    throw forbidden('لا يمكنك منح صلاحيات أو نطاق مواقع أوسع من صلاحياتك');
}
export function roleDto(r: RoleRow, v: Viewer) {
  const { permissions, _count, ...role } = r;
  const visible = new Set<string>(assignable(v).map((p) => p.key));
  return {
    ...role,
    keys: permissions.map((p) => p.key).filter((k) => visible.has(k)),
    userCount: _count.users,
    keyCount: permissions.length,
  };
}
export async function assertEditable(tx: Tx, v: Viewer, r: RoleRow) {
  if (v.isSuperadmin) return;
  if (await userHoldsRole(tx, v.userId, r.id))
    throw forbidden('لا يمكنك تعديل دورك الحالي');
  assertGrant(
    v,
    r.siteScope,
    r.permissions.map((p) => p.key),
  );
}
