import type { PrismaClient } from '@prisma/client';
import {
  normalizeArabic,
  maintenanceActions,
  type AuditProgress,
  type MaintenanceAction,
} from '@purchasing-plus/shared';
import { supportUi } from '@purchasing-plus/shared/i18n/ar';
import { registry } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { writeAudit } from '../access/audit.js';
import { bootstrap } from '../access/seed.js';

const now = new Date('2026-11-21T12:00:00Z');
const env = parseEnv(process.env);
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => now,
});
const db: PrismaClient = app.locals.db;
const origin = env.PUBLIC_ORIGIN;
const routes = request(app);
let root: string;
let rootId: number;

async function login(username: string, password: string) {
  const response = await routes
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ username, password })
    .expect(204);
  return String(response.headers['set-cookie']![0]).split(';')[0]!;
}

function system(
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  session = root,
) {
  return routes[method]('/api/v1/system/' + path)
    .set('Origin', origin)
    .set('Cookie', session);
}

function maintenance(
  action: MaintenanceAction,
  session = root,
  overrides = {},
) {
  return system('post', 'maintenance/' + action, session).send({
    phrase: supportUi.actions[action].phrase,
    password: env.SUPERADMIN_PASSWORD,
    ...overrides,
  });
}

beforeAll(async () => {
  await resetDb();
  await bootstrap(db, env);
  root = await login(env.SUPERADMIN_USERNAME, env.SUPERADMIN_PASSWORD);
  rootId = (await db.user.findFirstOrThrow({ where: { isSuperadmin: true } }))
    .id;
});
afterAll(() => db.$disconnect());

it('refuses every support route for an all-site account with every grantable key', async () => {
  const keys = registry
    .filter((permission) => !permission.superadminOnly)
    .map((permission) => permission.key);
  const account = await makeUser(db, 'all-grants', keys, 'ALL');
  expect(
    await db.rolePermission.count({ where: { roleId: account.roleId! } }),
  ).toBe(keys.length);
  const session = await login(account.username, testPassword);
  const supportRoutes = [
    ['get', 'audit-log'],
    ['get', 'audit-log/verify?ids=1'],
    ['get', 'superadmins'],
    ['post', 'superadmins'],
    ['patch', 'superadmins/' + rootId],
    ['post', 'superadmins/' + rootId + '/reset-password'],
  ] as const;
  for (const [method, path] of supportRoutes) {
    await system(method, path, '').expect(401);
    await system(method, path, session).expect(403);
  }
  for (const action of maintenanceActions) {
    await maintenance(action, '').expect(401);
    await maintenance(action, session).expect(403);
  }
  await system('patch', 'audit-log/1').expect(404);
  await system('delete', 'audit-log/1').expect(404);
});

it('paginates and filters audit records, flags tampering, and streams all batches', async () => {
  const actor = { id: rootId, name: 'الدعم', isSuperadmin: true };
  const valid = await db.$transaction((tx) =>
    writeAudit(
      tx,
      env.AUDIT_HMAC_SECRET,
      '127.0.0.1',
      actor,
      'fixture',
      'Site',
      1,
      { name: 'قبل' },
      { name: 'بعد', password: 'private' },
    ),
  );
  const identity = {
    actorId: valid.actorId,
    actorLabel: valid.actorLabel,
    createdAt: valid.createdAt,
    action: valid.action,
    entity: valid.entity,
    entityId: valid.entityId,
    ip: valid.ip,
    signature: valid.signature,
  };
  // Preserve the original signature on a row whose signed action has changed.
  const tampered = await db.auditLog.create({
    data: { ...identity, action: 'tampered' },
  });
  await db.auditLog.createMany({
    data: Array.from({ length: 251 }, () => identity),
  });

  const query = new URLSearchParams({
    userId: String(rootId),
    action: 'fixture',
    entity: 'Site',
    page: '2',
    pageSize: '2',
    from: valid.createdAt.toISOString(),
    to: valid.createdAt.toISOString(),
  });
  const page = await system('get', 'audit-log?' + query).expect(200);
  expect(page.body).toMatchObject({ total: 252, page: 2, pageSize: 2 });
  expect(page.body.items).toHaveLength(2);
  expect(page.body.items[0]).toMatchObject({
    actorLabel: 'الدعم (الدعم الفني)',
    verified: true,
  });
  expect(page.body.items[0]).not.toHaveProperty('signature');
  const status = await system(
    'get',
    'audit-log/verify?ids=' + valid.id + ',' + tampered.id,
  ).expect(200);
  expect(status.body.items).toEqual([
    { id: valid.id, verified: true },
    { id: tampered.id, verified: false },
  ]);
  await system('get', 'audit-log/verify?ids=xyz').expect(422);

  const total = await db.auditLog.count();
  const streamed = await maintenance('verify-audit-log')
    .expect(200)
    .expect('Content-Type', /x-ndjson/);
  const frames: AuditProgress[] = streamed.text
    .trim()
    .split('\n')
    .map((line: string) => JSON.parse(line));
  expect(frames[0]).toEqual({ total, checked: 0, mismatches: 0, done: false });
  expect(frames[1]).toMatchObject({ checked: 250, done: false });
  expect(frames.at(-1)).toEqual({
    total,
    checked: total,
    mismatches: 1,
    done: true,
  });
  expect(
    await db.auditLog.count({
      where: { action: 'maintenance.verify-audit-log', actorId: rootId },
    }),
  ).toBe(1);
});

async function operationalFixture() {
  const site = await db.site.create({ data: { name: 'موقع الاختبار' } });
  const category = await db.catalogNode.findFirstOrThrow({
    where: { parentId: null },
  });
  const unit = await db.unit.findFirstOrThrow();
  const attribute = await db.attributeDefinition.create({
    data: {
      name: 'درجة اللون',
      type: 'SELECT',
      options: { create: { label: 'أبيض', sortOrder: 1 } },
    },
    include: { options: true },
  });
  const catalogItem = await db.catalogItem.create({
    data: {
      name: 'إضاءة',
      code: 'P17-01',
      description: '',
      searchText: 'قديم',
      nodeId: category.id,
      unitId: unit.id,
      isActive: false,
      attributeValues: {
        create: {
          attributeId: attribute.id,
          optionId: attribute.options[0]!.id,
        },
      },
    },
  });
  const supplier = await db.supplier.create({
    data: {
      name: 'مورد',
      contactPerson: '',
      notes: '',
      whatsappNumber: '201001234567',
      categories: { create: { categoryId: category.id } },
    },
  });
  const operational = await db.request.create({
    data: {
      version: 1,
      status: 'FULFILMENT',
      displayedStage: 'AWAITING_RECEIPT',
      stageStartedAt: now,
      siteId: site.id,
      categoryId: category.id,
      createdById: rootId,
      urgency: 'NORMAL',
      urgencyLocked: false,
      isModified: false,
      items: {
        create: {
          lineNo: 1,
          catalogItemId: catalogItem.id,
          nodeId: category.id,
          snapshot: {},
          specs: '',
          quantity: '2.00',
          unitId: unit.id,
          state: 'AWAITING_RECEIPT',
          receivedQty: '0.00',
          needsRepricing: false,
          modifiedAfterSend: false,
          pickedAt: now,
        },
      },
      events: {
        create: [
          {
            type: 'old',
            at: now,
            payload: {},
            itemIds: [],
            stageAfter: 'AWAITING_RECEIPT',
          },
          {
            type: 'boundary',
            at: now,
            payload: {},
            itemIds: [],
            stageAfter: 'AWAITING_RECEIPT',
          },
        ],
      },
    },
    include: { items: true, events: true },
  });
  const itemId = operational.items[0]!.id;
  const requestId = operational.id;
  const supplierId = supplier.id;
  const money = { lineTotal: '10.00', quantity: '2.00' };
  const price = await db.catalogItemPrice.create({
    data: {
      itemId: catalogItem.id,
      supplierId,
      requestId,
      requestItemId: itemId,
      unitPrice: '5.00',
      source: 'APPROVED',
    },
  });
  await db.rfqBatch.create({
    data: {
      requestId,
      createdById: rootId,
      message: '',
      items: { create: { itemId } },
      suppliers: { create: { supplierId, message: '' } },
    },
  });
  await db.pricingRound.create({
    data: {
      requestId,
      number: 1,
      status: 'APPROVED',
      submittedAt: now,
      submittedById: rootId,
      items: {
        create: {
          itemId,
          lineNo: 1,
          supplierId,
          previousPriceId: price.id,
          ...money,
        },
      },
    },
  });
  await db.supplyOrder.create({
    data: {
      requestId,
      number: 1,
      supplierId,
      message: '',
      createdAt: now,
      items: { create: { itemId, lineNo: 1, ...money } },
    },
  });
  await db.receipt.create({
    data: {
      requestId,
      recordedById: rootId,
      recordedAt: now,
      lines: { create: { itemId, quantity: '1.00' } },
    },
  });
  await db.requestNumberSequence.create({ data: { year: 2026, lastValue: 1 } });
  await db.codeSequence.upsert({
    where: { categoryId: category.id },
    create: { categoryId: category.id, lastValue: 72 },
    update: { lastValue: 72 },
  });
  const cutoff = +now - 90 * 86_400_000;
  await db.notification.createMany({
    data: operational.events.map((event) => ({
      userId: rootId,
      requestId,
      eventId: event.id,
      createdAt: new Date(cutoff - Number(event.type === 'old')),
    })),
  });
  return catalogItem.id;
}

it('confirms and audits maintenance, purges by age, and resets exactly operational records', async () => {
  const catalogItemId = await operationalFixture();
  const operationalCounts = () =>
    Promise.all([
      db.request.count(),
      db.requestItem.count(),
      db.rfqBatch.count(),
      db.rfqBatchItem.count(),
      db.rfqBatchSupplier.count(),
      db.pricingRound.count(),
      db.pricingRoundItem.count(),
      db.supplyOrder.count(),
      db.supplyOrderItem.count(),
      db.receipt.count(),
      db.receiptLine.count(),
      db.requestEvent.count(),
      db.notification.count(),
      db.catalogItemPrice.count(),
      db.requestNumberSequence.count(),
    ]);
  const preserved = () =>
    Promise.all([
      db.user.findMany(),
      db.role.findMany(),
      db.rolePermission.findMany(),
      db.userSite.findMany(),
      db.site.findMany(),
      db.settings.findMany(),
      db.catalogNode.findMany(),
      db.catalogItem.findMany(),
      db.catalogItemAttributeValue.findMany(),
      db.attributeDefinition.findMany(),
      db.attributeOption.findMany(),
      db.unit.findMany(),
      db.supplier.findMany(),
      db.supplierCategory.findMany(),
      db.codeSequence.findMany(),
    ]);
  const initialCounts = await operationalCounts();
  const maintenanceCount = () =>
    db.auditLog.count({ where: { action: { startsWith: 'maintenance.' } } });
  const initialAudits = await maintenanceCount();
  expect(initialCounts.every((count) => count > 0)).toBe(true);
  for (const action of maintenanceActions) {
    await maintenance(action, root, { phrase: 'غير مطابق' }).expect(422);
    await maintenance(action, root, { password: 'wrong password' }).expect(403);
  }
  expect(await operationalCounts()).toEqual(initialCounts);
  expect(await maintenanceCount()).toBe(initialAudits);
  const purged = await maintenance('purge-notifications').expect(200);
  expect(purged.body).toEqual({ count: 1 });
  expect(await db.notification.count()).toBe(1);
  const rebuild = await maintenance('rebuild-catalog-search').expect(200);
  expect(rebuild.body).toEqual({ updated: 1 });
  expect(
    (await db.catalogItem.findUniqueOrThrow({ where: { id: catalogItemId } }))
      .searchText,
  ).toBe(normalizeArabic('إضاءة P17-01 أبيض'));
  expect(
    (await maintenance('rebuild-catalog-search').expect(200)).body,
  ).toEqual({ updated: 0 });

  const before = await preserved();
  const oldAudits = await db.auditLog.count();
  await maintenance('reset-operational-data').expect(200);
  expect(await operationalCounts()).toEqual(initialCounts.map(() => 0));
  expect(await preserved()).toEqual(before);
  expect(await db.auditLog.count()).toBe(oldAudits + 1);
  const audit = await system(
    'get',
    'audit-log?entity=System&action=maintenance.reset-operational-data',
  ).expect(200);
  expect(audit.body.items).toEqual([
    expect.objectContaining({ verified: true, actorId: rootId, newValue: {} }),
  ]);
  expect(await maintenanceCount()).toBe(initialAudits + 4);
});

it('manages support accounts, revokes sessions, and protects the last active account', async () => {
  const last = await system('patch', 'superadmins/' + rootId)
    .send({ isActive: false })
    .expect(409);
  expect(last.body.error).toBe('LAST_SUPERADMIN');
  await system('post', 'superadmins')
    .send({ username: 'second', name: 'دعم', password: 'short' })
    .expect(422);
  const created = await system('post', 'superadmins')
    .send({
      username: 'second',
      name: 'دعم',
      password: testPassword,
    })
    .expect(201);
  const id = created.body.id;
  const listed = await system('get', 'superadmins').expect(200);
  expect(listed.body.activeTotal).toBe(2);
  expect(listed.body.items).toContainEqual(
    expect.objectContaining({ id, roleId: null, isSuperadmin: true }),
  );
  const oldSession = await login('second', testPassword);
  const password = testPassword + '-replacement';
  await system('post', 'superadmins/' + id + '/reset-password')
    .send({ password })
    .expect(204);
  await system('get', 'superadmins', oldSession).expect(401);
  const newSession = await login('second', password);
  await system('patch', 'superadmins/' + id)
    .send({ isActive: false })
    .expect(200);
  await system('get', 'superadmins', newSession).expect(401);
  expect(
    (await system('get', 'superadmins').expect(200)).body.activeTotal,
  ).toBe(1);
});
