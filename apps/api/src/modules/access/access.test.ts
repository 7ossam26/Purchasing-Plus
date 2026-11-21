import { createHmac } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import { validateRoleKeys } from '@purchasing-plus/shared/permissions';
import express from 'express';
import request from 'supertest';
import { beforeAll, afterAll, it, expect } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import {
  requireAnyPermission,
  requireSession,
  siteWhere,
} from '../../middleware/access.js';
import { errorHandler } from '../../middleware/errors.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

import { redact, verifyAudit } from './audit.js';
import { bootstrap } from './seed.js';
const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app),
  base = '/api/v1',
  origin = env.PUBLIC_ORIGIN;
type Method = 'get' | 'post' | 'patch' | 'delete';
function call(method: Method, path: string, session = '', body?: object) {
  const req = api[method](base + path)
    .set('Origin', origin)
    .set('Cookie', session);
  return body ? req.send(body) : req;
}
async function login(name: string, password = testPassword) {
  const r = await call('post', '/auth/login', '', {
    username: name,
    password,
  }).expect(204);
  const header = String(r.headers['set-cookie']![0]);
  expect(header).toContain('HttpOnly');
  expect(header).toContain('SameSite=Lax');
  expect(header).toContain('Max-Age=604800');
  return header.split(';')[0]!;
}
let root: string,
  manager: string,
  empty: string,
  ownRole: number,
  otherRole: number,
  uid: number,
  a: number,
  b: number;
beforeAll(async () => {
  await resetDb();
  await bootstrap(db, env);
  await bootstrap(db, env);
  expect(await db.role.count()).toBe(6);
  expect(await db.user.count()).toBe(1);
  for (const r of await db.role.findMany({ include: { permissions: true } }))
    expect(validateRoleKeys(r.permissions.map((p) => p.key)).valid).toBe(true);
  a = (await db.site.create({ data: { name: 'A' } })).id;
  b = (await db.site.create({ data: { name: 'B' } })).id;
  const m = await makeUser(
    db,
    'manager',
    [
      'users.manage',
      'users.view',
      'roles.manage',
      'roles.view',
      'sites.edit',
      'sites.create',
      'sites.delete',
    ],
    'ASSIGNED',
    [a],
  );
  uid = m.id;
  ownRole = m.roleId!;
  const u = await makeUser(db, 'empty', []);
  otherRole = u.roleId!;
  root = await login(env.SUPERADMIN_USERNAME, env.SUPERADMIN_PASSWORD);
  manager = await login('MANAGER');
  empty = await login('empty');
});
afterAll(() => db.$disconnect());
it('lets the seeded administrator assign a role and updates an existing session immediately', async () => {
  const administratorRole = await db.role.findFirstOrThrow({
    where: {
      siteScope: 'ALL',
      AND: ['roles.manage', 'users.manage', 'settings.manage'].map((key) => ({
        permissions: { some: { key } },
      })),
    },
  });
  const admin = (
    await call('post', '/users', root, {
      name: 'اختبار الإدارة',
      username: 'seeded-admin',
      password: testPassword,
      roleId: administratorRole.id,
    }).expect(201)
  ).body;
  const session = await login('seeded-admin');
  const role = (
    await call('post', '/roles', session, {
      name: 'متابعة المواقع',
      siteScope: 'ASSIGNED',
      keys: ['requests.view'],
    }).expect(201)
  ).body;
  const options = (await call('get', '/users/options', session).expect(200))
    .body;
  expect(options.roles).toContainEqual({
    id: role.id,
    name: role.name,
    siteScope: 'ASSIGNED',
    assignable: true,
  });
  expect(options.sites).toContainEqual({ id: a, name: 'A', isActive: true });
  const account = (
    await call('post', '/users', session, {
      name: 'اختبار الإسناد',
      username: 'site-assignee',
      password: testPassword,
      roleId: role.id,
      siteIds: [a],
    }).expect(201)
  ).body;
  const assignee = await login('site-assignee');
  const before = (await call('get', '/me', assignee).expect(200)).body;
  expect(before.permissions).toEqual(['requests.view']);
  await call('get', '/sites', assignee).expect(403);
  const rows = (
    await call(
      'get',
      '/users?roleId=' + role.id + '&siteId=' + a + '&active=true',
      session,
    ).expect(200)
  ).body;
  expect(rows.items).toEqual([
    expect.objectContaining({
      id: account.id,
      canManage: true,
      role: { name: role.name, siteScope: 'ASSIGNED' },
      sites: [{ siteId: a, name: 'A', isActive: true }],
    }),
  ]);
  await call('patch', '/roles/' + role.id, session, {
    keys: ['masterData.view', 'sites.view'],
  }).expect(200);
  expect(
    (await call('get', '/me', assignee).expect(200)).body.permissions,
  ).toEqual(expect.arrayContaining(['masterData.view', 'sites.view']));
  expect(
    (await call('get', '/sites', assignee).expect(200)).body.items.map(
      (site: { id: number }) => site.id,
    ),
  ).toEqual([a]);
  await call('delete', '/roles/' + role.id, session).expect(409);
  await call('patch', '/users/' + admin.id, session, { isActive: false })
    .expect(403)
    .expect((response) =>
      expect(response.body.fix).toEqual(expect.any(String)),
    );
});
it('checks session, origin, permission and validation at route boundaries', async () => {
  const routes: [Method, string][] = [
    ['get', '/users'],
    ['post', '/users'],
    ['patch', '/users/1'],
    ['post', '/users/1/reset-password'],
    ['get', '/roles'],
    ['get', '/roles/1'],
    ['post', '/roles'],
    ['patch', '/roles/1'],
    ['delete', '/roles/1'],
    ['get', '/roles/assignable-keys'],
    ['get', '/sites'],
    ['post', '/sites'],
    ['patch', '/sites/1'],
    ['delete', '/sites/1'],
    ['get', '/system/superadmins'],
    ['post', '/system/superadmins'],
    ['patch', '/system/superadmins/1'],
    ['post', '/system/superadmins/1/reset-password'],
    ['get', '/system/audit-log'],
  ];
  for (const [method, path] of routes) {
    await call(method, path).expect(401);
    await call(method, path, empty).expect(403);
    if (method !== 'get' || !path.includes('assignable-keys')) {
      const invalid =
        path.replace(/\/1($|\/)/, '/wrong$1') +
        (method === 'get' ? '?page=0' : '');
      await call(method, invalid, root, { unknown: true }).expect(422);
    }
  }
  for (const [method, path] of [
    ['post', '/auth/logout'],
    ['get', '/me'],
    ['post', '/me/password'],
  ] as const)
    await call(method, path).expect(401);
  await api
    .post(base + '/sites')
    .set('Cookie', root)
    .send({ name: 'x' })
    .expect(403);
  await api
    .post(base + '/auth/login')
    .set('Origin', 'https://invalid.example')
    .send({})
    .expect(403);
  await call('post', '/auth/login', '', {}).expect(422);
});
it('restricts site reads and writes and checks any-of permission', async () => {
  expect(
    (await call('get', '/sites', manager)).body.items.map(
      (x: { id: number }) => x.id,
    ),
  ).toEqual([a]);
  await call('patch', '/sites/' + b, manager, { address: 'B' }).expect(404);
  await call('patch', '/sites/' + a, manager, { address: 'A' }).expect(200);
  await makeUser(db, 'allsites', ['sites.edit'], 'ALL');
  const all = await login('allsites');
  await call('patch', '/sites/' + b, all, { address: 'B' }).expect(200);
  const site = (
    await call('post', '/sites', root, { name: 'extra' }).expect(201)
  ).body;
  await call('post', '/sites', root, { name: 'extra' }).expect(409);
  await call('delete', '/sites/' + site.id, root).expect(200);
  const probe = express();
  Object.assign(probe.locals, app.locals);
  probe.get(
    '/',
    requireSession,
    requireAnyPermission(['roles.manage', 'sites.view']),
    (r, s) => s.json(siteWhere(r.viewer)),
  );
  probe.use(errorHandler);
  await request(probe).get('/').set('Cookie', empty).expect(403);
  await request(probe)
    .get('/')
    .set('Cookie', manager)
    .expect(200, { siteId: { in: [a] } });
  await request(probe).get('/').set('Cookie', root).expect(200, {});
});
it('enforces role delegation and refreshes grants on the next request', async () => {
  const data = { name: 'custom', siteScope: 'ASSIGNED', keys: ['users.view'] };
  for (const keys of [['unknown'], ['sites.create'], ['system.auditLog']])
    await call('post', '/roles', root, { ...data, keys }).expect(422);
  await call('post', '/roles', manager, {
    ...data,
    keys: ['settings.manage'],
  }).expect(403);
  await call('post', '/roles', manager, { ...data, siteScope: 'ALL' }).expect(
    403,
  );
  await call('patch', '/roles/' + ownRole, manager, {
    name: 'forbidden',
  }).expect(403);
  const role = (await call('post', '/roles', manager, data).expect(201)).body;
  await call('get', '/roles/' + role.id, manager).expect(200);
  await call('delete', '/roles/' + role.id, manager).expect(204);
  await call('delete', '/roles/' + otherRole, manager).expect(409);
  const options = (
    await call('get', '/roles/assignable-keys', manager)
  ).body.map((r: { key: string }) => r.key);
  expect(options).toContain('users.view');
  expect(options).not.toContain('settings.manage');
  expect(options).not.toContain('system.auditLog');
  await call('patch', '/roles/' + otherRole, manager, {
    keys: ['users.view'],
  }).expect(200);
  expect((await call('get', '/me', empty)).body.permissions).toEqual([
    'users.view',
  ]);
  await call('get', '/users', empty).expect(200);
  await call('patch', '/roles/' + otherRole, manager, { keys: [] }).expect(200);
  await call('get', '/users', empty).expect(403);
});
it('protects account assignment, support accounts and session revocation', async () => {
  const data = {
    name: 'Person',
    username: 'person',
    password: testPassword,
    roleId: otherRole,
    siteIds: [a],
  };
  await call('post', '/users', manager, { ...data, siteIds: [b] }).expect(404);
  const privileged = await makeUser(db, 'high', ['settings.manage']);
  await call('post', '/users', manager, {
    ...data,
    roleId: privileged.roleId,
  }).expect(403);
  const row = (await call('post', '/users', manager, data).expect(201)).body;
  for (const patch of [
    { roleId: otherRole },
    { siteIds: [] },
    { isActive: false },
  ])
    await call('patch', '/users/' + uid, manager, patch).expect(403);
  await call('patch', '/users/' + uid, manager, { name: 'Display' }).expect(
    200,
  );
  expect(
    (
      await call(
        'get',
        '/users?siteId=' + a + '&search=Person&active=true&roleId=' + otherRole,
        manager,
      )
    ).body.total,
  ).toBe(1);
  expect(
    (await call('get', '/users', manager)).body.items.every(
      (u: { isSuperadmin: boolean }) => !u.isSuperadmin,
    ),
  ).toBe(true);
  let session = await login('person');
  await call('patch', '/users/' + row.id, manager, { isActive: false }).expect(
    200,
  );
  await call('get', '/me', session).expect(401);
  await call('patch', '/users/' + row.id, manager, { isActive: true }).expect(
    200,
  );
  session = await login('person');
  await call('post', '/users/' + row.id + '/reset-password', manager, {
    password: 'new-password',
  }).expect(204);
  await call('get', '/me', session).expect(401);
  const own = await login('person', 'new-password');
  await call('post', '/me/password', own, {
    currentPassword: 'wrong',
    newPassword: testPassword,
  }).expect(401);
  await call('post', '/me/password', own, {
    currentPassword: 'new-password',
    newPassword: testPassword,
  }).expect(204);
  await call('get', '/me', own).expect(401);
  const support = (await call('get', '/system/superadmins', root)).body
    .items[0];
  await call('patch', '/users/' + support.id, manager, { name: 'bad' }).expect(
    404,
  );
  await call('patch', '/system/superadmins/' + support.id, root, {
    isActive: false,
  }).expect(409);
  const second = (
    await call('post', '/system/superadmins', root, {
      name: 'Service',
      username: 'service',
      password: testPassword,
    }).expect(201)
  ).body;
  await call(
    'post',
    '/system/superadmins/' + second.id + '/reset-password',
    root,
    { password: 'updated-password' },
  ).expect(204);
  await call('patch', '/system/superadmins/' + second.id, root, {
    isActive: false,
  }).expect(200);
});
it('locks after five failures, unlocks after 15 minutes, expires idle sessions and logs out', async () => {
  const u = await makeUser(db, 'lock', []);
  const fail = (username: string, password: string) =>
    call('post', '/auth/login', '', { username, password }).expect(401);
  const unknown = await fail('nobody', 'bad');
  const start = Date.now();
  for (let i = 0; i < 5; i++)
    expect((await fail('lock', 'bad')).body).toEqual(unknown.body);
  const locked = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(locked.lockedUntil!.getTime()).toBeGreaterThanOrEqual(start + 900000);
  expect(locked.lockedUntil!.getTime()).toBeLessThanOrEqual(
    Date.now() + 900000,
  );
  await fail('lock', testPassword);
  await db.user.update({
    where: { id: u.id },
    data: { lockedUntil: new Date(Date.now() - 1) },
  });
  const session = await login('lock');
  await db.session.updateMany({
    where: { userId: u.id },
    data: { expiresAt: new Date(Date.now() + 60000) },
  });
  expect(
    (await call('get', '/me', session).expect(200)).headers['set-cookie']![0],
  ).toContain('Max-Age=604800');
  expect(
    (
      await db.session.findFirstOrThrow({ where: { userId: u.id } })
    ).expiresAt.getTime(),
  ).toBeGreaterThan(Date.now() + 6 * 86400000);
  await db.session.updateMany({
    where: { userId: u.id },
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  await call('get', '/me', session).expect(401);
  const fresh = await login('lock');
  await call('post', '/auth/logout', fresh).expect(204);
  await call('get', '/me', fresh).expect(401);
  expect(
    await db.auditLog.count({ where: { actorId: u.id, action: 'logout' } }),
  ).toBe(1);
});
it('verifies signed audit identities and recursively removes secrets', async () => {
  const auditUser = await makeUser(db, 'audit-test', []);
  const session = await login(auditUser.username);
  await call('post', '/me/password', session, {
    currentPassword: testPassword,
    newPassword: 'replacement',
  }).expect(204);
  const rows = (
    await call(
      'get',
      '/system/audit-log?action=user.password.change&userId=' + auditUser.id,
      root,
    ).expect(200)
  ).body.items;
  expect(rows).toHaveLength(1);
  expect(rows[0].verified).toBe(true);
  expect(rows[0].newValue).toEqual({
    currentPassword: '[REDACTED]',
    newPassword: '[REDACTED]',
  });
  const row = await db.auditLog.findFirstOrThrow({
    where: { actorId: auditUser.id, action: 'user.password.change' },
  });
  expect(verifyAudit(env.AUDIT_HMAC_SECRET, { ...row, actorId: null })).toBe(
    false,
  );
  expect(redact({ a: [{ apiToken: 'value', SECRET: 'value' }] })).toEqual({
    a: [{ apiToken: '[REDACTED]', SECRET: '[REDACTED]' }],
  });

  expect(
    redact({
      headers: { authorization: 'bearer', cookie: 'session' },
      DATABASE_URL: 'connection',
      apiKey: 'key',
    }),
  ).toEqual({
    headers: { authorization: '[REDACTED]', cookie: '[REDACTED]' },
    DATABASE_URL: '[REDACTED]',
    apiKey: '[REDACTED]',
  });
  expect(
    await db.session.count({
      where: {
        id: createHmac('sha256', env.SESSION_SECRET)
          .update(root.split('=')[1]!)
          .digest('hex'),
      },
    }),
  ).toBe(1);
});
it('preserves the last active support account during simultaneous deactivations', async () => {
  const rootId = (await call('get', '/me', root)).body.user.id;
  const second = (
    await call('post', '/system/superadmins', root, {
      username: 'second-race',
      name: 'Support',
      password: testPassword,
    })
  ).body.id;
  const secondCookie = await login('second-race');
  const attempts = await Promise.all([
    call('patch', '/system/superadmins/' + rootId, root, { isActive: false }),
    call('patch', '/system/superadmins/' + second, secondCookie, {
      isActive: false,
    }),
  ]);
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await db.user.count({ where: { isSuperadmin: true, isActive: true } }),
  ).toBe(1);
  if (attempts[0]!.status === 200) {
    await call('patch', '/system/superadmins/' + rootId, secondCookie, {
      isActive: true,
    }).expect(200);
    root = await login(env.SUPERADMIN_USERNAME, env.SUPERADMIN_PASSWORD);
    await call('patch', '/system/superadmins/' + second, root, {
      isActive: false,
    }).expect(200);
  }
});
it('limits repeated sign-in requests per client', async () => {
  const limited = createApp({ databaseUrl: testDatabaseUrl(), env });
  try {
    for (let i = 0; i < 40; i++)
      await request(limited)
        .post(base + '/auth/login')
        .set('Origin', origin)
        .send({})
        .expect(422);
    await request(limited)
      .post(base + '/auth/login')
      .set('Origin', origin)
      .send({})
      .expect(429);
  } finally {
    await limited.locals.db.$disconnect();
  }
});
it('ignores unknown and support-only keys stored on ordinary roles', async () => {
  const account = await makeUser(db, 'damaged', []);
  await db.rolePermission.createMany({
    data: ['system.auditLog', 'removed.key'].map((key) => ({
      roleId: account.roleId!,
      key,
    })),
  });
  const session = await login(account.username);
  expect((await call('get', '/me', session)).body.permissions).toEqual([]);
  await call('get', '/system/audit-log', session).expect(403);
  const options = (await call('get', '/users/options', root).expect(200)).body;
  expect(options.roles).toContainEqual(
    expect.objectContaining({
      id: account.roleId,
      assignable: false,
    }),
  );
});
it('paginates role counts and never exposes unassignable keys', async () => {
  const result = await call('get', '/roles?page=1&pageSize=2', manager).expect(
    200,
  );
  expect(result.body.items).toHaveLength(2);
  for (const row of result.body.items) {
    expect(row).toMatchObject({
      keyCount: expect.any(Number),
      userCount: expect.any(Number),
    });
    expect(row.keys).not.toContain('requests.viewPrices');
  }
});

it('sets production cookie and response protections on login and session renewal', async () => {
  const publicOrigin = 'https://purchasing.example';
  const production = createApp({
    databaseUrl: testDatabaseUrl(),
    env: { ...env, PUBLIC_ORIGIN: publicOrigin, NODE_ENV: 'production' },
  });
  try {
    const user = await makeUser(db, 'cookie-check', []);
    const login = await request(production)
      .post(base + '/auth/login')
      .set('Origin', publicOrigin)
      .send({ username: user.username, password: testPassword })
      .expect(204);
    const header = String(login.headers['set-cookie']![0]);
    const profile = await request(production)
      .get(base + '/me')
      .set('Cookie', header.split(';')[0]!)
      .expect(200);
    for (const res of [login, profile]) {
      const cookie = String(res.headers['set-cookie']![0]);
      for (const attr of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
        expect(cookie).toContain(attr);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']?.split(';')).toEqual(
        expect.arrayContaining([
          "default-src 'self'",
          "script-src 'self'",
          "object-src 'none'",
        ]),
      );
    }
  } finally {
    await production.locals.db.$disconnect();
  }
});
