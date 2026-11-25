import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

// The direct-receipt workflow end to end over HTTP: pricing drafts stay with purchasing, the final
// submission goes straight to the site engineer for receipt, and stakeholders can follow every
// stage from the first saved draft without gaining any action, hidden field or other site.
const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const api = request(app);
const db: PrismaClient = app.locals.db;
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type User = { id: number; cookie: string };
type Line = { id: number; state: string; [key: string]: unknown };
type Row = {
  id: number;
  version: number;
  status: string;
  displayedStage: string;
  items: Line[];
  availableActions: { action: string }[];
  [key: string]: unknown;
};
let east: number, west: number, nodeId: number, unitId: number;
let supplier: number;
let engineer: User,
  westEngineer: User,
  manager: User,
  buyer: User,
  sender: User,
  accountant: User,
  siteViewer: User,
  historian: User,
  westViewer: User;
const supplierName = 'مورد الحديد';

async function user(
  username: string,
  keys: PermissionKey[],
  sites: number[],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
) {
  const row = await makeUser(db, username, keys, scope, sites);
  const login = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return {
    id: row.id,
    cookie: String(login.headers['set-cookie']![0]).split(';')[0]!,
  };
}
beforeAll(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, ...defaultSettings } });
  east = (await db.site.create({ data: { name: 'شرق' } })).id;
  west = (await db.site.create({ data: { name: 'غرب' } })).id;
  const node = await db.catalogNode.create({
    data: {
      name: 'حديد',
      path: 'pending',
      depth: 0,
      sortOrder: 0,
      codePrefix: 'STL',
      iconKey: 'zap',
    },
  });
  nodeId = (
    await db.catalogNode.update({
      where: { id: node.id },
      data: { path: '/' + node.id + '/' },
    })
  ).id;
  unitId = (await db.unit.create({ data: { name: 'طن' } })).id;
  supplier = (
    await db.supplier.create({
      data: {
        name: supplierName,
        whatsappNumber: '201001234567',
        contactPerson: '',
        notes: '',
        categories: { create: { categoryId: nodeId } },
      },
    })
  ).id;
  const engineerKeys: PermissionKey[] = [
    'requests.create',
    'receipt.record',
    'items.resolveExternally',
  ];
  engineer = await user('site-engineer', engineerKeys, [east]);
  westEngineer = await user('west-engineer', engineerKeys, [west]);
  manager = await user(
    'site-manager',
    ['requests.approve', 'requests.returnForEdit'],
    [east],
  );
  buyer = await user('buyer', ['purchasing.price'], [], 'ALL');
  sender = await user(
    'order-sender',
    ['purchasing.sendSupplyOrder', 'purchasing.handleRemaining'],
    [],
    'ALL',
  );
  // Accounting and the owner follow every site, see prices and suppliers, and act on nothing.
  accountant = await user(
    'accountant',
    [
      'requests.viewTimeline',
      'requests.viewPrices',
      'requests.viewSupplierNames',
      'records.view',
    ],
    [],
    'ALL',
  );
  siteViewer = await user('site-viewer', ['requests.view'], [east]);
  historian = await user('historian', ['requests.viewTimeline'], [east]);
  westViewer = await user(
    'west-viewer',
    ['requests.viewTimeline', 'requests.viewPrices'],
    [west],
  );
});
afterAll(() => db.$disconnect());

function http(who: User, method: Method, path: string, body?: object) {
  const req = api[method]('/api/v1' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', who.cookie);
  return body ? req.send(body) : req;
}
const at = (r: Row, suffix = '') => '/requests/' + r.id + suffix;
async function act(
  who: User,
  r: Row,
  suffix: string,
  body: object = {},
  method: Method = 'post',
) {
  return (
    await http(who, method, at(r, suffix), {
      version: r.version,
      ...body,
    }).expect(200)
  ).body as Row;
}
const price = (r: Row, itemId: number, lineTotal: string) =>
  act(
    buyer,
    r,
    '/purchasing/items/' + itemId + '/pricing',
    { supplierId: supplier, lineTotal },
    'patch',
  );
async function listed(who: User, r: Row) {
  const page = (await http(who, 'get', '/requests?pageSize=100').expect(200))
    .body as { items: Row[] };
  return page.items.find((row) => row.id === r.id);
}
async function inQueue(who: User, queue: string, r: Row) {
  const inbox = (await http(who, 'get', '/inbox').expect(200)).body as {
    queues: { id: string; items: { id: number }[] }[];
  };
  return (
    inbox.queues
      .find((q) => q.id === queue)
      ?.items.some((row) => row.id === r.id) ?? false
  );
}
// Stakeholders open the list and the details at every stage, with no actions of their own.
async function followedBy(r: Row, stage: string) {
  for (const who of [accountant, siteViewer]) {
    expect(await listed(who, r)).toMatchObject({
      id: r.id,
      displayedStage: stage,
      availableActions: [],
    });
    const detail = (await http(who, 'get', at(r)).expect(200)).body as Row;
    expect(detail).toMatchObject({
      displayedStage: stage,
      availableActions: [],
    });
    expect(detail).not.toHaveProperty('returnReason');
  }
  // Another site's viewer and engineer never learn the request exists.
  for (const who of [westViewer, westEngineer]) {
    expect(await listed(who, r)).toBeUndefined();
    await http(who, 'get', at(r)).expect(404);
  }
  await http(westViewer, 'get', at(r, '/timeline')).expect(404);
}
const eventCount = (r: Row) =>
  db.requestEvent.count({ where: { requestId: r.id } });

it('follows one request from its first saved draft to completion, with receipt only by the site engineer', async () => {
  // Draft: visible to stakeholders from the moment it is first saved.
  const created = (
    await http(engineer, 'post', '/requests', {
      siteId: east,
      categoryId: nodeId,
    }).expect(201)
  ).body as Row;
  let r = await act(
    engineer,
    created,
    '/draft',
    {
      items: [1, 2].map((n) => ({
        nodeId,
        unitId,
        otherName: 'حديد تسليح ' + n,
        specs: '',
        quantity: '2',
      })),
    },
    'patch',
  );
  const [first, second] = r.items.map((item) => item.id) as [number, number];
  await followedBy(r, 'DRAFT');
  const timeline = (
    await http(accountant, 'get', at(r, '/timeline')).expect(200)
  ).body as { items: { type: string }[] };
  expect(timeline.items.map((e) => e.type)).toEqual(['CREATED']);
  // Viewing a draft grants no right to change it.
  await http(accountant, 'patch', at(r, '/draft'), {
    version: r.version,
    items: [],
  }).expect(403);
  await http(siteViewer, 'post', at(r, '/submit'), {
    version: r.version,
  }).expect(403);
  await http(accountant, 'delete', at(r), {
    version: r.version,
    confirm: true,
  }).expect(403);

  // Review steps before purchasing are unchanged.
  r = await act(engineer, r, '/submit');
  await followedBy(r, 'AWAITING_MANAGER');
  r = await act(manager, r, '/return', { reason: 'زوّد الكمية' });
  await followedBy(r, 'RETURNED');
  expect(
    ((await http(engineer, 'get', at(r)).expect(200)).body as Row).returnReason,
  ).toBe('زوّد الكمية');
  r = await act(engineer, r, '/resubmit');
  r = await act(manager, r, '/approve');
  await followedBy(r, 'AT_PURCHASING');

  // Saving a price is a quiet draft: the request stays in pricing.
  const before = await eventCount(r);
  const notified = () => db.notification.count({ where: { requestId: r.id } });
  const notifiedBefore = await notified();
  r = await price(r, first, '9000.50');
  expect(r).toMatchObject({
    status: 'AT_PURCHASING',
    displayedStage: 'AT_PURCHASING',
    items: [
      { state: 'OPEN', lineTotal: '9000.50' },
      { state: 'OPEN', lineTotal: null },
    ],
    rounds: [],
    supplyOrders: [],
  });
  expect(await eventCount(r)).toBe(before);
  expect(await notified()).toBe(notifiedBefore);
  expect(await db.catalogItemPrice.count({ where: { requestId: r.id } })).toBe(
    0,
  );
  expect(await inQueue(engineer, 'receipt', r)).toBe(false);
  await followedBy(r, 'AT_PURCHASING');
  // Only purchasing can price.
  for (const who of [accountant, engineer])
    await http(
      who,
      'patch',
      at(r, '/purchasing/items/' + second + '/pricing'),
      {
        version: r.version,
        supplierId: supplier,
        lineTotal: '1',
      },
    ).expect(403);

  // The final submission sends the priced line straight to the site engineer.
  r = await act(buyer, r, '/purchasing/submit-pricing');
  expect(r).toMatchObject({
    status: 'FULFILMENT',
    displayedStage: 'AWAITING_RECEIPT',
    items: [
      { id: first, state: 'AWAITING_RECEIPT', outstanding: '2.00' },
      // Unpriced lines stay with purchasing.
      { id: second, state: 'OPEN' },
    ],
    rounds: [{ number: 1, status: 'SUBMITTED', decidedBy: null }],
    supplyOrders: [{ number: 1, sentAt: null, items: [{ itemId: first }] }],
  });
  expect(r.availableActions.map((a) => a.action)).not.toContain(
    'approvePricing',
  );
  // The default supplier message announces an issued supply order, not an approval.
  const orders = (
    await http(sender, 'get', at(r, '/supply-orders')).expect(200)
  ).body as { items: { message: string }[] };
  expect(orders.items[0]!.message).toContain(
    'تم إصدار أمر توريد للطلب ' + String(r.number),
  );
  const sent = await db.requestEvent.findFirstOrThrow({
    where: { requestId: r.id, type: 'PRICING_SENT_FOR_RECEIPT' },
    include: { notifications: { orderBy: { userId: 'asc' } } },
  });
  expect(sent).toMatchObject({
    actorId: buyer.id,
    stageAfter: 'AWAITING_RECEIPT',
  });
  expect(sent.notifications.map((n) => n.userId)).toEqual(
    [engineer.id, sender.id].sort((a, b) => a - b),
  );
  expect(await inQueue(engineer, 'receipt', r)).toBe(true);
  expect(await inQueue(westEngineer, 'receipt', r)).toBe(false);
  await followedBy(r, 'AWAITING_RECEIPT');

  // Field-level permissions still hold for viewers.
  const full = (await http(accountant, 'get', at(r)).expect(200)).body as Row;
  expect(full.items[0]).toMatchObject({
    lineTotal: '9000.50',
    supplierName,
  });
  const bare = await http(siteViewer, 'get', at(r)).expect(200);
  expect(bare.text).not.toMatch(
    /9000\.5|مورد الحديد|201001234567|"(?:lineTotal|unitPrice|deliveryFee|supplierId|supplierName|roundTotal|message|waUrl)":/,
  );
  await http(siteViewer, 'get', at(r, '/timeline')).expect(403);
  await http(siteViewer, 'get', at(r, '/rounds/1')).expect(403);
  const redacted = await http(historian, 'get', at(r, '/timeline')).expect(200);
  expect(redacted.text).toContain('PRICING_SENT_FOR_RECEIPT');
  expect(redacted.text).not.toMatch(
    /9000\.5|"(?:lineTotal|roundTotal|supplierIds?|deliveryFee)":/,
  );

  // Pricing alone completes nothing: only receipt.record on this site confirms delivery.
  const receipt = (quantity: string, itemId = first) => ({
    version: r.version,
    lines: [{ itemId, quantity }],
  });
  for (const who of [accountant, siteViewer, buyer])
    await http(who, 'post', at(r, '/receipts'), receipt('2')).expect(403);
  await http(westEngineer, 'post', at(r, '/receipts'), receipt('2')).expect(
    404,
  );
  await http(engineer, 'post', at(r, '/receipts'), receipt('3')).expect(422);
  expect(await db.receipt.count({ where: { requestId: r.id } })).toBe(0);
  // A partial delivery leaves the rest with purchasing.
  r = (
    await http(engineer, 'post', at(r, '/receipts'), receipt('0.5')).expect(200)
  ).body;
  expect(r.items[0]).toMatchObject({
    state: 'REMAINING',
    receivedQty: '0.50',
    outstanding: '1.50',
  });
  r = await act(sender, r, '/items/' + first + '/still-coming');
  r = await price(r, second, '120');
  r = await act(buyer, r, '/purchasing/submit-pricing');
  expect(r.items.map((item) => item.state)).toEqual([
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
  ]);
  r = (
    await http(engineer, 'post', at(r, '/receipts'), {
      version: r.version,
      lines: [
        { itemId: first, quantity: '1.5' },
        { itemId: second, quantity: '2' },
      ],
    }).expect(200)
  ).body;
  expect(r).toMatchObject({
    status: 'COMPLETED',
    items: [{ state: 'RECEIVED' }, { state: 'RECEIVED' }],
  });
  for (const who of [accountant, siteViewer]) {
    expect(await listed(who, r)).toMatchObject({ status: 'COMPLETED' });
    await http(who, 'get', at(r)).expect(200);
  }
  await http(westViewer, 'get', at(r)).expect(404);
});

it('keeps another site’s drafts and requests out of an assigned viewer’s list and detail', async () => {
  const westDraft = (
    await http(westEngineer, 'post', '/requests', {
      siteId: west,
      categoryId: nodeId,
    }).expect(201)
  ).body as Row;
  expect(await listed(westViewer, westDraft)).toMatchObject({
    status: 'DRAFT',
  });
  expect(await listed(accountant, westDraft)).toMatchObject({
    status: 'DRAFT',
  });
  for (const who of [siteViewer, engineer, historian]) {
    expect(await listed(who, westDraft)).toBeUndefined();
    await http(who, 'get', at(westDraft)).expect(404);
  }
  const filtered = (
    await http(siteViewer, 'get', '/requests?siteId=' + west).expect(200)
  ).body;
  expect(filtered).toMatchObject({ items: [], total: 0 });
});
