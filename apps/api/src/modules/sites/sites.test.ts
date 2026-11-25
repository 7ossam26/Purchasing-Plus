import type { PrismaClient } from '@prisma/client';
import { admin } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app);
const errors = admin.siteManager.errors;
type Method = 'get' | 'post' | 'patch' | 'delete';
type Account = { id: number; cookie: string };
type Engineer = { id: number; name: string; canManage?: boolean };

let east: number, west: number, north: number;
let manager: Account,
  scoped: Account,
  sitesOnly: Account,
  usersOnly: Account,
  selfManaging: Account,
  support: Account;
let first: number,
  second: number,
  third: number,
  dormant: number,
  privileged: number,
  allScope: number,
  approver: number;

const engineerKeys: PermissionKey[] = ['requests.create'];
const siteKeys: PermissionKey[] = ['sites.view', 'sites.create', 'sites.edit'];
async function account(
  username: string,
  keys: PermissionKey[],
  sites: number[] = [],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
) {
  return (await makeUser(db, username, keys, scope, sites)).id;
}
async function login(
  username: string,
  keys: PermissionKey[],
  sites: number[] = [],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
): Promise<Account> {
  const id = await account(username, keys, sites, scope);
  const res = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return { id, cookie: String(res.headers['set-cookie']![0]).split(';')[0]! };
}
function call(method: Method, path: string, user: Account, body?: object) {
  const req = api[method]('/api/v1/sites' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', user.cookie);
  return body ? req.send(body) : req;
}
async function sitesOf(userId: number) {
  return (
    await db.userSite.findMany({
      where: { userId },
      orderBy: { siteId: 'asc' },
    })
  ).map(({ siteId }) => siteId);
}
async function usersAt(siteId: number) {
  return (
    await db.userSite.findMany({
      where: { siteId },
      orderBy: { userId: 'asc' },
    })
  ).map(({ userId }) => userId);
}
const ids = (items: { id: number }[]) => items.map(({ id }) => id);
const lastAudit = (action: string, entityId: number) =>
  db.auditLog.findFirstOrThrow({
    where: { action, entityId: String(entityId) },
    orderBy: { id: 'desc' },
  });

beforeAll(async () => {
  await resetDb();
  east = (await db.site.create({ data: { name: 'شرق' } })).id;
  west = (await db.site.create({ data: { name: 'غرب' } })).id;
  north = (await db.site.create({ data: { name: 'شمال' } })).id;
  first = await account('eng-first', engineerKeys, [east, west]);
  second = await account('eng-second', engineerKeys);
  third = await account('eng-third', engineerKeys, [east]);
  dormant = await account('eng-dormant', engineerKeys, [east]);
  await db.user.update({ where: { id: dormant }, data: { isActive: false } });
  privileged = await account(
    'eng-privileged',
    [...engineerKeys, 'requests.cancelAnyStage'],
    [east],
  );
  allScope = await account('eng-all', engineerKeys, [], 'ALL');
  approver = await account('site-approver', ['requests.approve'], [east]);
  manager = await login(
    'site-admin',
    [...siteKeys, 'users.manage', ...engineerKeys],
    [],
    'ALL',
  );
  scoped = await login(
    'site-admin-east',
    [...siteKeys, 'users.manage', ...engineerKeys],
    [east],
  );
  sitesOnly = await login('site-editor', siteKeys, [], 'ALL');
  usersOnly = await login(
    'user-admin',
    ['users.manage', ...engineerKeys],
    [],
    'ALL',
  );
  selfManaging = await login(
    'eng-admin',
    [...siteKeys, 'users.manage', ...engineerKeys],
    [east],
  );
  support = await login('site-support', [], [], 'ALL');
  await db.user.update({
    where: { id: support.id },
    data: { isSuperadmin: true, roleId: null },
  });
});
afterAll(() => db.$disconnect());

it('creates a site with engineers in one transaction and audits the assignment', async () => {
  const site = (
    await call('post', '', manager, {
      name: 'الجنوب',
      address: 'شارع التسعين',
      engineerIds: [second, first],
    }).expect(201)
  ).body;
  expect(site).toMatchObject({ name: 'الجنوب', isActive: true });
  expect(await usersAt(site.id)).toEqual([first, second].sort((a, b) => a - b));
  // Joining the new site leaves the engineer's existing assignments in place.
  expect(await sitesOf(first)).toEqual([east, west, site.id]);
  const audit = await lastAudit('site.create', site.id);
  expect(audit.newValue).toMatchObject({
    name: 'الجنوب',
    engineerIds: [first, second].sort((a, b) => a - b),
  });
  // Without engineers the body and the audit keep their original shape.
  const plain = (
    await call('post', '', sitesOnly, { name: 'بدون مهندسين' }).expect(201)
  ).body;
  expect(await usersAt(plain.id)).toEqual([]);
  expect(
    (await lastAudit('site.create', plain.id)).newValue,
  ).not.toHaveProperty('engineerIds');
});

it('rolls the new site back when any assignment is refused', async () => {
  const secondBefore = await sitesOf(second);
  const cases: [number[], number, string][] = [
    [[second, privileged], 403, 'FORBIDDEN'],
    [[second, approver], 422, 'INVALID_ENGINEERS'],
    [[second, dormant], 422, 'INVALID_ENGINEERS'],
    [[second, allScope], 422, 'INVALID_ENGINEERS'],
    [[second, support.id], 422, 'INVALID_ENGINEERS'],
    [[second, 999999], 422, 'INVALID_ENGINEERS'],
  ];
  for (const [engineerIds, status, code] of cases) {
    const res = await call('post', '', manager, {
      name: 'مرفوض',
      engineerIds,
    }).expect(status);
    expect(res.body.error).toBe(code);
  }
  expect(await db.site.count({ where: { name: 'مرفوض' } })).toBe(0);
  expect(await sitesOf(second)).toEqual(secondBefore);
  const refused = await call('post', '', manager, {
    name: 'مرفوض',
    engineerIds: [privileged],
  }).expect(403);
  expect(refused.body).toMatchObject({
    message: errors.engineerForbidden,
    fix: errors.engineerForbiddenFix,
  });
});

it('adds and removes engineers on one site and preserves every other assignment', async () => {
  const before = await usersAt(east);
  expect(before).toEqual(
    expect.arrayContaining([first, third, dormant, privileged, approver]),
  );
  const edited = (
    await call('patch', '/' + east, manager, {
      address: 'العنوان الجديد',
      engineers: { add: [second], remove: [first, dormant] },
    }).expect(200)
  ).body;
  expect(edited.address).toBe('العنوان الجديد');
  // Only this site's rows changed. The removed engineer keeps west, and others stay put.
  expect(await sitesOf(first)).not.toContain(east);
  expect(await sitesOf(first)).toContain(west);
  expect(await sitesOf(second)).toContain(east);
  expect(await sitesOf(dormant)).toEqual([]);
  // The non-engineer assignment (approver) is untouched by the engineer changes.
  expect(await usersAt(east)).toEqual(
    before
      .filter((id) => id !== first && id !== dormant)
      .concat(second)
      .sort((a, b) => a - b),
  );
  const audit = await lastAudit('site.update', east);
  const engineersBefore = (audit.oldValue as { engineerIds: number[] })
    .engineerIds;
  expect(engineersBefore).toEqual(
    before.filter((id) => id !== approver).sort((a, b) => a - b),
  );
  expect((audit.newValue as { engineerIds: number[] }).engineerIds).toEqual(
    engineersBefore
      .filter((id) => id !== first && id !== dormant)
      .concat(second)
      .sort((a, b) => a - b),
  );
  expect(audit.newValue).toMatchObject({ address: 'العنوان الجديد' });
  // Repeating the same change is harmless and leaves the assignments unchanged.
  const snapshot = await usersAt(east);
  await call('patch', '/' + east, manager, {
    engineers: { add: [second], remove: [first, dormant] },
  }).expect(200);
  expect(await usersAt(east)).toEqual(snapshot);
  // Restore the starting point for the later tests.
  await call('patch', '/' + east, manager, {
    engineers: { add: [first], remove: [second] },
  }).expect(200);
});

it('lists current engineers with manageability and candidates within the viewer’s grant', async () => {
  const current: Engineer[] = (
    await call('get', '/' + east + '/engineers', manager).expect(200)
  ).body.items;
  expect(ids(current)).toEqual(
    expect.arrayContaining([first, third, privileged]),
  );
  expect(ids(current)).not.toContain(approver);
  expect(current.find(({ id }) => id === privileged)?.canManage).toBe(false);
  expect(current.find(({ id }) => id === first)?.canManage).toBe(true);
  const options = (await call('get', '/engineers', manager).expect(200)).body;
  expect(ids(options.items)).toEqual(
    expect.arrayContaining([first, second, third]),
  );
  for (const hidden of [privileged, dormant, allScope, approver, support.id])
    expect(ids(options.items)).not.toContain(hidden);
  expect(options.items.find(({ id }: Engineer) => id === first).sites).toEqual(
    expect.arrayContaining([
      { id: east, name: 'شرق' },
      { id: west, name: 'غرب' },
    ]),
  );
  const searched = (
    await call('get', '/engineers?search=SECOND', manager).expect(200)
  ).body;
  expect(ids(searched.items)).toEqual([second]);
  const paged = (
    await call('get', '/engineers?pageSize=1&page=2', manager).expect(200)
  ).body;
  expect(paged).toMatchObject({ page: 2, pageSize: 1, total: options.total });
  expect(paged.items).toHaveLength(1);
  // The superadmin can manage every engineer, including higher-privileged ones.
  const all = (await call('get', '/engineers', support).expect(200)).body;
  expect(ids(all.items)).toContain(privileged);
  await call('patch', '/' + west, support, {
    engineers: { add: [privileged], remove: [] },
  }).expect(200);
  expect(await sitesOf(privileged)).toEqual([east, west]);
});

it('requires users.manage and a site write key, and keeps site scope', async () => {
  await call('post', '', sitesOnly, {
    name: 'بدون صلاحية',
    engineerIds: [second],
  }).expect(403);
  expect(await db.site.count({ where: { name: 'بدون صلاحية' } })).toBe(0);
  await call('patch', '/' + north, sitesOnly, {
    engineers: { add: [second], remove: [] },
  }).expect(403);
  await call('patch', '/' + north, sitesOnly, { address: 'مسموح' }).expect(200);
  await call('get', '/engineers', sitesOnly).expect(403);
  await call('get', '/engineers', usersOnly).expect(403);
  await call('get', '/' + east + '/engineers', sitesOnly).expect(403);
  // An assigned-scope viewer reaches only its own sites and engineers within them.
  await call('patch', '/' + west, scoped, {
    engineers: { add: [second], remove: [] },
  }).expect(404);
  await call('get', '/' + west + '/engineers', scoped).expect(404);
  // Engineers holding any site outside the viewer's scope are not offered.
  const scopedOptions = ids(
    (await call('get', '/engineers', scoped).expect(200)).body.items,
  );
  expect(await sitesOf(third)).toEqual([east]);
  expect(scopedOptions).toContain(third);
  for (const hidden of [first, second, scoped.id])
    expect(scopedOptions).not.toContain(hidden);
  const outside = await call('patch', '/' + east, scoped, {
    engineers: { add: [], remove: [first] },
  }).expect(403);
  expect(outside.body.message).toBe(errors.engineerForbidden);
  expect(await sitesOf(first)).toContain(east);
  // A new site is outside an assigned-scope viewer's reach, so assigning on creation is refused.
  const created = await call('post', '', scoped, {
    name: 'خارج النطاق',
    engineerIds: [second],
  }).expect(403);
  expect(created.body.message).toBe(errors.siteOutOfScope);
  expect(await db.site.count({ where: { name: 'خارج النطاق' } })).toBe(0);
});

it('refuses changes to the viewer’s own sites', async () => {
  expect(
    ids((await call('get', '/engineers', selfManaging).expect(200)).body.items),
  ).not.toContain(selfManaging.id);
  const own = await call('patch', '/' + east, selfManaging, {
    engineers: { add: [], remove: [selfManaging.id] },
  }).expect(403);
  expect(own.body).toMatchObject({
    message: errors.ownSites,
    fix: errors.ownSitesFix,
  });
  expect(await sitesOf(selfManaging.id)).toEqual([east]);
});

it('allows removals but not additions on an inactive site', async () => {
  await call('patch', '/' + north, manager, {
    engineers: { add: [second], remove: [] },
  }).expect(200);
  await call('delete', '/' + north, manager).expect(403);
  expect(
    (await call('delete', '/' + north, support).expect(200)).body.isActive,
  ).toBe(false);
  const added = await call('patch', '/' + north, manager, {
    engineers: { add: [third], remove: [] },
  }).expect(422);
  expect(added.body.error).toBe('INACTIVE_SITE');
  await call('patch', '/' + north, manager, {
    engineers: { add: [], remove: [second] },
  }).expect(200);
  expect(await usersAt(north)).toEqual([]);
});

it('validates engineer changes', async () => {
  for (const body of [
    { engineers: { add: [second, second], remove: [] } },
    { engineers: { add: [second], remove: [second] } },
    { engineers: { add: ['x'], remove: [] } },
    { engineers: { add: [], remove: [], extra: true } },
    { engineers: { add: Array.from({ length: 201 }, (_, i) => i + 1) } },
  ])
    await call('patch', '/' + east, manager, body).expect(422);
  await call('post', '', manager, {
    name: 'مكرر',
    engineerIds: [second, second],
  }).expect(422);
  await call('get', '/engineers?pageSize=500', manager).expect(422);
  await call('get', '/' + east + '/engineers?x=1', manager).expect(422);
  await call('get', '/999999/engineers', manager).expect(404);
  await call('patch', '/' + east, manager, {
    engineers: { add: [approver], remove: [] },
  }).expect(422);
});
