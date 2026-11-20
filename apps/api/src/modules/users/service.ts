import { hash } from '@node-rs/argon2';
import * as s from '@purchasing-plus/shared';

import {
  assertSiteInScope,
  forbidden,
  missing,
} from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import { roleById } from '../roles/repo.js';
import { assertGrant } from '../roles/service.js';

import {
  activeSiteCount,
  findAccount,
  insertAccount,
  activeSupportCount,
  saveAccount,
  findAccounts,
} from './repo.js';
async function grantRole(c: Context, id: number) {
  const role = await roleById(c.tx, id);
  assertGrant(
    c.viewer,
    role.siteScope,
    role.permissions.map((p) => p.key),
  );
}
async function grantSites(c: Context, ids: number[]) {
  for (const id of ids) assertSiteInScope(c.viewer, id);
  if ((await activeSiteCount(c.tx, ids)) !== new Set(ids).size)
    throw new AppError(422, 'INVALID_SITES', 'اختر مواقع نشطة موجودة');
}
async function target(c: Context, support: boolean) {
  const id = s.pathId.parse(c.req.params.id);
  const u = await findAccount(c.tx, id, support);
  if (!u) throw missing();
  if (!c.viewer.isSuperadmin) {
    await grantRole(c, u.roleId!);
    for (const site of u.sites) assertSiteInScope(c.viewer, site.siteId);
  }
  return u;
}
export async function createAccount(c: Context, support: boolean) {
  const data = support
    ? s.createSupport.parse(c.req.body)
    : s.createUser.parse(c.req.body);
  const grants =
    'roleId' in data ? (data as ReturnType<typeof s.createUser.parse>) : null;
  if (grants) {
    await grantRole(c, grants.roleId);
    await grantSites(c, grants.siteIds);
  }
  const row = await insertAccount(c.tx, {
    name: data.name,
    username: data.username,
    passwordHash: await hash(data.password),
    isSuperadmin: support,
    roleId: grants?.roleId,
    sites: {
      create: [...new Set(grants?.siteIds)].map((siteId) => ({ siteId })),
    },
  });
  await c.audit('user.create', 'User', row.id, null, row);
  return row;
}
export async function updateAccount(c: Context, support: boolean) {
  const old = await target(c, support);
  const { roleId, siteIds, ...fields } = support
    ? {
        ...s.editSupport.parse(c.req.body),
        roleId: undefined,
        siteIds: undefined,
      }
    : s.editUser.parse(c.req.body);
  if (
    !c.viewer.isSuperadmin &&
    old.id === c.viewer.userId &&
    (siteIds || roleId || fields.isActive !== undefined)
  )
    throw forbidden('لا يمكنك تغيير دورك أو مواقعك أو حالة حسابك');
  if (roleId) await grantRole(c, roleId);
  if (siteIds) await grantSites(c, siteIds);
  if (
    support &&
    old.isActive &&
    fields.isActive === false &&
    (await activeSupportCount(c.tx)) <= 1
  )
    throw new AppError(
      409,
      'LAST_SUPERADMIN',
      'يجب إبقاء حساب دعم فني نشط واحد على الأقل',
    );
  const row = await saveAccount(c.tx, old.id, {
    ...fields,
    roleId,
    updatedAt: new Date(Math.max(Date.now(), old.updatedAt.getTime() + 1)),
    sites: siteIds
      ? {
          deleteMany: {},
          create: [...new Set(siteIds)].map((siteId) => ({ siteId })),
        }
      : undefined,
    sessions: fields.isActive === false ? { deleteMany: {} } : undefined,
  });
  await c.audit('user.update', 'User', row.id, old, row);
  return row;
}
export async function resetAccount(c: Context, support: boolean) {
  const { password } = s.resetPassword.parse(c.req.body);
  const old = await target(c, support);
  if (old.id === c.viewer.userId)
    throw forbidden('لتغيير كلمة مرورك استخدم صفحة حسابك');
  await saveAccount(c.tx, old.id, {
    passwordHash: await hash(password),
    sessions: { deleteMany: {} },
    failedAttempts: 0,
    lockedUntil: null,
  });
  await c.audit('user.password.reset', 'User', old.id, null, { password });
  return null;
}
export async function listAccounts(c: Context, support: boolean) {
  const { page, pageSize, roleId, siteId, search, active } =
    s.userFilters.parse(c.req.query);
  if (siteId) assertSiteInScope(c.viewer, siteId);
  const where = {
    isSuperadmin: support ? true : c.viewer.isSuperadmin ? undefined : false,
    isActive: active,
    roleId,
    sites: siteId ? { some: { siteId } } : undefined,
    OR: search
      ? [
          { name: { contains: search, mode: 'insensitive' as const } },
          { username: { contains: search, mode: 'insensitive' as const } },
        ]
      : undefined,
  };
  const { items, total } = await findAccounts(c.tx, where, page, pageSize);
  return {
    items: items.map((u) => ({
      ...u,
      sites: u.sites.filter(
        (s) =>
          c.viewer.siteScope === 'ALL' || c.viewer.siteIds.includes(s.siteId),
      ),
    })),
    total,
    page,
    pageSize,
  };
}
