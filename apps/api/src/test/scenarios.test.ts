import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';

import { resetDb, testDatabaseUrl } from './db.js';
import { makeUser, testPassword } from './factories.js';
import type { Method } from './route-manifest.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app);
type User = { id: number; cookie: string };
type Line = {
  id: number;
  state: string;
  receivedQty: string;
  lineTotal?: string | null;
  needsRepricing: boolean;
  modifiedAfterSend: boolean;
};
type Detail = { id: number; version: number; status: string; items: Line[] };
let siteId: number, nodeId: number, unitId: number, supplierId: number;
let engineer: User,
  manager: User,
  buyer: User,
  accountant: User,
  receiver: User,
  reader: User,
  historian: User;
async function account(name: string, keys: PermissionKey[], sites = [siteId]) {
  const row = await makeUser(db, name, keys, 'ASSIGNED', sites);
  const res = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username: name, password: testPassword })
    .expect(204);
  return {
    id: row.id,
    cookie: String(res.headers['set-cookie']![0]).split(';')[0]!,
  };
}
beforeAll(async () => {
  await resetDb();
  await db.settings.create({ data: { id: 1, ...defaultSettings } });
  siteId = (await db.site.create({ data: { name: 'site' } })).id;
  nodeId = (
    await db.catalogNode.create({
      data: {
        name: 'category',
        path: '/1/',
        depth: 0,
        sortOrder: 0,
        codePrefix: 'MAT',
        iconKey: 'zap',
      },
    })
  ).id;
  unitId = (await db.unit.create({ data: { name: 'unit' } })).id;
  supplierId = (
    await db.supplier.create({
      data: {
        name: 'Supplier P19',
        whatsappNumber: '201001234567',
        notes: '',
        contactPerson: '',
        categories: { create: { categoryId: nodeId } },
      },
    })
  ).id;
  engineer = await account('originator', [
    'requests.create',
    'requests.pause',
    'items.resolveExternally',
  ]);
  manager = await account('reviewer', [
    'requests.approve',
    'requests.editWhilePaused',
    'requests.returnForEdit',
    'requests.cancelAnyStage',
  ]);
  buyer = await account('buyer', [
    'purchasing.price',
    'purchasing.sendRfq',
    'purchasing.sendSupplyOrder',
    'purchasing.handleRemaining',
    'purchasing.returnForEdit',
  ]);
  // Follows prices on the site without any workflow key.
  accountant = await account('accountant', ['requests.viewPrices']);
  receiver = await account('receiver', ['receipt.record']);
  reader = await account('observer', ['requests.approve', 'receipt.record']);
  historian = await account('history', ['requests.viewTimeline']);
  await account(
    'outside',
    ['requests.approve', 'purchasing.price', 'receipt.record'],
    [],
  );
});
afterAll(() => db.$disconnect());
function http(user: User, method: Method, path: string, body?: object) {
  const req = api[method]('/api/v1' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', user.cookie);
  return body ? req.send(body) : req;
}
function recipients(type: string, partial: boolean): User[] {
  switch (type) {
    case 'SUBMITTED':
    case 'RESUBMITTED':
      return [manager, reader];
    case 'MANAGER_APPROVED':
    case 'RESUMED':
      return [buyer];
    case 'RETURNED_FOR_EDIT':
    case 'PURCHASING_RETURNED':
      return [engineer];
    case 'PRICING_SENT_FOR_RECEIPT':
      return [engineer, receiver, buyer, reader];
    case 'RECEIPT_RECORDED':
      return partial ? [buyer] : [];
    default:
      return [];
  }
}
async function events(
  id: number,
  after: number,
  actor: User,
  types: string[],
  partial = false,
) {
  const rows = await db.requestEvent.findMany({
    where: { requestId: id, id: { gt: after } },
    orderBy: { id: 'asc' },
    include: { notifications: { orderBy: { userId: 'asc' } } },
  });
  expect(rows.map((r) => r.type)).toEqual(types);
  for (const row of rows) {
    const system = ['COMPLETED', 'REJECTED_AUTO'].includes(row.type);
    expect(row.actorId).toBe(system ? null : actor.id);
    expect(row.notifications.map((n) => n.userId)).toEqual(
      recipients(row.type, partial)
        .map((u) => u.id)
        .filter((id) => id !== row.actorId)
        .sort((a, b) => a - b),
    );
  }
  return rows.at(-1)?.id ?? after;
}
async function scenario(count = 1) {
  const root = '/requests';
  const draft = (
    await http(engineer, 'post', root, { siteId, categoryId: nodeId }).expect(
      201,
    )
  ).body as Detail;
  expect(draft).toMatchObject({ status: 'DRAFT', items: [] });
  const path = root + '/' + draft.id;
  let cursor = await events(draft.id, 0, engineer, ['CREATED']);
  let version = draft.version;
  async function step(
    actor: User,
    method: Method,
    suffix: string,
    body: object,
    types: string[],
    status = 200,
    partial = false,
  ) {
    const result = (
      await http(actor, method, path + suffix, { version, ...body }).expect(
        status,
      )
    ).body;
    version = result.version;
    cursor = await events(draft.id, cursor, actor, types, partial);
    return result;
  }
  const saved: Detail = await step(
    engineer,
    'patch',
    '/draft',
    {
      items: Array.from({ length: count }, (_, i) => ({
        nodeId,
        unitId,
        otherName: 'material ' + i,
        quantity: '2',
        specs: '',
      })),
    },
    [],
  );
  const ids = saved.items.map((i) => i.id);
  const submitted = await step(engineer, 'post', '/submit', {}, ['SUBMITTED']);
  expect(submitted.status).toBe('AWAITING_MANAGER');
  return {
    id: draft.id,
    ids,
    step,
    approve: async () =>
      expect(
        await step(manager, 'post', '/approve', {}, ['MANAGER_APPROVED']),
      ).toMatchObject({ status: 'AT_PURCHASING' }),
    async batch() {
      const created = await step(
        buyer,
        'post',
        '/purchasing/batches',
        { itemIds: ids, supplierIds: [supplierId], message: 'طلب أسعار' },
        ['BATCH_CREATED'],
        201,
      );
      await step(
        buyer,
        'post',
        '/purchasing/batches/' +
          created.batch.id +
          '/suppliers/' +
          supplierId +
          '/sent',
        {},
        ['BATCH_SENT_MARKED'],
      );
    },
    price: (index = 0, reopened = false) =>
      step(
        buyer,
        'patch',
        '/purchasing/items/' + ids[index] + '/pricing',
        { supplierId, lineTotal: '3917.45' },
        reopened ? ['ITEM_AVAILABLE_AGAIN'] : [],
      ),
    unavailable: (index: number) =>
      step(
        buyer,
        'post',
        '/purchasing/items/' + ids[index] + '/unavailable',
        {},
        ['ITEM_UNAVAILABLE'],
      ),
    submit: () =>
      step(buyer, 'post', '/purchasing/submit-pricing', {}, [
        'PRICING_SENT_FOR_RECEIPT',
      ]),
    receipt: (
      index: number,
      quantity: string,
      complete = false,
      partial = false,
    ) =>
      step(
        receiver,
        'post',
        '/receipts',
        { lines: [{ itemId: ids[index], quantity }] },
        complete ? ['RECEIPT_RECORDED', 'COMPLETED'] : ['RECEIPT_RECORDED'],
        200,
        partial,
      ),
  };
}
it('carries a sent quote straight from pricing to receipt, a partial receipt, still-coming and completion', async () => {
  const s = await scenario();
  await s.approve();
  await s.batch();
  await s.price();
  expect(await s.submit()).toMatchObject({
    status: 'FULFILMENT',
    displayedStage: 'AWAITING_RECEIPT',
    items: [{ state: 'AWAITING_RECEIPT' }],
    rounds: [{ number: 1, status: 'SUBMITTED' }],
  });
  await s.step(buyer, 'post', '/supply-orders/1/sent', {}, [
    'SUPPLY_ORDER_SENT_MARKED',
  ]);
  expect(await s.receipt(0, '1', false, true)).toMatchObject({
    items: [{ state: 'REMAINING', receivedQty: '1.00' }],
  });
  expect(
    await s.step(buyer, 'post', '/items/' + s.ids[0] + '/still-coming', {}, [
      'ITEM_STILL_COMING',
    ]),
  ).toMatchObject({ items: [{ state: 'AWAITING_RECEIPT' }] });
  expect(await s.receipt(0, '1', true)).toMatchObject({
    status: 'COMPLETED',
    items: [{ state: 'RECEIVED', receivedQty: '2.00' }],
  });
});
it('finishes an unavailable line through a second submitted round', async () => {
  const s = await scenario(3);
  await s.approve();
  await s.unavailable(1);
  await s.unavailable(2);
  await s.price();
  await s.submit();
  expect(
    await s.step(
      engineer,
      'post',
      '/items/' + s.ids[2] + '/resolve-externally',
      {},
      ['ITEM_RESOLVED_EXTERNALLY'],
    ),
  ).toMatchObject({
    items: [
      { state: 'AWAITING_RECEIPT' },
      { state: 'UNAVAILABLE' },
      { state: 'RESOLVED_EXTERNALLY' },
    ],
  });
  await s.price(1, true);
  expect(await s.submit()).toMatchObject({
    items: [
      { state: 'AWAITING_RECEIPT' },
      { state: 'AWAITING_RECEIPT' },
      { state: 'RESOLVED_EXTERNALLY' },
    ],
    rounds: [{ status: 'SUBMITTED' }, { status: 'SUBMITTED' }],
  });
  await s.receipt(1, '2');
  expect(await s.receipt(0, '2', true)).toMatchObject({
    status: 'COMPLETED',
    items: [
      { state: 'RECEIVED' },
      { state: 'RECEIVED' },
      { state: 'RESOLVED_EXTERNALLY' },
    ],
  });
});
it('links both sides when a request awaiting receipt is copied to a draft', async () => {
  const s = await scenario();
  await s.approve();
  await s.price();
  await s.submit();
  const copied = await s.step(
    engineer,
    'post',
    '/copy',
    {},
    ['COPIED_TO'],
    201,
  );
  expect(copied).toMatchObject({
    status: 'DRAFT',
    createdById: engineer.id,
    copiedFromId: s.id,
    items: [{ state: 'OPEN' }],
  });
  await events(copied.id, 0, engineer, ['COPIED_FROM']);
});
it('returns through both review desks and reprices an edited sent line after resuming', async () => {
  const s = await scenario();
  expect(
    await s.step(manager, 'post', '/return', { reason: 'راجع' }, [
      'RETURNED_FOR_EDIT',
    ]),
  ).toMatchObject({ status: 'RETURNED' });
  await s.step(engineer, 'post', '/resubmit', {}, ['RESUBMITTED']);
  await s.approve();
  expect(
    await s.step(buyer, 'post', '/purchasing-return', { reason: 'راجع' }, [
      'PURCHASING_RETURNED',
    ]),
  ).toMatchObject({ status: 'PAUSED' });
  await s.step(engineer, 'post', '/resume', {}, ['RESUMED']);
  await s.batch();
  await s.price();
  expect(
    await s.step(engineer, 'post', '/pause', { reason: 'تعديل' }, ['PAUSED']),
  ).toMatchObject({ status: 'PAUSED' });
  expect(
    await s.step(
      manager,
      'patch',
      '/paused-edit',
      { change: [{ itemId: s.ids[0], fields: { quantity: '3' } }] },
      ['EDITED'],
    ),
  ).toMatchObject({
    isModified: true,
    items: [{ needsRepricing: true, modifiedAfterSend: true }],
  });
  await s.step(engineer, 'post', '/resume', {}, ['RESUMED']);
  expect(await s.price()).toMatchObject({ items: [{ needsRepricing: false }] });
  expect(await s.submit()).toMatchObject({
    status: 'FULFILMENT',
    items: [{ state: 'AWAITING_RECEIPT' }],
  });
});
it.each([
  'AWAITING_MANAGER',
  'RETURNED',
  'AT_PURCHASING',
  'PAUSED',
  'FULFILMENT',
])('cancels at %s and retains receipts', async (stage) => {
  const s = await scenario();
  if (stage === 'RETURNED')
    await s.step(manager, 'post', '/return', { reason: 'راجع' }, [
      'RETURNED_FOR_EDIT',
    ]);
  if (!['RETURNED', 'AWAITING_MANAGER'].includes(stage)) await s.approve();
  if (stage === 'PAUSED')
    await s.step(engineer, 'post', '/pause', { reason: 'تعديل' }, ['PAUSED']);
  if (stage === 'FULFILMENT') {
    await s.price();
    await s.submit();
    await s.receipt(0, '1', false, true);
  }
  expect(
    await s.step(manager, 'post', '/cancel', { reason: 'إلغاء' }, [
      'CANCELLED',
    ]),
  ).toMatchObject({
    status: 'CANCELLED',
    items: [
      {
        state: 'CANCELLED',
        receivedQty: stage === 'FULFILMENT' ? '1.00' : '0.00',
      },
    ],
  });
});

it('redacts a populated purchase across detail, round, timeline, list and inbox', async () => {
  const s = await scenario();
  await s.approve();
  await s.batch();
  await s.price();
  await s.submit();
  const base = '/requests/' + s.id;
  for (const path of [base, base + '/purchasing', '/requests', '/inbox']) {
    const result = await http(reader, 'get', path).expect(200);
    expect(result.text).toContain('PR-');
    expect(result.text).not.toMatch(
      /Supplier P19|3917\.45|"(?:lineTotal|unitPrice|deliveryFee|supplierId|supplierName|roundTotal|events|timeline|actorRoleName)":/,
    );
  }
  await http(reader, 'get', base + '/timeline').expect(403);
  const timeline = await http(historian, 'get', base + '/timeline').expect(200);
  expect(timeline.text).toContain('PRICING_SENT_FOR_RECEIPT');
  expect(timeline.text).not.toMatch(
    /Supplier P19|3917\.45|"(?:lineTotal|supplierIds?|deliveryFee|roundTotal)":/,
  );
  // The round history needs price visibility; supplier names stay hidden without their key.
  await http(reader, 'get', base + '/rounds/1').expect(403);
  const round = await http(accountant, 'get', base + '/rounds/1').expect(200);
  expect(round.body.roundTotal).toBe('3917.45');
  expect(round.text).not.toMatch(/Supplier P19|"supplier":/);
});
