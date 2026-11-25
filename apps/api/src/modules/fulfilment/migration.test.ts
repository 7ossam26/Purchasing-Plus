import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import { sumAmounts } from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { verifyAudit } from '../access/audit.js';
import type { EventBus, LiveSignal } from '../events/bus.js';

import { describeMigration, migrateToDirectReceipt } from './migration.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const api = request(app);
const db: PrismaClient = app.locals.db;
type Method = 'get' | 'post' | 'patch' | 'put';
type User = { id: number; cookie: string };
let east: number, west: number, nodeId: number, unitId: number;
let catalogItemId: number, first: number, second: number;
let engineer: User,
  westEngineer: User,
  manager: User,
  buyer: User,
  sender: User,
  accountant: User;
let approverId: number, approverRoleId: number, engineerRoleId: number;
const migrated = new Date('2026-11-25T08:00:00Z');
const signals: LiveSignal[] = [];
const bus: EventBus = {
  publish: (signal) => signals.push(signal),
  subscribe: () => () => {},
};
const migrate = () =>
  migrateToDirectReceipt(db, {
    auditSecret: env.AUDIT_HMAC_SECRET,
    clock: () => migrated,
    eventBus: bus,
  });

async function login(username: string) {
  const res = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return String(res.headers['set-cookie']![0]).split(';')[0]!;
}
async function user(
  username: string,
  keys: PermissionKey[],
  sites: number[],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
) {
  const row = await makeUser(db, username, keys, scope, sites);
  return { id: row.id, cookie: await login(username) };
}
beforeAll(async () => {
  await resetDb();
  await db.settings.create({
    data: {
      id: 1,
      ...defaultSettings,
      supplyOrderIntro: 'توريد {requestNumber} إلى {siteName}:',
    },
  });
  east = (await db.site.create({ data: { name: 'شرق' } })).id;
  west = (await db.site.create({ data: { name: 'غرب' } })).id;
  const node = await db.catalogNode.create({
    data: {
      name: 'سباكة',
      path: 'pending',
      depth: 0,
      sortOrder: 0,
      codePrefix: 'PLM',
      iconKey: 'zap',
    },
  });
  nodeId = (
    await db.catalogNode.update({
      where: { id: node.id },
      data: { path: '/' + node.id + '/' },
    })
  ).id;
  unitId = (await db.unit.create({ data: { name: 'قطعة' } })).id;
  catalogItemId = (
    await db.catalogItem.create({
      data: {
        code: 'PLM-1',
        name: 'خلاط',
        unitId,
        nodeId,
        description: '',
        searchText: 'خلاط',
      },
    })
  ).id;
  const vendor = async (name: string, whatsappNumber: string) =>
    (
      await db.supplier.create({
        data: {
          name,
          whatsappNumber,
          contactPerson: '',
          notes: '',
          categories: { create: { categoryId: nodeId } },
        },
      })
    ).id;
  first = await vendor('الأول', '201001234567');
  second = await vendor('الثاني', '201101234567');
  engineer = await user(
    'engineer',
    ['requests.create', 'receipt.record'],
    [east],
  );
  engineerRoleId = (
    await db.user.findUniqueOrThrow({ where: { id: engineer.id } })
  ).roleId!;
  westEngineer = await user(
    'west-engineer',
    ['requests.create', 'receipt.record'],
    [west],
  );
  manager = await user(
    'manager',
    ['requests.approve', 'requests.cancelAnyStage'],
    [east],
  );
  buyer = await user('buyer', ['purchasing.price'], [], 'ALL');
  sender = await user('sender', ['purchasing.sendSupplyOrder'], [], 'ALL');
  accountant = await user(
    'accountant',
    ['requests.viewPrices', 'requests.viewSupplierNames'],
    [],
    'ALL',
  );
  // A role saved under the former approval step: the retired keys are still stored.
  const approver = await makeUser(
    db,
    'approver',
    ['requests.viewPrices'],
    'ALL',
  );
  approverId = approver.id;
  approverRoleId = approver.roleId!;
  await db.rolePermission.createMany({
    data: ['pricing.approve', 'pricing.reject'].map((key) => ({
      roleId: approverRoleId,
      key,
    })),
  });
});
afterAll(() => db.$disconnect());

function http(who: User, method: Method, path: string, body?: object) {
  const req = api[method]('/api/v1/requests' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', who.cookie);
  return body ? req.send(body) : req;
}
const fresh = async (id: number, who = engineer) =>
  (await http(who, 'get', '/' + id).expect(200)).body;
async function act(
  who: User,
  id: number,
  suffix: string,
  body: object = {},
  method: Method = 'post',
) {
  const { version } = await fresh(id);
  return (
    await http(who, method, '/' + id + suffix, { version, ...body }).expect(200)
  ).body;
}
const price = (id: number, itemId: number, supplierId: number, total: string) =>
  act(
    buyer,
    id,
    '/purchasing/items/' + itemId + '/pricing',
    { supplierId, lineTotal: total },
    'patch',
  );
// A request at purchasing with the given lines: a catalog line or an «أخرى» line each.
async function atPurchasing(lines: ('catalog' | 'other')[]) {
  const draft = (
    await http(engineer, 'post', '', {
      siteId: east,
      categoryId: nodeId,
    }).expect(201)
  ).body;
  await act(
    engineer,
    draft.id,
    '/draft',
    {
      items: lines.map((kind, n) => ({
        ...(kind === 'catalog'
          ? { catalogItemId }
          : { nodeId, unitId, otherName: 'بند ' + n }),
        specs: '',
        quantity: '2',
      })),
    },
    'patch',
  );
  await act(engineer, draft.id, '/submit');
  return act(manager, draft.id, '/approve');
}
// Persists a round exactly as the removed approval step left it: PENDING round and lines,
// AWAITING_APPROVAL items, the PRICING_SUBMITTED event and an unread approver notification.
async function legacySubmit(requestId: number) {
  const row = await db.request.findUniqueOrThrow({
    where: { id: requestId },
    include: { items: { orderBy: { lineNo: 'asc' } }, rounds: true },
  });
  const priced = row.items.filter(
    (i) => i.state === 'OPEN' && i.supplierId !== null && i.lineTotal !== null,
  );
  const number = row.rounds.length + 1;
  const lines = priced.map((i) => ({
    itemId: i.id,
    lineNo: i.lineNo,
    catalogItemId: i.catalogItemId,
    supplierId: i.supplierId!,
    lineTotal: i.lineTotal!.toFixed(2),
    quantity: (i.pricedQuantity ?? i.quantity).toFixed(2),
  }));
  const at = new Date('2026-11-20T09:00:00Z');
  await db.pricingRound.create({
    data: {
      requestId,
      number,
      status: 'PENDING',
      submittedAt: at,
      submittedById: buyer.id,
      deliveryFee: row.deliveryFee,
      items: { createMany: { data: lines } },
    },
  });
  await db.requestItem.updateMany({
    where: { id: { in: priced.map((i) => i.id) } },
    data: { state: 'AWAITING_APPROVAL' },
  });
  await db.request.update({
    where: { id: requestId },
    data: {
      status: 'FULFILMENT',
      displayedStage: 'AWAITING_APPROVAL',
      stageStartedAt: at,
      version: { increment: 1 },
    },
  });
  const event = await db.requestEvent.create({
    data: {
      requestId,
      type: 'PRICING_SUBMITTED',
      actorId: buyer.id,
      actorName: 'buyer',
      actorRoleName: 'buyer',
      at,
      itemIds: priced.map((i) => i.id),
      stageAfter: 'AWAITING_APPROVAL',
      payload: {
        roundNo: number,
        items: lines,
        roundTotal: sumAmounts(lines.map((l) => l.lineTotal)),
        deliveryFee: row.deliveryFee?.toFixed(2) ?? null,
      },
    },
  });
  await db.notification.create({
    data: { eventId: event.id, userId: approverId, requestId, createdAt: at },
  });
}
// A decision recorded by the former approval step, kept as history.
async function legacyDecision(
  requestId: number,
  number: number,
  type: 'PRICING_APPROVED' | 'PRICING_REJECTED',
  stageAfter: 'AWAITING_RECEIPT' | 'REMAINING',
) {
  const decidedAt = new Date('2026-11-18T10:00:00Z');
  await db.pricingRound.update({
    where: { requestId_number: { requestId, number } },
    data: {
      status: type === 'PRICING_APPROVED' ? 'APPROVED' : 'REJECTED',
      decidedAt,
      decidedById: approverId,
    },
  });
  await db.requestEvent.create({
    data: {
      requestId,
      type,
      actorId: approverId,
      actorName: 'approver',
      actorRoleName: 'المحاسب',
      at: decidedAt,
      itemIds: [],
      stageAfter,
      payload:
        type === 'PRICING_APPROVED'
          ? { roundNo: number }
          : { roundNo: number, reason: 'غالي' },
    },
  });
}
async function counts() {
  const [orders, events, notifications, prices, audits, read] =
    await Promise.all([
      db.supplyOrder.count(),
      db.requestEvent.count(),
      db.notification.count(),
      db.catalogItemPrice.count(),
      db.auditLog.count(),
      db.notification.count({ where: { readAt: { not: null } } }),
    ]);
  return { orders, events, notifications, prices, audits, read };
}

it('releases requests left waiting for approval once, preserving pricing, history and receipts', async () => {
  // History: round 1 submitted and approved, partly received; round 2 rejected; round 3 waiting.
  const history = await atPurchasing(['catalog', 'other', 'other']);
  const [h1, h2, h3] = history.items.map((i: { id: number }) => i.id);
  await price(history.id, h1, first, '40');
  await act(buyer, history.id, '/purchasing/items/' + h2 + '/unavailable');
  await act(buyer, history.id, '/purchasing/items/' + h3 + '/unavailable');
  await act(buyer, history.id, '/purchasing/submit-pricing');
  await legacyDecision(history.id, 1, 'PRICING_APPROVED', 'AWAITING_RECEIPT');
  await act(engineer, history.id, '/receipts', {
    lines: [{ itemId: h1, quantity: '1' }],
  });
  await price(history.id, h2, second, '70');
  const rejected = await db.requestItem.findUniqueOrThrow({
    where: { id: h2 },
  });
  await db.pricingRound.create({
    data: {
      requestId: history.id,
      number: 2,
      status: 'PENDING',
      submittedAt: new Date('2026-11-17T10:00:00Z'),
      submittedById: buyer.id,
      items: {
        create: {
          itemId: h2,
          lineNo: 2,
          supplierId: second,
          lineTotal: rejected.lineTotal!,
          quantity: rejected.quantity,
        },
      },
    },
  });
  await db.requestItem.update({
    where: { id: h2 },
    data: { state: 'REJECTED' },
  });
  await legacyDecision(history.id, 2, 'PRICING_REJECTED', 'REMAINING');
  await price(history.id, h3, second, '9.99');
  await legacySubmit(history.id);

  // Waiting: both lines priced and sent for the removed approval.
  const waiting = await atPurchasing(['catalog', 'other']);
  const [w1, w2] = waiting.items.map((i: { id: number }) => i.id);
  await price(waiting.id, w1, first, '50');
  await price(waiting.id, w2, second, '30');
  await act(
    buyer,
    waiting.id,
    '/purchasing/delivery-fee',
    { deliveryFee: '15' },
    'put',
  );
  await legacySubmit(waiting.id);

  // Cancelled while waiting: closed, so nothing is released.
  const cancelled = await atPurchasing(['other']);
  await price(cancelled.id, cancelled.items[0].id, first, '5');
  await legacySubmit(cancelled.id);
  await act(manager, cancelled.id, '/cancel', { reason: 'توقف' });

  const pending = await fresh(waiting.id);
  expect(pending).toMatchObject({
    displayedStage: 'AWAITING_APPROVAL',
    items: [{ state: 'AWAITING_APPROVAL' }, { state: 'AWAITING_APPROVAL' }],
    rounds: [{ status: 'PENDING' }],
  });
  // No approval or receipt action exists for a pending round until the migration runs.
  expect(
    pending.availableActions.map((a: { action: string }) => a.action),
  ).toEqual(['copyRequest']);
  const historyBefore = await fresh(history.id, accountant);
  const before = await counts();

  const outcome = await migrate();
  expect(outcome).toEqual({
    released: [history.id, waiting.id],
    skipped: [],
    notificationsRetired: 3,
    rolesUpdated: [approverRoleId],
  });
  expect(describeMigration(outcome)).toContain('released 2 request(s)');
  const afterMigration = await counts();
  // One supply order per supplier of each released round, one timeline event per request.
  expect(afterMigration.orders - before.orders).toBe(3);
  expect(afterMigration.events - before.events).toBe(2);
  expect(afterMigration.prices - before.prices).toBe(1);

  // Waiting request: now with the engineer for receipt, pricing intact.
  const released = await fresh(waiting.id, accountant);
  expect(released).toMatchObject({
    status: 'FULFILMENT',
    displayedStage: 'AWAITING_RECEIPT',
    stageStartedAt: migrated.toISOString(),
    version: pending.version + 1,
    deliveryFee: '15.00',
    items: [
      { id: w1, state: 'AWAITING_RECEIPT', lineTotal: '50.00' },
      { id: w2, state: 'AWAITING_RECEIPT', lineTotal: '30.00' },
    ],
    rounds: [
      {
        number: 1,
        status: 'SUBMITTED',
        decidedBy: null,
        decidedAt: null,
        roundTotal: '80.00',
        deliveryFee: '15.00',
      },
    ],
    supplyOrders: [
      { number: 1, supplier: { id: first }, items: [{ itemId: w1 }] },
      { number: 2, supplier: { id: second }, items: [{ itemId: w2 }] },
    ],
  });
  expect(
    (await fresh(waiting.id)).availableActions.map(
      (a: { action: string }) => a.action,
    ),
  ).toEqual(expect.arrayContaining(['recordReceipt']));
  const orders = await db.supplyOrder.findMany({
    where: { requestId: waiting.id },
    orderBy: { number: 'asc' },
  });
  expect(orders.map((o) => o.message)).toEqual([
    expect.stringContaining('توريد ' + released.number + ' إلى شرق:'),
    expect.stringContaining('توريد ' + released.number + ' إلى شرق:'),
  ]);
  expect(orders.every((o) => +o.createdAt === +migrated)).toBe(true);
  // The catalog price is recorded and the round compares against the price before it.
  const prices = await db.catalogItemPrice.findMany({
    where: { requestId: waiting.id },
  });
  expect(
    prices.map((p) => [p.source, p.unitPrice.toFixed(2), p.requestItemId]),
  ).toEqual([['SUBMITTED', '25.00', w1]]);
  const round = (
    await http(accountant, 'get', '/' + waiting.id + '/rounds/1').expect(200)
  ).body;
  expect(round.items[0]).toMatchObject({
    unitPrice: '25.00',
    lastPrice: { unitPrice: '20.00' },
    priceChange: { amount: '5.00', percent: '25.00' },
  });
  const event = await db.requestEvent.findFirstOrThrow({
    where: { requestId: waiting.id, type: 'PRICING_RELEASED' },
    include: { notifications: { orderBy: { userId: 'asc' } } },
  });
  expect(event).toMatchObject({
    actorId: null,
    actorName: null,
    actorRoleName: null,
    at: migrated,
    stageAfter: 'AWAITING_RECEIPT',
    itemIds: [w1, w2],
    payload: { roundNos: [1] },
  });
  // The engineer who asked and the site's receivers and order senders; never another site.
  expect(event.notifications.map((n) => n.userId)).toEqual(
    [engineer.id, sender.id].sort((a, b) => a - b),
  );
  expect(event.notifications.map((n) => n.userId)).not.toContain(
    westEngineer.id,
  );
  const audit = await db.auditLog.findFirstOrThrow({
    where: {
      action: 'request.releasePendingPricing',
      entityId: String(waiting.id),
    },
  });
  expect(audit.actorId).toBeNull();
  expect(verifyAudit(env.AUDIT_HMAC_SECRET, audit)).toBe(true);
  expect(signals).toEqual(
    expect.arrayContaining([
      { type: 'request.changed', requestId: waiting.id, siteId: east },
      { type: 'notification', userId: engineer.id },
      { type: 'notifications.read', userId: approverId },
    ]),
  );

  // History: approval decisions, rejected lines and recorded receipts are untouched.
  const kept = await fresh(history.id, accountant);
  expect(kept).toMatchObject({
    displayedStage: 'AWAITING_RECEIPT',
    items: [
      { id: h1, state: 'REMAINING', receivedQty: '1.00' },
      { id: h2, state: 'REJECTED' },
      { id: h3, state: 'AWAITING_RECEIPT', lineTotal: '9.99' },
    ],
    rounds: [
      {
        number: 1,
        status: 'APPROVED',
        decidedById: approverId,
        decidedAt: historyBefore.rounds[0].decidedAt,
        decidedBy: { id: approverId, roleName: 'المحاسب' },
      },
      { number: 2, status: 'REJECTED', reason: 'غالي' },
      { number: 3, status: 'SUBMITTED' },
    ],
    receipts: historyBefore.receipts,
    supplyOrders: [
      { number: 1, supplier: { id: first }, items: [{ itemId: h1 }] },
      { number: 2, supplier: { id: second }, items: [{ itemId: h3 }] },
    ],
  });
  expect(
    await db.requestEvent.count({
      where: {
        requestId: history.id,
        type: { in: ['PRICING_APPROVED', 'PRICING_REJECTED'] },
      },
    }),
  ).toBe(2);
  // Historically rejected lines can still be copied to a fresh draft.
  const copy = (
    await http(engineer, 'post', '/' + history.id + '/copy', {
      version: kept.version,
      itemIds: [h2],
    }).expect(201)
  ).body;
  expect(copy).toMatchObject({ status: 'DRAFT', items: [{ state: 'OPEN' }] });

  // Cancelled request: still closed with its round untouched.
  expect(await fresh(cancelled.id)).toMatchObject({
    status: 'CANCELLED',
    rounds: [{ status: 'PENDING' }],
    supplyOrders: [],
  });

  // Obsolete approval reminders are read, and roles drop only the retired keys.
  expect(
    await db.notification.count({
      where: { userId: approverId, readAt: null },
    }),
  ).toBe(0);
  const role = await db.rolePermission.findMany({
    where: { roleId: approverRoleId },
    select: { key: true },
  });
  expect(role.map((p) => p.key).sort()).toEqual([
    'requests.view',
    'requests.viewPrices',
  ]);
  const untouched = await db.rolePermission.findMany({
    where: { roleId: engineerRoleId },
    select: { key: true },
  });
  expect(untouched.map((p) => p.key).sort()).toEqual([
    'receipt.record',
    'requests.create',
    'requests.view',
  ]);
  const roleAudit = await db.auditLog.findFirstOrThrow({
    where: { action: 'role.retireKeys', entityId: String(approverRoleId) },
  });
  expect(roleAudit.newValue).toEqual({
    keys: ['requests.view', 'requests.viewPrices'],
  });
  expect(verifyAudit(env.AUDIT_HMAC_SECRET, roleAudit)).toBe(true);

  // A rerun finds nothing left and writes nothing.
  const after = await counts();
  signals.length = 0;
  const rerun = await migrate();
  expect(rerun).toEqual({
    released: [],
    skipped: [],
    notificationsRetired: 0,
    rolesUpdated: [],
  });
  expect(describeMigration(rerun)).toBe('');
  expect(await counts()).toEqual(after);
  expect(signals).toEqual([]);
  expect((await fresh(waiting.id)).version).toBe(released.version);

  // The engineer then confirms the actual delivery as usual.
  const done = await act(engineer, waiting.id, '/receipts', {
    lines: [
      { itemId: w1, quantity: '2' },
      { itemId: w2, quantity: '2' },
    ],
  });
  expect(done).toMatchObject({
    status: 'COMPLETED',
    items: [{ state: 'RECEIVED' }, { state: 'RECEIVED' }],
  });
});

it('skips a waiting request whose lines no longer await approval and changes nothing', async () => {
  const broken = await atPurchasing(['other']);
  await price(broken.id, broken.items[0].id, first, '7');
  await legacySubmit(broken.id);
  await db.requestItem.update({
    where: { id: broken.items[0].id },
    data: { state: 'OPEN' },
  });
  const before = await counts();
  const stored = await db.request.findUniqueOrThrow({
    where: { id: broken.id },
  });
  const outcome = await migrate();
  expect(outcome).toMatchObject({
    released: [],
    skipped: [{ requestId: broken.id, code: 'WRONG_ITEM_STATE' }],
  });
  expect(describeMigration(outcome)).toContain(
    '#' + broken.id + ' (WRONG_ITEM_STATE)',
  );
  // Only the approver's new reminder is retired; the request itself is untouched.
  expect((await counts()).orders).toBe(before.orders);
  expect((await counts()).events).toBe(before.events);
  expect(
    await db.request.findUniqueOrThrow({ where: { id: broken.id } }),
  ).toEqual(stored);
  expect(
    await db.pricingRound.findMany({
      where: { requestId: broken.id },
      select: { status: true },
    }),
  ).toEqual([{ status: 'PENDING' }]);
});
