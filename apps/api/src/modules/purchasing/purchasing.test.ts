import type { PrismaClient } from '@prisma/client';
import { buildRfqMessage, defaultSettings } from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { verifyAudit } from '../access/audit.js';

const env = parseEnv(process.env);
let now = new Date('2033-01-01T10:00:00Z');
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => now,
});
const db: PrismaClient = app.locals.db;
const api = request(app);
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';
type User = { id: number; cookie: string };
type Record = {
  id: number;
  version: number;
  items: { id: number; quantity: string }[];
};
type Batch = {
  id: number;
  suppliers: {
    supplierId: number;
    message: string;
    waUrl: string;
    tooLong: boolean;
    sentAt: string | null;
    sentById: number | null;
  }[];
};
let maker: User,
  buyer: User,
  manager: User,
  outsider: User,
  otherApprover: User,
  allApprover: User,
  support: User,
  reader: User,
  pricesViewer: User,
  suppliersViewer: User;
let siteId: number,
  otherSite: number,
  categoryId: number,
  otherCategory: number,
  unitId: number;
let firstSupplier: number,
  secondSupplier: number,
  foreignSupplier: number,
  inactiveSupplier: number;
const buyingKeys: PermissionKey[] = [
  'purchasing.sendRfq',
  'purchasing.price',
  'purchasing.returnForEdit',
  'requests.pause',
  'requests.viewTimeline',
];
const managerKeys: PermissionKey[] = [
  'requests.approve',
  'requests.editWhilePaused',
  'pricing.approve',
  'requests.pause',
  'purchasing.handleRemaining',
  'purchasing.sendSupplyOrder',
];
const root = '/api/v1/requests';
function send(method: Method, path: string, body?: object, user = buyer) {
  const req = api[method](root + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', user.cookie);
  return body ? req.send(body) : req;
}
async function user(
  username: string,
  keys: PermissionKey[],
  sites: number[],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
) {
  const u = await makeUser(db, username, keys, scope, sites);
  const res = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return {
    id: u.id,
    cookie: String(res.headers['set-cookie']![0]).split(';')[0]!,
  };
}
async function category(name: string, codePrefix: string) {
  const node = await db.catalogNode.create({
    data: {
      name,
      codePrefix,
      iconKey: 'zap',
      sortOrder: 0,
      depth: 0,
      path: 'pending',
    },
  });
  return (
    await db.catalogNode.update({
      where: { id: node.id },
      data: { path: '/' + node.id + '/' },
    })
  ).id;
}
async function supplier(
  name: string,
  phone: string,
  categoryId: number,
  isActive = true,
) {
  return (
    await db.supplier.create({
      data: {
        name,
        whatsappNumber: phone,
        contactPerson: '',
        notes: '',
        isActive,
        categories: { create: { categoryId } },
      },
    })
  ).id;
}

beforeAll(async () => {
  await resetDb();
  siteId = (await db.site.create({ data: { name: 'شرق' } })).id;
  otherSite = (await db.site.create({ data: { name: 'غرب' } })).id;
  categoryId = await category('الأرضيات', 'FLR');
  otherCategory = await category('إضاءة', 'LGT');
  unitId = (await db.unit.create({ data: { name: 'متر' } })).id;
  firstSupplier = await supplier('سيراميك ألف', '201001234567', categoryId);
  secondSupplier = await supplier('سيراميك باء', '201101234567', categoryId);
  foreignSupplier = await supplier('إضاءة تاء', '201201234567', otherCategory);
  inactiveSupplier = await supplier('متوقف', '201501234567', categoryId, false);
  maker = await user('purchasing-maker', ['requests.create'], [siteId]);
  buyer = await user(
    'purchasing-buyer',
    [...buyingKeys, 'pricing.approve'],
    [siteId],
  );
  manager = await user('purchasing-manager', managerKeys, [siteId]);
  outsider = await user(
    'purchasing-other',
    [...buyingKeys, ...managerKeys],
    [otherSite],
  );
  otherApprover = await user(
    'purchasing-approver-other',
    ['pricing.approve'],
    [otherSite],
  );
  allApprover = await user(
    'purchasing-approver-all',
    ['pricing.approve'],
    [],
    'ALL',
  );
  support = await user('purchasing-support', [], []);
  await db.user.update({
    where: { id: support.id },
    data: { isSuperadmin: true, roleId: null },
  });
  reader = await user('purchasing-reader', ['requests.view'], [siteId]);
  pricesViewer = await user(
    'purchasing-prices',
    ['requests.viewPrices'],
    [siteId],
  );
  suppliersViewer = await user(
    'purchasing-suppliers',
    ['requests.viewSupplierNames'],
    [siteId],
  );
});
afterAll(() => db.$disconnect());

const rp = (r: Record, suffix = '') => '/' + r.id + suffix;
const pp = (r: Record, suffix = '') => rp(r, '/purchasing' + suffix);
const bp = (r: Record, batch: Batch, supplierId: number) =>
  pp(r, '/batches/' + batch.id + '/suppliers/' + supplierId);
const ip = (r: Record, itemId: number, suffix: string) =>
  pp(r, '/items/' + itemId + suffix);
const line = (name: string) => ({
  nodeId: categoryId,
  unitId,
  otherName: name,
  specs: 'عينة رقم 3',
  quantity: '2.00',
});
async function atPurchasing(itemCount = 3): Promise<Record> {
  const draft = (
    await send('post', '/', { siteId, categoryId }, maker).expect(201)
  ).body;
  const saved = (
    await send(
      'patch',
      rp(draft, '/draft'),
      {
        version: draft.version,
        items: Array.from({ length: itemCount }, (_, i) =>
          line('بند ' + (i + 1)),
        ),
      },
      maker,
    ).expect(200)
  ).body;
  const submitted = (
    await send(
      'post',
      rp(saved, '/submit'),
      { version: saved.version },
      maker,
    ).expect(200)
  ).body;
  return (
    await send(
      'post',
      rp(submitted, '/approve'),
      { version: submitted.version },
      manager,
    ).expect(200)
  ).body;
}
async function createBatch(
  r: Record,
  itemIds: number[],
  supplierIds: number[],
  message = 'ممكن سعر للبنود؟',
) {
  const { body } = await send('post', pp(r, '/batches'), {
    version: r.version,
    itemIds,
    supplierIds,
    message,
  }).expect(201);
  return body as { version: number; batch: Batch };
}
async function price(
  r: Record,
  itemId: number,
  supplierId = firstSupplier,
  lineTotal = '1.01',
) {
  return (
    await send('patch', ip(r, itemId, '/pricing'), {
      version: r.version,
      supplierId,
      lineTotal,
    }).expect(200)
  ).body;
}
async function timeline(r: Record) {
  return (await send('get', rp(r, '/timeline')).expect(200)).body.items as {
    id: number;
    type: string;
    payload: unknown;
  }[];
}
async function version(r: Record) {
  return (await db.request.findUniqueOrThrow({ where: { id: r.id } })).version;
}

it('searches active suppliers across categories only for a pricing viewer within the request site', async () => {
  const r = await atPurchasing(1);
  const directory = pp(r, '/suppliers');
  const { body } = await send(
    'get',
    directory + '?q=' + encodeURIComponent('إضاءة'),
  ).expect(200);
  expect(body).toMatchObject({
    total: 1,
    items: [
      {
        id: foreignSupplier,
        name: 'إضاءة تاء',
        whatsappNumber: '201201234567',
        whatsappDisplay: expect.any(String),
      },
    ],
  });
  expect(
    (await send('get', directory + '?q=2015').expect(200)).body.items,
  ).toEqual([]);
  await send('get', directory, undefined, reader).expect(403);
  await send('get', directory, undefined, outsider).expect(404);
  await send('get', directory + '?page=0').expect(422);
});

it('validates batch selections, tweaks messages and marks sent only once under a concurrent retry', async () => {
  const r = await atPurchasing(2);
  const itemIds = r.items.map((item) => item.id);
  for (const supplierId of [foreignSupplier, inactiveSupplier, 999999]) {
    await send('post', pp(r, '/batches'), {
      version: r.version,
      itemIds,
      supplierIds: [supplierId],
      message: 'سعر',
    })
      .expect(422)
      .expect((res) => expect(res.body.error).toBe('INVALID_RFQ_SUPPLIERS'));
  }
  for (const input of [
    { itemIds: [itemIds[0], itemIds[0]], supplierIds: [firstSupplier] },
    { itemIds, supplierIds: [firstSupplier, firstSupplier] },
  ])
    await send('post', pp(r, '/batches'), {
      ...input,
      version: r.version,
      message: 'سعر',
    }).expect(422);
  await send('post', pp(r, '/batches'), {
    version: r.version,
    itemIds: [999999],
    supplierIds: [firstSupplier],
    message: 'سعر',
  }).expect(404);
  expect(await version(r)).toBe(r.version);
  expect(await db.rfqBatch.count({ where: { requestId: r.id } })).toBe(0);

  const message = buildRfqMessage(
    defaultSettings.rfqIntro,
    {
      requestNumber: 'PR-2033-00001',
      siteName: 'شرق',
      categoryName: 'الأرضيات',
    },
    [
      {
        lineNo: 1,
        name: 'بند 1',
        specs: 'عينة رقم 3',
        quantity: '2.00',
        unit: 'متر',
      },
    ],
  );
  const made = await createBatch(
    r,
    itemIds,
    [firstSupplier, secondSupplier],
    message,
  );
  const { batch } = made;
  expect(batch.suppliers).toHaveLength(2);
  expect(batch.suppliers[0]).toMatchObject({
    sentAt: null,
    sentById: null,
    message,
    tooLong: false,
  });
  expect(
    decodeURIComponent(batch.suppliers[0]!.waUrl.split('?text=')[1]!),
  ).toBe(message);
  const longMessage = 'س'.repeat(700);
  const edited = (
    await send('patch', bp(r, batch, firstSupplier), {
      version: made.version,
      message: longMessage,
    }).expect(200)
  ).body;
  expect(edited.batch.suppliers).toEqual([
    expect.objectContaining({
      supplierId: firstSupplier,
      message: longMessage,
      tooLong: true,
    }),
    expect.objectContaining({
      supplierId: secondSupplier,
      message,
      tooLong: false,
    }),
  ]);
  const sentRoute = bp(r, batch, firstSupplier) + '/sent';
  const originalTime = now.toISOString();
  const [first, retry] = await Promise.all([
    send('post', sentRoute, { version: edited.version }).expect(200),
    send('post', sentRoute, { version: edited.version }).expect(200),
  ]);
  expect(first.body).toEqual(retry.body);
  expect(first.body.batch.suppliers[0]).toMatchObject({
    sentAt: originalTime,
    sentById: buyer.id,
  });
  expect(first.body.version).toBe(edited.version + 1);
  now = new Date(+now + 60000);
  await send('post', sentRoute, { version: edited.version })
    .expect(200)
    .expect((res) => expect(res.body).toEqual(first.body));
  await send('patch', bp(r, batch, firstSupplier), {
    version: first.body.version,
    message: 'تغيير بعد الإرسال',
  }).expect(409);
  expect(await version(r)).toBe(first.body.version);
  const rows = (await timeline(r)).filter((event) =>
    event.type.startsWith('BATCH_'),
  );
  expect(rows.map((event) => event.type)).toEqual([
    'BATCH_CREATED',
    'BATCH_SENT_MARKED',
  ]);
  expect(rows[0]?.payload).toEqual({
    batchId: batch.id,
    lineNos: [1, 2],
    supplierIds: [firstSupplier, secondSupplier],
  });
  expect(
    await db.auditLog.count({
      where: { action: 'request.markBatchSent', entityId: String(r.id) },
    }),
  ).toBe(1);
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: 'rfqBatchSupplier.message', entityId: String(batch.id) },
  });
  expect(verifyAudit(env.AUDIT_HMAC_SECRET, audit)).toBe(true);
});

it('allows resending and counts distinct selected lines already received by each active supplier', async () => {
  const r = await atPurchasing(2);
  const [itemId, another] = r.items.map((item) => item.id);
  const first = await createBatch(r, [itemId!, another!], [firstSupplier]);
  const firstSent = (
    await send('post', bp(r, first.batch, firstSupplier) + '/sent', {
      version: first.version,
    }).expect(200)
  ).body;
  const repeat = await createBatch(
    { ...r, version: firstSent.version },
    [itemId!],
    [firstSupplier, secondSupplier],
  );
  now = new Date(+now + 60000);
  const recorded = (
    await send('post', bp(r, repeat.batch, firstSupplier) + '/sent', {
      version: repeat.version,
    }).expect(200)
  ).body;
  await send('post', bp(r, repeat.batch, secondSupplier) + '/sent', {
    version: recorded.version,
  }).expect(200);
  const view = (
    await send('get', pp(r, '?itemIds=' + itemId + ',' + another)).expect(200)
  ).body;
  expect(
    view.suppliers.map((s: { id: number; alreadyReceivedCount: number }) => [
      s.id,
      s.alreadyReceivedCount,
    ]),
  ).toEqual([
    [firstSupplier, 2],
    [secondSupplier, 1],
  ]);
  expect(view.items[0]).toMatchObject({
    sentSupplierCount: 2,
    sentTo: [
      {
        batchId: repeat.batch.id,
        supplierId: firstSupplier,
        sentAt: now.toISOString(),
      },
      {
        batchId: repeat.batch.id,
        supplierId: secondSupplier,
        sentAt: now.toISOString(),
      },
      { batchId: first.batch.id, supplierId: firstSupplier },
    ],
  });
  expect(view.items[1]).toMatchObject({ sentSupplierCount: 1 });
  await send('get', pp(r, '?itemIds=999999')).expect(422);
  const removed = await api
    .delete('/api/v1/suppliers/' + firstSupplier)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', support.cookie)
    .expect(409);
  expect(removed.body.error).toBe('SUPPLIER_IN_USE');
});

it('validates and clears line drafts, derives half-up prices and keeps the delivery fee outside totals', async () => {
  const r = await atPurchasing(2);
  const first = r.items[0]!.id,
    second = r.items[1]!.id;
  for (const invalid of [
    { supplierId: firstSupplier, lineTotal: '0.00' },
    { supplierId: firstSupplier, lineTotal: '-1' },
    { supplierId: firstSupplier, lineTotal: '1.005' },
    { supplierId: firstSupplier, lineTotal: 2 },
    { supplierId: null, lineTotal: '1' },
    { supplierId: firstSupplier, lineTotal: null },
    { supplierId: inactiveSupplier, lineTotal: '25' },
  ])
    await send('patch', ip(r, first, '/pricing'), {
      ...invalid,
      version: r.version,
    }).expect(422);
  const priced = await price(r, first, foreignSupplier);
  expect(priced.items[0]).toMatchObject({
    supplierId: foreignSupplier,
    lineTotal: '1.01',
    unitPrice: '0.51',
  });
  const stocked = (
    await send('post', ip(r, second, '/unavailable'), {
      version: priced.version,
      note: 'غير موجود',
    }).expect(200)
  ).body;
  expect(stocked.items[1]).toMatchObject({
    state: 'UNAVAILABLE',
    unavailableNote: 'غير موجود',
    lineTotal: null,
  });
  const available = (
    await send('delete', ip(r, second, '/unavailable'), {
      version: stocked.version,
      note: 'وصل للمخزن',
    }).expect(200)
  ).body;
  expect(available.items[1]).toMatchObject({
    state: 'OPEN',
    unavailableNote: null,
  });
  const fee = (
    await send('put', pp(r, '/delivery-fee'), {
      version: available.version,
      deliveryFee: '100.50',
    }).expect(200)
  ).body;
  expect(fee.deliveryFee).toBe('100.50');
  const view = (await send('get', pp(r)).expect(200)).body;
  expect(view.pricing).toEqual({
    total: '1.01',
    pendingTotal: '1.01',
    pricedCount: 1,
    submitBlocker: null,
    unavailableCount: 0,
    needsRepricingItemIds: [],
  });
  const cleared = (
    await send('patch', ip(r, first, '/pricing'), {
      version: fee.version,
      supplierId: null,
      lineTotal: null,
    }).expect(200)
  ).body;
  expect(cleared.items[0]).toMatchObject({
    supplierId: null,
    lineTotal: null,
    unitPrice: null,
    pricedQuantity: null,
  });
  const noFee = (
    await send('put', pp(r, '/delivery-fee'), {
      version: cleared.version,
      deliveryFee: null,
    }).expect(200)
  ).body;
  expect(noFee.deliveryFee).toBeNull();
  await send('post', pp(r, '/submit-pricing'), { version: noFee.version })
    .expect(409)
    .expect((res) => expect(res.body.error).toBe('NO_PRICED_ITEMS'));
  const relevant = (await timeline(r)).slice(3);
  expect(relevant.map((event) => event.type)).toEqual([
    'ITEM_UNAVAILABLE',
    'ITEM_AVAILABLE_AGAIN',
    'DELIVERY_FEE_CHANGED',
    'DELIVERY_FEE_CHANGED',
  ]);
  expect(relevant[1]?.payload).toEqual({ lineNo: 2, note: 'وصل للمخزن' });
  expect(relevant[2]?.payload).toEqual({ before: null, after: '100.50' });
  expect(relevant[3]?.payload).toEqual({ before: '100.50', after: null });
  expect(
    await db.auditLog.count({
      where: { entityId: String(r.id), action: 'request.savePricingDraft' },
    }),
  ).toBe(2);
});

it('pauses, sets both independent edit flags, refuses stale prices and records purchasing return recipients', async () => {
  const r = await atPurchasing(3);
  const [first, second, third] = r.items.map((item) => item.id);
  const batch = await createBatch(r, [first!, second!], [firstSupplier]);
  const sent = (
    await send('post', bp(r, batch.batch, firstSupplier) + '/sent', {
      version: batch.version,
    }).expect(200)
  ).body;
  const priced = await price({ ...r, version: sent.version }, first!);
  const twice = await price(priced, third!);
  await send('post', rp(r, '/pause'), {
    version: twice.version,
    reason: ' ',
  }).expect(422);
  const paused = (
    await send('post', rp(r, '/pause'), {
      version: twice.version,
      reason: 'راجع المواصفات',
    }).expect(200)
  ).body;
  expect(paused).toMatchObject({
    status: 'PAUSED',
    pausedById: buyer.id,
    pauser: { name: 'purchasing-buyer' },
    pauseReason: 'راجع المواصفات',
  });
  expect(
    (await send('get', '/?queue=purchasing&id=' + r.id).expect(422)).status,
  ).toBe(422);
  const queue = (await send('get', '/?queue=purchasing').expect(200)).body;
  expect(queue.items.some((item: Record) => item.id === r.id)).toBe(false);
  await send('patch', ip(r, first!, '/pricing'), {
    version: paused.version,
    supplierId: firstSupplier,
    lineTotal: '10',
  }).expect(409);
  await send('post', rp(r, '/purchasing-return'), {
    version: paused.version,
    reason: 'راجع الطلب',
  }).expect(409);
  await send(
    'patch',
    rp(r, '/paused-edit'),
    {
      version: paused.version,
      change: [{ itemId: first, fields: { quantity: '2.25' } }],
    },
    buyer,
  ).expect(403);
  const edited = (
    await send(
      'patch',
      rp(r, '/paused-edit'),
      {
        version: paused.version,
        fields: { note: 'اتراجع' },
        change: [
          { itemId: first, fields: { quantity: '2.25' } },
          { itemId: second, fields: { specs: 'موديل جديد' } },
          { itemId: third, fields: { specs: 'تعديل التسعير' } },
        ],
        add: [line('مادة بديلة')],
      },
      manager,
    ).expect(200)
  ).body;
  expect(edited).toMatchObject({
    status: 'PAUSED',
    isModified: true,
    note: 'اتراجع',
    items: [
      { quantity: '2.25', needsRepricing: true, modifiedAfterSend: true },
      { specs: 'موديل جديد', needsRepricing: false, modifiedAfterSend: true },
      { needsRepricing: true, modifiedAfterSend: false },
      { lineNo: 4, needsRepricing: false, modifiedAfterSend: false },
    ],
  });
  expect(
    (await db.requestItem.findUniqueOrThrow({ where: { id: first } }))
      .lineTotal,
  ).toBeNull();
  const resumed = (
    await send(
      'post',
      rp(r, '/resume'),
      { version: edited.version },
      manager,
    ).expect(200)
  ).body;
  expect(resumed).toMatchObject({
    status: 'AT_PURCHASING',
    pausedById: null,
    pauseReason: null,
  });
  await send('post', pp(r, '/submit-pricing'), { version: resumed.version })
    .expect(409)
    .expect((res) => expect(res.body.error).toBe('NEEDS_REPRICING'));
  const returned = (
    await send('post', rp(r, '/purchasing-return'), {
      version: resumed.version,
      reason: 'اتأكد من الكمية',
    }).expect(200)
  ).body;
  expect(returned).toMatchObject({
    status: 'PAUSED',
    pauseReason: 'اتأكد من الكمية',
  });
  const recipients = await db.notification.findMany({
    where: { requestId: r.id, event: { type: 'PURCHASING_RETURNED' } },
  });
  expect(recipients.map((row) => row.userId)).toEqual([maker.id]);
  expect(
    await db.notification.count({
      where: { requestId: r.id, userId: buyer.id, event: { type: 'RESUMED' } },
    }),
  ).toBe(1);
  expect(
    await db.notification.count({
      where: { requestId: r.id, event: { type: 'PAUSED' } },
    }),
  ).toBe(0);
  const events = await timeline(r);
  expect(
    events.find((event) => event.type === 'EDITED')?.payload,
  ).toMatchObject({
    changed: [
      {
        itemId: first,
        fields: [{ field: 'quantity', before: '2.00', after: '2.25' }],
      },
      { itemId: second, fields: [{ field: 'specs' }] },
      { itemId: third, fields: [{ field: 'specs' }] },
    ],
  });
});

it('submits normalized rounds, leaves unavailable lines, and notifies only scoped approval holders', async () => {
  const r = await atPurchasing(2);
  const first = r.items[0]!.id,
    second = r.items[1]!.id;
  const priced = await price(r, first);
  const unavailable = (
    await send('post', ip(r, second, '/unavailable'), {
      version: priced.version,
    }).expect(200)
  ).body;
  const fee = (
    await send('put', pp(r, '/delivery-fee'), {
      version: unavailable.version,
      deliveryFee: '30',
    }).expect(200)
  ).body;
  const sent = (
    await send('post', pp(r, '/submit-pricing'), {
      version: fee.version,
    }).expect(200)
  ).body;
  expect(sent).toMatchObject({
    status: 'FULFILMENT',
    displayedStage: 'AWAITING_APPROVAL',
    items: [
      { state: 'AWAITING_APPROVAL', lineTotal: '1.01' },
      { state: 'UNAVAILABLE' },
    ],
  });
  const rounds = await db.pricingRound.findMany({
    where: { requestId: r.id },
    include: { items: true },
  });
  expect(rounds).toMatchObject([
    {
      number: 1,
      status: 'PENDING',
      submittedById: buyer.id,
      items: [{ itemId: first, supplierId: firstSupplier }],
    },
  ]);
  expect(rounds[0]?.items[0]?.lineTotal.toFixed(2)).toBe('1.01');
  expect(rounds[0]?.deliveryFee?.toFixed(2)).toBe('30.00');
  const queue = (
    await send('get', '/?queue=purchasing&status=FULFILMENT').expect(200)
  ).body;
  expect(queue.items.some((item: Record) => item.id === r.id)).toBe(true);
  await send('post', rp(r, '/pause'), {
    version: sent.version,
    reason: 'مش هينفع',
  }).expect(409);
  await send('delete', ip(r, second, '/unavailable'), {
    version: sent.version,
  }).expect(409);
  const repriced = await price(sent, second, secondSupplier, '4.50');
  expect(repriced.items[1]).toMatchObject({
    state: 'OPEN',
    lineTotal: '4.50',
    unavailableNote: null,
  });
  const laterFee = (
    await send('put', pp(r, '/delivery-fee'), {
      version: repriced.version,
      deliveryFee: '6',
    }).expect(200)
  ).body;
  const round2 = (
    await send('post', pp(r, '/submit-pricing'), {
      version: laterFee.version,
    }).expect(200)
  ).body;
  expect(
    round2.items.every(
      (item: { state: string }) => item.state === 'AWAITING_APPROVAL',
    ),
  ).toBe(true);
  const persisted = await db.pricingRound.findMany({
    where: { requestId: r.id },
    include: { items: true },
    orderBy: { number: 'asc' },
  });
  expect(
    persisted.map((round) => [
      round.number,
      round.deliveryFee?.toFixed(2),
      round.items.map((item) => item.itemId),
    ]),
  ).toEqual([
    [1, '30.00', [first]],
    [2, '6.00', [second]],
  ]);
  const events = (await timeline(r)).filter(
    (event) => event.type === 'PRICING_SUBMITTED',
  );
  expect(events.map((event) => event.payload)).toMatchObject([
    { roundNo: 1, roundTotal: '1.01', deliveryFee: '30.00' },
    { roundNo: 2, roundTotal: '4.50', deliveryFee: '6.00' },
  ]);
  for (const event of events) {
    const notifications = await db.notification.findMany({
      where: { eventId: event.id },
      orderBy: { userId: 'asc' },
    });
    expect(notifications.map((row) => row.userId)).toEqual(
      [manager.id, allApprover.id].sort((a, b) => a - b),
    );
    expect(notifications.map((row) => row.userId)).not.toContain(
      otherApprover.id,
    );
    expect(notifications.map((row) => row.userId)).not.toContain(support.id);
  }
  expect(
    (
      await send('get', '/?queue=purchasing&status=FULFILMENT').expect(200)
    ).body.items.some((item: Record) => item.id === r.id),
  ).toBe(false);
  expect(
    (await send('get', '/?queue=purchasing', undefined, reader).expect(200))
      .body.items,
  ).toEqual([]);
  expect(
    (await send('get', '/?queue=purchasing', undefined, outsider).expect(200))
      .body.items,
  ).toEqual([]);
  await db.request.update({
    where: { id: r.id },
    data: {
      supplyOrders: [
        { number: 1, supplierId: firstSupplier, lines: [], sent: false },
      ],
    },
  });
  expect(
    (
      await send(
        'get',
        '/?queue=purchasing&status=FULFILMENT',
        undefined,
        manager,
      ).expect(200)
    ).body.items.some((item: Record) => item.id === r.id),
  ).toBe(true);
  await db.request.update({ where: { id: r.id }, data: { supplyOrders: [] } });
});

it('redacts draft prices, fee, supplier names, phones and RFQ messages by permission', async () => {
  const r = await atPurchasing(1);
  const id = r.items[0]!.id;
  const made = await createBatch(
    r,
    [id],
    [firstSupplier],
    'رسالة خصوصية للمورد',
  );
  const sent = (
    await send('post', bp(r, made.batch, firstSupplier) + '/sent', {
      version: made.version,
    }).expect(200)
  ).body;
  const priced = await price({ ...r, version: sent.version }, id);
  await send('put', pp(r, '/delivery-fee'), {
    version: priced.version,
    deliveryFee: '12.34',
  }).expect(200);
  const bare = (
    await send('get', pp(r, '?itemIds=' + id), undefined, reader).expect(200)
  ).body;
  expect(bare).not.toHaveProperty('suppliers');
  expect(bare).not.toHaveProperty('deliveryFee');
  expect(bare).not.toHaveProperty('pricing');
  for (const key of [
    'supplierId',
    'supplierName',
    'sentTo',
    'lineTotal',
    'unitPrice',
    'pricedQuantity',
  ])
    expect(bare.items[0]).not.toHaveProperty(key);
  expect(bare.batches[0]).not.toHaveProperty('suppliers');
  expect(bare.batches[0]).not.toHaveProperty('message');
  expect(JSON.stringify(bare)).not.toMatch(
    /رسالة خصوصية|سيراميك ألف|201001234567|wa\.me/,
  );
  const money = (await send('get', pp(r), undefined, pricesViewer).expect(200))
    .body;
  expect(money).toMatchObject({
    pricing: { total: '1.01' },
    deliveryFee: '12.34',
    items: [{ unitPrice: '0.51' }],
  });
  expect(money.items[0]).not.toHaveProperty('supplierId');
  const names = (
    await send('get', pp(r), undefined, suppliersViewer).expect(200)
  ).body;
  expect(names.items[0]).toMatchObject({
    supplierId: firstSupplier,
    supplierName: 'سيراميك ألف',
    sentSupplierCount: 1,
  });
  expect(names.items[0]).not.toHaveProperty('lineTotal');
  expect(names.batches[0].suppliers[0]).not.toHaveProperty('waUrl');
  expect(names.batches[0].suppliers[0]).not.toHaveProperty('message');
  expect(names).not.toHaveProperty('pricing');
});

describe('purchasing route authorization and validation', () => {
  interface Route {
    name: string;
    method: Method;
    path: (r: Record) => string;
    valid?: object;
    invalid?: object;
    wrongState?: 'DRAFT' | 'COMPLETED';
    manager?: boolean;
  }
  const routes: Route[] = [
    { name: 'view', method: 'get', path: (r) => pp(r, '?itemIds=bad') },
    {
      name: 'batch create',
      method: 'post',
      path: (r) => pp(r, '/batches'),
      valid: { itemIds: [1], supplierIds: [1], message: 'سعر' },
      invalid: { itemIds: [] },
      wrongState: 'DRAFT',
    },
    {
      name: 'message edit',
      method: 'patch',
      path: (r) => pp(r, '/batches/1/suppliers/1'),
      valid: { message: 'سعر' },
      invalid: { message: ' ' },
      wrongState: 'DRAFT',
    },
    {
      name: 'sent confirmation',
      method: 'post',
      path: (r) => pp(r, '/batches/1/suppliers/1/sent'),
      invalid: { version: -1 },
      wrongState: 'DRAFT',
    },
    {
      name: 'line draft',
      method: 'patch',
      path: (r) => ip(r, r.items[0]!.id, '/pricing'),
      valid: { supplierId: 1, lineTotal: '10.00' },
      invalid: { lineTotal: '10.100' },
      wrongState: 'DRAFT',
    },
    {
      name: 'mark unavailable',
      method: 'post',
      path: (r) => ip(r, r.items[0]!.id, '/unavailable'),
      invalid: { note: 12 },
      wrongState: 'DRAFT',
    },
    {
      name: 'mark available',
      method: 'delete',
      path: (r) => ip(r, r.items[0]!.id, '/unavailable'),
      invalid: { note: true },
      wrongState: 'DRAFT',
    },
    {
      name: 'delivery fee',
      method: 'put',
      path: (r) => pp(r, '/delivery-fee'),
      valid: { deliveryFee: '5.00' },
      invalid: { deliveryFee: '-1' },
      wrongState: 'COMPLETED',
    },
    {
      name: 'submit',
      method: 'post',
      path: (r) => pp(r, '/submit-pricing'),
      invalid: { version: null },
      wrongState: 'DRAFT',
    },
    {
      name: 'pause',
      method: 'post',
      path: (r) => rp(r, '/pause'),
      valid: { reason: 'مراجعة' },
      invalid: { reason: '' },
      wrongState: 'DRAFT',
    },
    {
      name: 'resume',
      method: 'post',
      path: (r) => rp(r, '/resume'),
      invalid: { version: '1' },
      wrongState: 'DRAFT',
    },
    {
      name: 'return',
      method: 'post',
      path: (r) => rp(r, '/purchasing-return'),
      valid: { reason: 'تعديل' },
      invalid: { reason: '' },
      wrongState: 'DRAFT',
    },
    {
      name: 'paused edit',
      method: 'patch',
      path: (r) => rp(r, '/paused-edit'),
      valid: { fields: { note: 'تعديل' } },
      invalid: { fields: { siteId: 123 } },
      wrongState: 'DRAFT',
      manager: true,
    },
  ];
  it.each(routes)('$name', async (route) => {
    const r = await atPurchasing(1);
    const target = route.path(r);
    const valid = { version: r.version, ...route.valid };
    const invalid =
      route.method === 'get' ? undefined : { ...valid, ...route.invalid };
    await send(route.method, target, invalid, { id: 0, cookie: '' }).expect(
      401,
    );
    if (route.method !== 'get')
      await send(route.method, target, valid, reader).expect(403);
    await send(route.method, target, invalid, outsider).expect(404);
    const actor = route.manager ? manager : buyer;
    await send(route.method, target, invalid, actor).expect(422);
    if (route.wrongState) {
      await db.request.update({
        where: { id: r.id },
        data: { status: route.wrongState },
      });
      await send(route.method, target, valid, actor)
        .expect(409)
        .expect((res) => expect(res.body.error).toBe('WRONG_STATUS'));
    }
  });
});
