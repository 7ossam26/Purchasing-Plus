import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const api = request(app);
const db: PrismaClient = app.locals.db;
const root = '/api/v1/requests';
type Method = 'get' | 'post' | 'patch' | 'put';
type User = { id: number; cookie: string };
type Row = { id: number; version: number; items: { id: number }[] };
let siteId: number,
  nodeId: number,
  unitId: number,
  supplier: number,
  alternate: number;
let maker: User,
  worker: User,
  accountant: User,
  receiver: User,
  sender: User,
  outsider: User,
  reader: User;
const keys: PermissionKey[] = [
  'requests.approve',
  'purchasing.price',
  'receipt.record',
  'purchasing.handleRemaining',
  'purchasing.sendSupplyOrder',
  'items.resolveExternally',
  'requests.cancelAnyStage',
  'requests.returnForEdit',
  'requests.pause',
  'requests.viewTimeline',
  'catalog.view',
];
async function user(username: string, keys: PermissionKey[], ids: number[]) {
  const row = await makeUser(db, username, keys, 'ASSIGNED', ids);
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
  await db.settings.create({
    data: {
      id: 1,
      ...defaultSettings,
      supplyOrderIntro:
        '{requestNumber} {siteName} {siteAddress} {categoryName}',
    },
  });
  siteId = (
    await db.site.create({ data: { name: 'الموقع', address: 'شارع 12' } })
  ).id;
  const foreign = await db.site.create({ data: { name: 'الغرب' } });
  nodeId = (
    await db.catalogNode.create({
      data: {
        name: 'تشطيبات',
        path: '/',
        depth: 0,
        sortOrder: 0,
        codePrefix: 'FIN',
        iconKey: 'zap',
      },
    })
  ).id;
  await db.catalogNode.update({
    where: { id: nodeId },
    data: { path: '/' + nodeId + '/' },
  });
  unitId = (await db.unit.create({ data: { name: 'متر' } })).id;
  async function vendor(name: string, whatsappNumber: string) {
    return (
      await db.supplier.create({
        data: { name, whatsappNumber, contactPerson: '', notes: '' },
      })
    ).id;
  }
  supplier = await vendor('الأول', '201001234567');
  alternate = await vendor('الثاني', '201101234567');
  maker = await user('creator', ['requests.create'], [siteId]);
  worker = await user('worker', keys, [siteId]);
  // Follows prices without supplier names and has no workflow keys.
  accountant = await user(
    'accountant',
    ['requests.viewPrices', 'catalog.view'],
    [siteId],
  );
  receiver = await user('receiver', ['receipt.record'], [siteId]);
  sender = await user(
    'sender',
    ['purchasing.sendSupplyOrder', 'purchasing.handleRemaining'],
    [siteId],
  );
  outsider = await user('outside', keys, [foreign.id]);
  reader = await user('reader', ['requests.view', 'catalog.view'], [siteId]);
});
afterAll(() => db.$disconnect());

function http(method: Method, path: string, user: User, body?: object) {
  const req = api[method](path)
    .set('Cookie', user.cookie)
    .set('Origin', env.PUBLIC_ORIGIN);
  return body ? req.send(body) : req;
}
function call(
  r: Row,
  method: Method,
  path: string,
  body?: object,
  user = worker,
) {
  return http(
    method,
    root + '/' + r.id + path,
    user,
    method === 'get' ? undefined : { version: r.version, ...body },
  );
}
const write = async (
  r: Row,
  path: string,
  body = {},
  method: Method = 'post',
  actor = worker,
) => (await call(r, method, path, body, actor).expect(200)).body;
const linePath = (id: number, action: string) => '/items/' + id + '/' + action;
const price = (
  r: Row,
  itemId: number,
  lineTotal: string,
  supplierId = supplier,
) =>
  write(
    r,
    '/purchasing' + linePath(itemId, 'pricing'),
    { supplierId, lineTotal },
    'patch',
  );
const unavailable = (r: Row, itemId: number) =>
  write(r, '/purchasing' + linePath(itemId, 'unavailable'));
const submit = (r: Row) => write(r, '/purchasing/submit-pricing');
const receipt = (r: Row, id: number, quantity: string) =>
  write(
    r,
    '/receipts',
    { lines: [{ itemId: id, quantity }] },
    'post',
    receiver,
  );
const viewRound = async (r: Row, n = 1, who = worker) =>
  (await call(r, 'get', '/rounds/' + n, undefined, who).expect(200)).body;
const catalog = async (id: number, who = worker) =>
  (await http('get', '/api/v1/catalog/items/' + id, who).expect(200)).body;

let sequence = 0;
async function awaitingManager(count: number, catalogItemId?: number) {
  const draft = (
    await http('post', root, maker, { siteId, categoryId: nodeId }).expect(201)
  ).body;
  const items = Array.from({ length: count }, (_, i) => ({
    ...(i === 0 && catalogItemId
      ? { catalogItemId }
      : { otherName: 'بند ' + i, nodeId, unitId }),
    specs: 'مواصفة',
    quantity: '2',
  }));
  const saved = await write(draft, '/draft', { items }, 'patch', maker);
  return write(saved, '/submit', {}, 'post', maker);
}
async function purchasing(count: number, catalogItemId?: number) {
  return write(await awaitingManager(count, catalogItemId), '/approve');
}
async function catalogItem() {
  return (
    await db.catalogItem.create({
      data: {
        code: 'FIN-' + ++sequence,
        name: 'رخام',
        unitId,
        nodeId,
        description: '',
        searchText: 'رخام',
      },
    })
  ).id;
}
async function notifications(id: number) {
  const events = await db.requestEvent.findMany({
    where: { requestId: id },
    orderBy: { id: 'asc' },
    include: { notifications: { orderBy: { userId: 'asc' } } },
  });
  for (const event of events) {
    let expected: number[] = [];
    switch (event.type) {
      case 'SUBMITTED':
        expected = [worker.id];
        break;
      case 'MANAGER_APPROVED':
        expected = [];
        break;
      // The engineer who asked, whoever records receipt on the site, and the order senders.
      case 'PRICING_SENT_FOR_RECEIPT':
        expected = [maker.id, receiver.id, sender.id, worker.id];
        break;
      case 'RECEIPT_RECORDED': {
        const payload = event.payload as { lines: { outstanding: string }[] };
        if (payload.lines.some((line) => line.outstanding !== '0.00'))
          expected = [worker.id, sender.id];
        break;
      }
    }
    expect(
      event.notifications.map((n) => n.userId),
      event.type,
    ).toEqual(
      expected.filter((id) => id !== event.actorId).sort((a, b) => a - b),
    );
  }
  return events;
}

it.each(['AWAITING_MANAGER', 'RETURNED', 'AT_PURCHASING', 'PAUSED'])(
  'cancels from %s with a reason',
  async (status) => {
    let r = await awaitingManager(1);
    if (status === 'RETURNED')
      r = await write(r, '/return', { reason: 'تعديل' });
    if (status === 'AT_PURCHASING' || status === 'PAUSED')
      r = await write(r, '/approve');
    if (status === 'PAUSED') r = await write(r, '/pause', { reason: 'انتظار' });
    expect(r.status).toBe(status);
    r = await write(r, '/cancel', { reason: 'إلغاء' });
    expect(r).toMatchObject({
      status: 'CANCELLED',
      items: [{ state: 'CANCELLED' }],
    });
  },
);

const routes: {
  method: Method;
  path: string;
  valid?: object;
  invalid?: object;
}[] = [
  {
    method: 'patch',
    path: '/supply-orders/1',
    valid: { message: 'رسالة' },
    invalid: { message: '' },
  },
  { method: 'post', path: '/supply-orders/1/sent', valid: {} },
  {
    method: 'post',
    path: '/receipts',
    valid: { lines: [{ itemId: 1, quantity: '1' }] },
    invalid: { lines: [] },
  },
  { method: 'post', path: '/items/1/still-coming', valid: {} },
  {
    method: 'post',
    path: '/items/1/reprice',
    valid: { supplierId: 1, lineTotal: '1' },
    invalid: { supplierId: 1, lineTotal: '0' },
  },
  {
    method: 'post',
    path: '/items/1/resolve-externally',
    valid: {},
    invalid: { note: 5 },
  },
  {
    method: 'post',
    path: '/cancel',
    valid: { reason: 'انتهى' },
    invalid: { reason: '' },
  },
  {
    method: 'patch',
    path: '/purchasing/items/1/pricing',
    valid: { supplierId: 1, lineTotal: '1' },
    invalid: { supplierId: null, lineTotal: '1' },
  },
  { method: 'post', path: '/purchasing/submit-pricing', valid: {} },
  {
    method: 'put',
    path: '/purchasing/delivery-fee',
    valid: { deliveryFee: '10' },
    invalid: { deliveryFee: -1 },
  },
  { method: 'get', path: '/rounds/1' },
  { method: 'get', path: '/supply-orders' },
];
it('checks every fulfilment route for its grant, site scope, body and lifecycle state', async () => {
  let r = await purchasing(1);
  r = await write(r, '/cancel', { reason: 'توقف' });
  for (const { method, path, valid, invalid } of routes) {
    await call(r, method, path, valid, reader).expect(403);
    await call(r, method, path, invalid, outsider).expect(404);
    if (method !== 'get') {
      await call(r, method, path, invalid ?? { version: -1 }).expect(422);
      await call(r, method, path, valid).expect(409);
    }
  }
  await call(r, 'get', '/rounds/0').expect(422);
  await call(r, 'get', '/rounds/42').expect(404);
  // Pricing approval was removed: its routes no longer exist.
  for (const verb of ['approve', 'reject'])
    await call(r, 'post', '/rounds/1/' + verb, { reason: 'x' }).expect(404);
  await http('get', root + '/0/supply-orders', worker).expect(422);
  const draft = (
    await http('post', root, maker, { siteId, categoryId: nodeId }).expect(201)
  ).body;
  await call(draft, 'post', '/cancel', { reason: 'سبب' }).expect(409);
});

it('serializes competing submissions, sends pricing straight to receipt, freezes comparison prices, groups orders and marks each send once', async () => {
  const item = await catalogItem();
  let r = await purchasing(3, item);
  const [a, b, c] = r.items.map((i: { id: number }) => i.id);
  r = await price(r, a, '2.01');
  r = await price(r, b, '10.00');
  r = await price(r, c, '20', alternate);
  r = await write(r, '/purchasing/delivery-fee', { deliveryFee: '80' }, 'put');
  expect(r).toMatchObject({ status: 'AT_PURCHASING', rounds: [] });
  const responses = await Promise.all(
    [1, 2].map(() => call(r, 'post', '/purchasing/submit-pricing')),
  );
  expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
  r = responses.find((res) => res.status === 200)!.body;
  expect(r).toMatchObject({
    status: 'FULFILMENT',
    displayedStage: 'AWAITING_RECEIPT',
    items: [
      { state: 'AWAITING_RECEIPT' },
      { state: 'AWAITING_RECEIPT' },
      { state: 'AWAITING_RECEIPT' },
    ],
    rounds: [
      {
        number: 1,
        status: 'SUBMITTED',
        decidedAt: null,
        decidedBy: null,
        roundTotal: '32.01',
      },
    ],
  });
  expect(
    await db.auditLog.count({
      where: { action: 'request.submitPricing', entityId: String(r.id) },
    }),
  ).toBe(1);
  expect(await viewRound(r)).toMatchObject({
    roundTotal: '32.01',
    deliveryFee: '80.00',
    items: [
      { unitPrice: '1.01', lastPrice: null, supplier: { id: supplier } },
      { lineTotal: '10.00' },
      { lineTotal: '20.00' },
    ],
  });
  r = await write(r, '/purchasing/delivery-fee', { deliveryFee: '95' }, 'put');
  expect(await viewRound(r)).toMatchObject({
    roundTotal: '32.01',
    deliveryFee: '80.00',
  });
  expect((await viewRound(r, 1, accountant)).items[0]).not.toHaveProperty(
    'supplier',
  );
  expect(await db.catalogItemPrice.count({ where: { requestId: r.id } })).toBe(
    1,
  );
  expect((await catalog(item)).latestPrice).toMatchObject({
    unitPrice: '1.01',
    source: 'SUBMITTED',
    supplier: { id: supplier },
    requestNumber: r.number,
  });
  expect((await catalog(item, accountant)).latestPrice).not.toHaveProperty(
    'supplier',
  );
  expect(await catalog(item, reader)).not.toHaveProperty('latestPrice');
  for (const path of [
    '/api/v1/catalog/nodes/' + nodeId + '/items',
    '/api/v1/catalog/search?categoryId=' +
      nodeId +
      '&q=' +
      encodeURIComponent('رخام'),
  ]) {
    const page = await http('get', path, accountant).expect(200);
    const priced = page.body.items.find(
      (row: { id: number }) => row.id === item,
    );
    expect(priced.latestPrice.unitPrice).toBe('1.01');
    expect(priced.latestPrice).not.toHaveProperty('supplier');
    const hidden = await http('get', path, reader).expect(200);
    expect(hidden.text).not.toContain('latestPrice');
  }
  const foreignPrice = (await catalog(item, outsider)).latestPrice;
  expect(foreignPrice.unitPrice).toBe('1.01');
  expect(foreignPrice).not.toHaveProperty('requestNumber');
  expect((await viewRound(r)).items[0].lastPrice).toBeNull();

  const orders = (await call(r, 'get', '/supply-orders').expect(200)).body
    .items;
  expect(orders).toHaveLength(2);
  expect(orders[0]).toMatchObject({
    number: 1,
    supplier: { id: supplier },
    sentAt: null,
    items: [{ itemId: a }, { itemId: b }],
  });
  expect(orders[0].message).toContain(r.number + ' الموقع شارع 12 تشطيبات');
  expect(orders[0].message).toContain('1) رخام – مواصفة – 2.00 متر');
  expect(new URL(orders[0].waUrl).searchParams.get('text')).toBe(
    orders[0].message,
  );
  expect(orders[1].items).toMatchObject([{ itemId: c }]);
  r = await write(r, '/supply-orders/1', { message: 'نص مخصص' }, 'patch');
  expect(new URL(r.supplyOrders[0].waUrl).searchParams.get('text')).toBe(
    'نص مخصص',
  );
  const beforeSend = r;
  r = await write(r, '/supply-orders/1/sent');
  const replay = await write(beforeSend, '/supply-orders/1/sent');
  expect(replay.version).toBe(r.version);
  expect(replay.supplyOrders[0]).toEqual(r.supplyOrders[0]);
  await call(r, 'patch', '/supply-orders/1', { message: 'آخر' }).expect(409);
  const queue = async () =>
    (
      await http('get', root + '?queue=purchasing', sender).expect(200)
    ).body.items.some((row: Row) => row.id === r.id);
  expect(await queue()).toBe(true);
  r = await write(r, '/supply-orders/2/sent');
  expect(await queue()).toBe(false);
  const redacted = (await call(r, 'get', '', undefined, reader).expect(200))
    .body;
  expect(redacted.rounds[0]).not.toHaveProperty('roundTotal');
  for (const key of ['message', 'supplier', 'waUrl'])
    expect(redacted.supplyOrders[0]).not.toHaveProperty(key);
  expect(redacted.supplyOrders[0].items[0]).not.toHaveProperty('lineTotal');
  const events = await notifications(r.id);
  expect(
    events.filter((e) => e.type === 'PRICING_SENT_FOR_RECEIPT'),
  ).toHaveLength(1);
  expect(
    events.some((e) =>
      ['PRICING_SUBMITTED', 'PRICING_APPROVED'].includes(e.type),
    ),
  ).toBe(false);
  expect(
    events.filter((e) => e.type === 'SUPPLY_ORDER_SENT_MARKED'),
  ).toHaveLength(2);

  let next = await purchasing(1, item);
  next = await submit(await price(next, next.items[0].id, '3.02'));
  expect((await viewRound(next)).items[0]).toMatchObject({
    lastPrice: { unitPrice: '1.01' },
    priceChange: { amount: '0.50', percent: '49.50' },
  });
  r = await receipt(r, a, '1');
  r = await write(r, linePath(a, 'reprice'), {
    lineTotal: '0.25',
    supplierId: alternate,
  });
  expect((await viewRound(next)).items[0]).toMatchObject({
    lastPrice: { unitPrice: '1.01' },
    priceChange: { amount: '0.50', percent: '49.50' },
  });
});

it('rolls back invalid receipt batches and records partials through all three remaining-item outcomes', async () => {
  const item = await catalogItem();
  let r = await purchasing(2, item);
  const [a, b] = r.items.map((i: { id: number }) => i.id);
  r = await submit(await price(await price(r, a, '24'), b, '2'));
  const start = r;
  for (const lines of [
    [{ itemId: a, quantity: '0' }],
    [
      { itemId: a, quantity: '0.50' },
      { itemId: b, quantity: '2.01' },
    ],
    [
      { itemId: a, quantity: '1' },
      { itemId: a, quantity: '1' },
    ],
  ])
    await call(r, 'post', '/receipts', { lines }, receiver).expect(422);
  expect(await db.receipt.count({ where: { requestId: r.id } })).toBe(0);
  const batch = {
    lines: [
      { itemId: a, quantity: '0.50', note: 'ناقص' },
      { itemId: b, quantity: '2' },
    ],
    note: 'صباحًا',
  };
  const attempts = await Promise.all(
    [1, 2].map(() => call(start, 'post', '/receipts', batch, receiver)),
  );
  expect(attempts.map((v) => v.status).sort()).toEqual([200, 409]);
  r = attempts.find((v) => v.status === 200)!.body;
  expect(r.receipts).toMatchObject([
    {
      recordedBy: { id: receiver.id },
      note: batch.note,
      lines: [
        { itemId: a, quantity: '0.50', note: 'ناقص' },
        { itemId: b, quantity: '2.00' },
      ],
    },
  ]);
  expect(r.items).toMatchObject([
    { state: 'REMAINING', outstanding: '1.50' },
    { state: 'RECEIVED', outstanding: '0.00' },
  ]);
  await call(r, 'post', '/receipts', {
    lines: [{ itemId: a, quantity: '1' }],
  }).expect(409);
  r = await write(r, linePath(a, 'still-coming'));
  expect(r.supplyOrders).toHaveLength(1);
  expect(r.items[0]).toMatchObject({
    supplierId: supplier,
    lineTotal: '24.00',
  });
  r = await receipt(r, a, '0.25');
  await call(r, 'post', linePath(a, 'reprice'), {
    supplierId: 999999,
    lineTotal: '8',
  }).expect(422);
  r = await write(r, linePath(a, 'reprice'), {
    supplierId: alternate,
    lineTotal: '5.01',
  });
  expect(r.supplyOrders).toHaveLength(2);
  expect(r.supplyOrders[1]).toMatchObject({
    supplier: { id: alternate },
    items: [{ quantity: '1.25', lineTotal: '5.01' }],
  });
  expect(r.rounds).toHaveLength(1);
  expect((await catalog(item)).latestPrice).toMatchObject({
    unitPrice: '4.01',
    source: 'REPRICED',
    supplier: { id: alternate },
  });
  r = await receipt(r, a, '0.25');
  r = await write(r, linePath(a, 'reprice'), {
    supplierId: alternate,
    lineTotal: '4.50',
  });
  expect(r.supplyOrders).toHaveLength(2);
  r = await receipt(r, a, '0.50');
  r = await write(r, linePath(a, 'resolve-externally'), { note: 'تم الحل' });
  expect(r).toMatchObject({
    status: 'COMPLETED',
    displayedStage: 'COMPLETED',
    items: [
      {
        state: 'RESOLVED_EXTERNALLY',
        receivedQty: '1.50',
        resolvedBy: { id: worker.id, name: 'worker', roleName: 'worker' },
      },
      { state: 'RECEIVED' },
    ],
  });
  const events = await notifications(r.id);
  expect(events.at(-1)).toMatchObject({ type: 'COMPLETED', actorId: null });
  expect(events.at(-2)).toMatchObject({
    type: 'ITEM_RESOLVED_EXTERNALLY',
    actorRoleName: 'worker',
    payload: { note: 'تم الحل' },
  });
});

it('submits a later round while earlier lines are still awaiting receipt', async () => {
  let r = await purchasing(2);
  const [first, second] = r.items.map((item: { id: number }) => item.id);
  r = await submit(await price(await unavailable(r, second), first, '8.00'));
  expect(r.items).toMatchObject([
    { state: 'AWAITING_RECEIPT' },
    { state: 'UNAVAILABLE' },
  ]);
  r = await submit(await price(r, second, '3.50', alternate));
  expect(r.rounds).toMatchObject([
    { number: 1, status: 'SUBMITTED', roundTotal: '8.00' },
    { number: 2, status: 'SUBMITTED', roundTotal: '3.50' },
  ]);
  expect(await viewRound(r, 2)).toMatchObject({
    number: 2,
    roundTotal: '3.50',
    previousApprovedRounds: [{ number: 1, roundTotal: '8.00' }],
  });
  expect(r.supplyOrders).toMatchObject([
    { number: 1, supplier: { id: supplier }, items: [{ itemId: first }] },
    { number: 2, supplier: { id: alternate }, items: [{ itemId: second }] },
  ]);
  expect(r.items).toMatchObject([
    { state: 'AWAITING_RECEIPT' },
    { state: 'AWAITING_RECEIPT' },
  ]);
  r = await write(
    r,
    '/receipts',
    {
      lines: [
        { itemId: first, quantity: '2' },
        { itemId: second, quantity: '2' },
      ],
    },
    'post',
    receiver,
  );
  expect(r.status).toBe('COMPLETED');
  const events = await notifications(r.id);
  expect(events.at(-2)).toMatchObject({
    type: 'RECEIPT_RECORDED',
    notifications: [],
  });
});

it('retains partial receipts on cancel and completes a wholly external request', async () => {
  let partial = await purchasing(1);
  const id = partial.items[0].id;
  partial = await receipt(
    await submit(await price(partial, id, '4')),
    id,
    '0.25',
  );
  partial = await write(partial, '/cancel', { reason: 'توقف المشروع' });
  expect(partial).toMatchObject({
    status: 'CANCELLED',
    items: [{ state: 'CANCELLED', receivedQty: '0.25' }],
    receipts: [{ lines: [{ quantity: '0.25' }] }],
  });
  expect((await notifications(partial.id)).at(-1)).toMatchObject({
    type: 'CANCELLED',
    payload: { reason: 'توقف المشروع' },
  });
  let external = await purchasing(1);
  const only = external.items[0].id;
  external = await write(
    await unavailable(external, only),
    linePath(only, 'resolve-externally'),
    { note: 'من الموقع' },
  );
  expect(external).toMatchObject({
    status: 'COMPLETED',
    rounds: [],
    supplyOrders: [],
    receipts: [],
  });
  expect((await notifications(external.id)).at(-1)).toMatchObject({
    type: 'COMPLETED',
    actorId: null,
  });
});
