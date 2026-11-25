import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import { requestStatuses } from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

const env = parseEnv(process.env);
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => new Date('2033-03-01T09:00:00Z'),
});
const db: PrismaClient = app.locals.db;
const api = request(app);
type Method = 'get' | 'post' | 'patch';
type User = { id: number; cookie: string };
type Row = {
  id: number;
  version: number;
  status: string;
  displayedStage: string;
  siteId: number;
  availableActions: { action: string }[];
  items: { id: number; [key: string]: unknown }[];
  deliveryFee?: unknown;
};

let east: number, west: number, categoryId: number, unitId: number;
let supplierId: number;
let maker: User,
  westMaker: User,
  manager: User,
  pricer: User,
  returner: User,
  allBuyer: User,
  westBuyer: User,
  unassigned: User,
  reader: User,
  support: User;
const byStatus = new Map<string, number>();
let westRequest: number;

async function user(
  username: string,
  keys: PermissionKey[],
  sites: number[],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
): Promise<User> {
  const { id } = await makeUser(db, username, keys, scope, sites);
  const res = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return { id, cookie: String(res.headers['set-cookie']![0]).split(';')[0]! };
}
function send(method: Method, path: string, who: User, body?: object) {
  const req = api[method]('/api/v1/requests' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', who.cookie);
  return body ? req.send(body) : req;
}
async function workspace(who: User, query = '') {
  return (
    await send('get', '?workspace=purchasing&pageSize=100' + query, who).expect(
      200,
    )
  ).body as { items: Row[]; total: number };
}
async function draft(who: User, siteId: number): Promise<Row> {
  const created = (
    await send('post', '', who, { siteId, categoryId }).expect(201)
  ).body as Row;
  return (
    await send('patch', '/' + created.id + '/draft', who, {
      version: created.version,
      items: [
        {
          nodeId: categoryId,
          unitId,
          otherName: 'بلاط',
          specs: '',
          quantity: '3.00',
        },
      ],
    }).expect(200)
  ).body;
}
async function act(
  row: Row,
  path: string,
  who: User,
  extra: object = {},
): Promise<Row> {
  return (
    await send('post', '/' + row.id + path, who, {
      version: row.version,
      ...extra,
    }).expect(200)
  ).body;
}
const reason = { reason: 'سبب للاختبار' };

beforeAll(async () => {
  await resetDb();
  // Startup seeds this singleton; submitting pricing reads it to write supply orders.
  await db.settings.create({ data: { id: 1, ...defaultSettings } });
  east = (await db.site.create({ data: { name: 'شرق' } })).id;
  west = (await db.site.create({ data: { name: 'غرب' } })).id;
  const node = await db.catalogNode.create({
    data: {
      name: 'سيراميك',
      codePrefix: 'CER',
      iconKey: 'grid-2x2',
      sortOrder: 0,
      depth: 0,
      path: 'pending',
    },
  });
  categoryId = (
    await db.catalogNode.update({
      where: { id: node.id },
      data: { path: '/' + node.id + '/' },
    })
  ).id;
  unitId = (await db.unit.create({ data: { name: 'متر' } })).id;
  supplierId = (
    await db.supplier.create({
      data: {
        name: 'مورد السيراميك',
        whatsappNumber: '201001234567',
        contactPerson: '',
        notes: '',
        categories: { create: { categoryId } },
      },
    })
  ).id;
  maker = await user('ws-maker', ['requests.create'], [east]);
  westMaker = await user('ws-maker-west', ['requests.create'], [west]);
  manager = await user(
    'ws-manager',
    [
      'requests.approve',
      'requests.reject',
      'requests.returnForEdit',
      'requests.cancelAnyStage',
    ],
    [east, west],
  );
  pricer = await user(
    'ws-pricer',
    ['purchasing.price', 'requests.pause'],
    [east],
  );
  returner = await user('ws-returner', ['purchasing.returnForEdit'], [east]);
  allBuyer = await user('ws-all', ['purchasing.sendRfq'], [], 'ALL');
  westBuyer = await user('ws-west', ['purchasing.price'], [west]);
  unassigned = await user('ws-nosite', ['purchasing.price'], []);
  reader = await user('ws-reader', ['requests.view'], [east]);
  support = await user('ws-support', [], []);
  await db.user.update({
    where: { id: support.id },
    data: { isSuperadmin: true, roleId: null },
  });

  // Walk one east request into each lifecycle status through the real API.
  byStatus.set('DRAFT', (await draft(maker, east)).id);
  const submit = async () => act(await draft(maker, east), '/submit', maker);
  byStatus.set('AWAITING_MANAGER', (await submit()).id);
  byStatus.set(
    'RETURNED',
    (await act(await submit(), '/return', manager, reason)).id,
  );
  byStatus.set(
    'REJECTED',
    (await act(await submit(), '/reject', manager, reason)).id,
  );
  const approve = async () => act(await submit(), '/approve', manager);
  byStatus.set('AT_PURCHASING', (await approve()).id);
  byStatus.set(
    'PAUSED',
    (await act(await approve(), '/pause', pricer, reason)).id,
  );
  byStatus.set(
    'CANCELLED',
    (await act(await approve(), '/cancel', manager, reason)).id,
  );
  const toPrice = await approve();
  const priced = (
    await send(
      'patch',
      '/' +
        toPrice.id +
        '/purchasing/items/' +
        toPrice.items[0]!.id +
        '/pricing',
      pricer,
      { version: toPrice.version, supplierId, lineTotal: '120.50' },
    ).expect(200)
  ).body as Row;
  byStatus.set(
    'FULFILMENT',
    (await act(priced, '/purchasing/submit-pricing', pricer)).id,
  );
  // Completion needs a full receipt cycle; a stored terminal row is enough for listing.
  byStatus.set(
    'COMPLETED',
    (
      await db.request.create({
        data: {
          number: 'PR-2033-09999',
          siteId: east,
          categoryId,
          createdById: maker.id,
          version: 9,
          status: 'COMPLETED',
          displayedStage: 'COMPLETED',
          stageStartedAt: new Date('2033-02-01T09:00:00Z'),
          submittedAt: new Date('2033-01-20T09:00:00Z'),
          urgency: 'NORMAL',
          urgencyLocked: false,
          isModified: false,
        },
      })
    ).id,
  );
  westRequest = (
    await act(
      await act(await draft(westMaker, west), '/submit', westMaker),
      '/approve',
      manager,
    )
  ).id;
}, 60000);
afterAll(() => db.$disconnect());

it('lists every lifecycle state in the viewer’s sites with each request’s current status', async () => {
  expect([...byStatus.keys()].sort()).toEqual([...requestStatuses].sort());
  const { items, total } = await workspace(pricer);
  expect(total).toBe(byStatus.size);
  expect(new Map(items.map((row) => [row.status, row.id]))).toEqual(byStatus);
  expect(items.every((row) => row.siteId === east)).toBe(true);
  const stages = new Map(items.map((row) => [row.id, row.displayedStage]));
  expect(stages.get(byStatus.get('DRAFT')!)).toBe('DRAFT');
  expect(stages.get(byStatus.get('RETURNED')!)).toBe('RETURNED');
  // Submitted pricing goes straight to the site: there is no approval stage in between.
  expect(stages.get(byStatus.get('FULFILMENT')!)).toBe('AWAITING_RECEIPT');
  // The actionable queue remains narrower than the workspace.
  const queue = (
    await send('get', '?queue=purchasing&pageSize=100', pricer).expect(200)
  ).body as { items: Row[] };
  expect(queue.items.map((row) => row.id)).toEqual([
    byStatus.get('AT_PURCHASING'),
  ]);
  const both = (
    await send(
      'get',
      '?workspace=purchasing&queue=purchasing&pageSize=100',
      pricer,
    ).expect(200)
  ).body as { items: Row[] };
  expect(both.items.map((row) => row.id)).toEqual(
    queue.items.map((row) => row.id),
  );
  const returned = await workspace(pricer, '&stage=RETURNED');
  expect(returned.items.map((row) => row.id)).toEqual([
    byStatus.get('RETURNED'),
  ]);
  const drafts = await workspace(pricer, '&status=DRAFT');
  expect(drafts.items.map((row) => row.id)).toEqual([byStatus.get('DRAFT')]);
});

it('isolates sites and enforces registered purchasing keys', async () => {
  const eastIds = [...byStatus.values()].sort((a, b) => a - b);
  const ids = async (who: User) =>
    (await workspace(who)).items.map((row) => row.id).sort((a, b) => a - b);
  expect(await ids(westBuyer)).toEqual([westRequest]);
  expect(await ids(unassigned)).toEqual([]);
  expect(await ids(allBuyer)).toEqual([...eastIds, westRequest]);
  expect(await ids(support)).toEqual([...eastIds, westRequest]);
  // A foreign site filter returns nothing instead of leaking another site's requests.
  expect(
    (await workspace(westBuyer, '&siteId=' + east)).items.map((row) => row.id),
  ).toEqual([]);
  await send('get', '/' + byStatus.get('DRAFT'), westBuyer).expect(404);
  await send('get', '/' + byStatus.get('DRAFT'), pricer).expect(200);
  // Viewing requests alone does not open the purchasing workspace.
  await send('get', '?workspace=purchasing', reader).expect(403);
  await send('get', '?workspace=purchasing', maker).expect(403);
  expect(
    (await send('get', '?pageSize=100', reader).expect(200)).body.total,
  ).toBe(byStatus.size);
  await send('get', '?workspace=all', pricer).expect(422);
  await send('get', '?workspace=purchasing&stage=LATER', pricer).expect(422);
});

it('keeps action permissions, transition rules and field redaction', async () => {
  const pricerRows = new Map(
    (await workspace(pricer)).items.map((row) => [row.id, row]),
  );
  const actions = (row: Row | undefined) =>
    row?.availableActions.map(({ action }) => action) ?? [];
  // Seeing a draft or a request under review grants none of its creator or manager actions.
  // T26 already lets purchasing.price edit the separate delivery fee in every open status.
  for (const status of ['DRAFT', 'AWAITING_MANAGER', 'RETURNED']) {
    const row = pricerRows.get(byStatus.get(status)!)!;
    expect(actions(row)).toEqual(['editDeliveryFee']);
    const detail = (await send('get', '/' + row.id, pricer).expect(200))
      .body as Row;
    expect(actions(detail)).toEqual(actions(row));
  }
  expect(actions(pricerRows.get(byStatus.get('COMPLETED')!))).toEqual([]);
  const returnerRows = (await workspace(returner)).items;
  for (const status of ['DRAFT', 'AWAITING_MANAGER', 'RETURNED'])
    expect(
      actions(returnerRows.find((row) => row.id === byStatus.get(status))),
    ).toEqual([]);
  expect(actions(pricerRows.get(byStatus.get('AT_PURCHASING')!))).toContain(
    'savePricingDraft',
  );
  const draftRow = pricerRows.get(byStatus.get('DRAFT')!)!;
  await send('post', '/' + draftRow.id + '/submit', pricer, {
    version: draftRow.version,
  }).expect(403);
  const review = pricerRows.get(byStatus.get('AWAITING_MANAGER')!)!;
  await send('post', '/' + review.id + '/approve', pricer, {
    version: review.version,
  }).expect(403);
  const returnedRow = pricerRows.get(byStatus.get('RETURNED')!)!;
  await send('post', '/' + returnedRow.id + '/purchasing-return', returner, {
    version: returnedRow.version,
    ...reason,
  }).expect(409);
  // Prices and supplier identities follow their own visibility keys in the list.
  const fulfilment = byStatus.get('FULFILMENT')!;
  expect(pricerRows.get(fulfilment)?.items[0]).toMatchObject({
    lineTotal: '120.50',
    supplierId,
  });
  const hidden = (await workspace(returner)).items.find(
    (row) => row.id === fulfilment,
  )!;
  expect(hidden.items[0]).not.toHaveProperty('lineTotal');
  expect(hidden.items[0]).not.toHaveProperty('unitPrice');
  expect(hidden.items[0]).not.toHaveProperty('supplierId');
  expect(hidden).not.toHaveProperty('deliveryFee');
  const named = (await workspace(allBuyer)).items.find(
    (row) => row.id === fulfilment,
  )!;
  expect(named.items[0]).not.toHaveProperty('lineTotal');
  expect(named.items[0]).toMatchObject({ supplierId });
});
