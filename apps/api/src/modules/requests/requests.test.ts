import type { PrismaClient } from '@prisma/client';
import { ar } from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { verifyAudit } from '../access/audit.js';

const env = parseEnv(process.env);
let now = new Date('2030-06-01T10:00:00Z');
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => now,
});
const db: PrismaClient = app.locals.db;
const api = request(app);
const root = '/api/v1/requests';
type Method = 'get' | 'post' | 'patch' | 'delete';
type User = { id: number; cookie: string };
let creator: User,
  manager: User,
  otherSite: User,
  all: User,
  buyer: User,
  denied: User,
  reader: User,
  support: User;
let siteId: number,
  secondSite: number,
  inactiveSite: number,
  categoryId: number,
  otherCategory: number,
  groupId: number,
  unitId: number;
let catalogItemId: number, supplierId: number;
const keys: PermissionKey[] = [
  'requests.create',
  'requests.approve',
  'requests.reject',
  'requests.returnForEdit',
  'requests.editQuantities',
  'requests.raiseUrgency',
  'requests.viewTimeline',
  'requests.viewPrices',
  'requests.viewSupplierNames',
  'catalog.create',
];
function send(method: Method, path: string, body?: object, user = creator) {
  const test = api[method](root + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', user.cookie);
  return body ? test.send(body) : test;
}
async function user(
  name: string,
  permissions: PermissionKey[],
  sites: number[],
  scope: 'ASSIGNED' | 'ALL' = 'ASSIGNED',
) {
  const row = await makeUser(db, name, permissions, scope, sites);
  const login = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username: name, password: testPassword })
    .expect(204);
  return {
    id: row.id,
    cookie: String(login.headers['set-cookie']![0]).split(';')[0]!,
  };
}
async function node(
  name: string,
  parentId: number | null,
  prefix: string | null,
) {
  const created = await db.catalogNode.create({
    data: {
      name,
      parentId,
      codePrefix: prefix,
      iconKey: parentId === null ? 'zap' : null,
      sortOrder: 0,
      depth: parentId === null ? 0 : 1,
      path: 'pending',
    },
  });
  return (
    await db.catalogNode.update({
      where: { id: created.id },
      data: {
        path:
          (parentId === null ? '/' : '/' + parentId + '/') + created.id + '/',
      },
    })
  ).id;
}
async function catalogItem(code: string, name = 'سيراميك') {
  return db.catalogItem.create({
    data: {
      code,
      name,
      description: '',
      searchText: name,
      nodeId: groupId,
      unitId,
    },
  });
}
beforeAll(async () => {
  await resetDb();
  siteId = (await db.site.create({ data: { name: 'شرق' } })).id;
  secondSite = (await db.site.create({ data: { name: 'غرب' } })).id;
  inactiveSite = (
    await db.site.create({ data: { name: 'قديم', isActive: false } })
  ).id;
  categoryId = await node('تشطيبات', null, 'FIN');
  groupId = await node('أرضيات', categoryId, null);
  otherCategory = await node('أدوات', null, 'TLS');
  unitId = (await db.unit.create({ data: { name: 'متر' } })).id;
  catalogItemId = (await catalogItem('FIN-BASE')).id;
  supplierId = (
    await db.supplier.create({
      data: {
        name: 'مورد تجريبي',
        contactPerson: '',
        whatsappNumber: '201000000000',
        notes: '',
      },
    })
  ).id;
  creator = await user(
    'request-creator',
    [
      'requests.create',
      'requests.approve',
      'requests.viewTimeline',
      'catalog.create',
    ],
    [siteId, inactiveSite],
  );
  manager = await user('request-manager', keys, [siteId]);
  otherSite = await user('request-elsewhere', keys, [secondSite]);
  all = await user(
    'request-all',
    [
      'requests.approve',
      'requests.create',
      'requests.viewTimeline',
      'catalog.view',
    ],
    [],
    'ALL',
  );
  buyer = await user('request-buyer', ['purchasing.price'], [siteId]);
  reader = await user('request-reader', ['requests.viewTimeline'], [siteId]);
  denied = await user('request-denied', [], [siteId]);
  support = await user('request-support', [], [], 'ALL');
  await db.user.update({
    where: { id: support.id },
    data: { isSuperadmin: true, roleId: null },
  });
  const inactive = await user(
    'request-inactive',
    ['requests.approve'],
    [siteId],
  );
  await db.user.update({
    where: { id: inactive.id },
    data: { isActive: false },
  });
});
afterAll(() => db.$disconnect());

const catalogLine = (id = catalogItemId) => ({
  catalogItemId: id,
  quantity: '4.25',
  specs: 'اللون حسب العينة',
});
const otherLine = () => ({
  nodeId: groupId,
  unitId,
  otherName: 'بند خاص',
  quantity: '2',
  specs: '',
});
async function create(user = creator, site = siteId) {
  return (
    await send('post', '/', { siteId: site, categoryId }, user).expect(201)
  ).body;
}
async function save(
  draft: { id: number; version: number },
  items: object[] = [catalogLine()],
) {
  return (
    await send('patch', '/' + draft.id + '/draft', {
      version: draft.version,
      items,
    }).expect(200)
  ).body;
}
async function draft(items: object[] = [catalogLine()]) {
  return save(await create(), items);
}
async function submit(draft: { id: number; version: number }) {
  return (
    await send('post', '/' + draft.id + '/submit', {
      version: draft.version,
    }).expect(200)
  ).body;
}
function path(id: number, suffix = '') {
  return '/' + id + suffix;
}

it('validates site, scope, category, units, line identity and quantity before autosave', async () => {
  await send('post', '/', { siteId: inactiveSite, categoryId }).expect(422);
  await send('post', '/', { siteId: secondSite, categoryId }).expect(404);
  await send('post', '/', { siteId, categoryId: groupId }).expect(422);
  await send('post', '/', { siteId, categoryId: 999999 }).expect(422);
  const empty = await create();
  expect(empty).toMatchObject({
    number: null,
    version: 1,
    urgency: 'NORMAL',
    status: 'DRAFT',
    displayedStage: 'DRAFT',
    items: [],
  });
  await send('post', path(empty.id, '/submit'), { version: 1 }).expect(422);
  for (const item of [
    { ...catalogLine(), quantity: '0' },
    { ...otherLine(), unitId: 999 },
    { ...otherLine(), nodeId: otherCategory },
    { ...catalogLine(), id: 999 },
    { ...catalogLine(), snapshot: { name: 'مزيف' } },
  ]) {
    await send('patch', path(empty.id, '/draft'), {
      version: 1,
      items: [item],
    }).expect(422);
  }
  await send('patch', path(empty.id, '/draft'), {
    version: 1,
    siteId: secondSite,
    items: [],
  }).expect(404);
  await send(
    'patch',
    path(empty.id, '/draft'),
    { version: 1, items: [catalogLine()] },
    manager,
  ).expect(403);
  const saved = await save(empty, [catalogLine(), otherLine()]);
  expect(saved.items).toMatchObject([
    {
      lineNo: 1,
      specs: 'اللون حسب العينة',
      quantity: '4.25',
      snapshot: {
        code: 'FIN-BASE',
        unitName: 'متر',
        nodePath: ['تشطيبات', 'أرضيات'],
      },
    },
    { lineNo: 2, isOther: true, snapshot: { name: 'بند خاص', code: null } },
  ]);
  const [first, second] = saved.items;
  const swapped = await save(saved, [
    { ...otherLine(), id: second.id },
    { ...catalogLine(), id: first.id },
  ]);
  expect(swapped.items.map((line: { id: number }) => line.id)).toEqual([
    second.id,
    first.id,
  ]);
  const removed = await save(swapped, [{ ...catalogLine(), id: first.id }]);
  expect(removed.items).toMatchObject([{ id: first.id, lineNo: 1 }]);
  const timeline = await send('get', path(empty.id, '/timeline')).expect(200);
  expect(
    timeline.body.items.map((event: { type: string }) => event.type),
  ).toEqual(['CREATED']);
  await expect(
    db.requestEvent.update({
      where: { id: timeline.body.items[0].id },
      data: { type: 'EDITED' },
    }),
  ).rejects.toThrow('Request events are append-only');
  await send('delete', path(empty.id), {
    version: removed.version,
    confirm: false,
  }).expect(422);
  await send('delete', path(empty.id), {
    version: removed.version,
    confirm: true,
  }).expect(204);
  await send('get', path(empty.id)).expect(404);
  expect(await db.requestEvent.count({ where: { requestId: empty.id } })).toBe(
    0,
  );
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: 'request.deleteDraft', entityId: String(empty.id) },
  });
  expect(verifyAudit(env.AUDIT_HMAC_SECRET, audit)).toBe(true);
});

it('provides scoped picker options and keeps a selected catalog-line unit through submit', async () => {
  const alternative = await db.unit.create({ data: { name: 'علبة' } });
  const options = (await send('get', '/options').expect(200)).body;
  expect(options.sites.map(({ id }: { id: number }) => id)).toEqual([
    siteId,
    inactiveSite,
  ]);
  expect(options.categories).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: categoryId, iconKey: 'zap' }),
    ]),
  );
  expect(options.units).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: alternative.id })]),
  );
  await send('get', '/options', undefined, denied).expect(403);
  expect(
    (await send('get', '/options', undefined, reader).expect(200)).body.units,
  ).toEqual([]);
  const request = await create();
  await send('patch', path(request.id, '/draft'), {
    version: request.version,
    items: [{ ...catalogLine(), unitId: 99999 }],
  }).expect(422);
  const saved = await save(request, [
    { ...catalogLine(), unitId: alternative.id },
  ]);
  expect(saved.items[0]).toMatchObject({
    unitId: alternative.id,
    snapshot: { unitName: 'علبة' },
  });
  const submitted = await submit(saved);
  expect(submitted.items[0]).toMatchObject({
    unitId: alternative.id,
    snapshot: { unitName: 'علبة' },
  });
});

it('assigns gap-free consecutive numbers across 30 concurrent submits and Cairo year rollover', async () => {
  now = new Date('2030-12-31T21:59:59Z');
  const left = await submit(await draft());
  expect(left.number).toMatch(/^PR-2030-/);
  now = new Date('2030-12-31T22:00:00Z');
  const empty = await create();
  await send('post', path(empty.id, '/submit'), {
    version: empty.version,
  }).expect(422);
  const drafts = await Promise.all(Array.from({ length: 30 }, () => draft()));
  const results = await Promise.all(drafts.map(submit));
  const expected = Array.from(
    { length: 30 },
    (_, i) => 'PR-2031-' + String(i + 1).padStart(5, '0'),
  );
  expect(results.map((result) => result.number).sort()).toEqual(expected);
  const competing = await draft();
  const responses = await Promise.all(
    [1, 2].map(() =>
      send('post', path(competing.id, '/submit'), {
        version: competing.version,
      }),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  expect(
    responses.find((response) => response.status === 409)?.body,
  ).toMatchObject({
    error: 'VERSION_CONFLICT',
    message: ar.lifecycle.errors.VERSION_CONFLICT,
  });
  expect((await submit(await draft())).number).toBe('PR-2031-00032');
}, 30000);

it('returns, edits, resubmits, adjusts quantities and approves with audit, diff and recipient rows', async () => {
  now = new Date('2031-04-15T10:00:00Z');
  const saved = await draft([catalogLine(), otherLine()]);
  const oldName = (
    await db.catalogItem.findUniqueOrThrow({ where: { id: catalogItemId } })
  ).name;
  await db.catalogItem.update({
    where: { id: catalogItemId },
    data: { name: 'اسم وقت الإرسال' },
  });
  const submitted = await submit(saved);
  expect(submitted.items[0].snapshot.name).toBe('اسم وقت الإرسال');
  await db.catalogItem.update({
    where: { id: catalogItemId },
    data: { name: oldName },
  });
  const id = submitted.id;
  await send(
    'post',
    path(id, '/return'),
    { version: submitted.version, reason: '  ' },
    manager,
  ).expect(422);
  const returned = (
    await send(
      'post',
      path(id, '/return'),
      { version: submitted.version, reason: 'راجع المواصفات' },
      manager,
    ).expect(200)
  ).body;
  expect(returned.status).toBe('RETURNED');
  expect(
    returned.availableActions.some(
      (action: { action: string }) => action.action === 'resubmit',
    ),
  ).toBe(false);
  const edited = (
    await send('patch', path(id), {
      version: returned.version,
      note: 'بعد المراجعة',
      items: [
        { ...catalogLine(), id: submitted.items[0].id, specs: 'رمادي مط' },
        otherLine(),
      ],
    }).expect(200)
  ).body;
  expect(edited).toMatchObject({
    isModified: true,
    items: [{ lineNo: 1 }, { lineNo: 3 }],
    stateCounts: { OPEN: 2, REMOVED: 1 },
  });
  const resubmitted = (
    await send('post', path(id, '/resubmit'), {
      version: edited.version,
    }).expect(200)
  ).body;
  expect(resubmitted.number).toBe(submitted.number);
  const quantities = (
    await send(
      'patch',
      path(id, '/quantities'),
      {
        version: resubmitted.version,
        lines: [{ itemId: edited.items[0].id, quantity: '8.25' }],
      },
      manager,
    ).expect(200)
  ).body;
  await send(
    'post',
    path(id, '/approve'),
    { version: resubmitted.version },
    manager,
  ).expect(409);
  const approved = (
    await send(
      'post',
      path(id, '/approve'),
      { version: quantities.version },
      manager,
    ).expect(200)
  ).body;
  expect(approved).toMatchObject({
    status: 'AT_PURCHASING',
    approvedById: manager.id,
    items: [{ quantity: '8.25' }, { lineNo: 3 }],
  });
  const rows = (await send('get', path(id, '/timeline')).expect(200)).body
    .items;
  expect(rows.map((row: { type: string }) => row.type)).toEqual([
    'CREATED',
    'SUBMITTED',
    'RETURNED_FOR_EDIT',
    'EDITED',
    'RESUBMITTED',
    'EDITED',
    'MANAGER_APPROVED',
  ]);
  expect(rows[2]).toMatchObject({
    actorId: manager.id,
    actorName: 'request-manager',
    actorRoleName: 'request-manager',
    payload: { reason: 'راجع المواصفات' },
  });
  expect(rows[3].payload).toMatchObject({
    fields: [{ field: 'note', before: null, after: 'بعد المراجعة' }],
    added: [{ lineNo: 3 }],
    removed: [{ lineNo: 2 }],
    changed: [
      {
        lineNo: 1,
        fields: expect.arrayContaining([
          { field: 'specs', before: 'اللون حسب العينة', after: 'رمادي مط' },
        ]),
      },
    ],
  });
  expect(rows[5].payload.changed[0].fields).toEqual([
    { field: 'quantity', before: '4.25', after: '8.25' },
  ]);
  const recipients = await db.notification.findMany({
    where: { requestId: id },
    include: { event: true },
    orderBy: { id: 'asc' },
  });
  const ids = (type: string) =>
    recipients
      .filter((row) => row.event.type === type)
      .map((row) => row.userId)
      .sort();
  expect(ids('SUBMITTED')).toEqual([all.id, manager.id].sort());
  expect(ids('RESUBMITTED')).toEqual([all.id, manager.id].sort());
  expect(ids('RETURNED_FOR_EDIT')).toEqual([creator.id]);
  expect(ids('MANAGER_APPROVED')).toEqual([buyer.id]);
  expect(recipients.map((row) => row.userId)).not.toContain(support.id);
  expect(
    await db.auditLog.count({
      where: { entity: 'Request', entityId: String(id) },
    }),
  ).toBe(8);
});

it('locks urgency, keeps stage time, and rejects with a reason', async () => {
  const s = await submit(await draft());
  now = new Date(+now + 60000);
  const raised = (
    await send(
      'post',
      path(s.id, '/urgency'),
      { version: s.version, urgency: 'URGENT' },
      manager,
    ).expect(200)
  ).body;
  expect(raised).toMatchObject({
    urgency: 'URGENT',
    urgencyLocked: true,
    stageStartedAt: s.stageStartedAt,
  });
  await send('patch', path(s.id), {
    version: raised.version,
    urgency: 'NORMAL',
  })
    .expect(409)
    .expect(({ body }) => expect(body.error).toBe('URGENCY_LOCKED'));
  const highest = (
    await send(
      'post',
      path(s.id, '/urgency'),
      { version: raised.version, urgency: 'VERY_URGENT' },
      manager,
    ).expect(200)
  ).body;
  await send(
    'post',
    path(s.id, '/reject'),
    { version: highest.version },
    manager,
  ).expect(422);
  const done = (
    await send(
      'post',
      path(s.id, '/reject'),
      { version: highest.version, reason: 'الكمية غير مطلوبة' },
      manager,
    ).expect(200)
  ).body;
  expect(done).toMatchObject({ status: 'REJECTED', stageStartedAt: null });
  expect(
    await db.notification.count({
      where: { requestId: s.id, event: { type: 'URGENCY_CHANGED' } },
    }),
  ).toBe(0);
  expect(
    await db.notification.count({
      where: {
        requestId: s.id,
        userId: creator.id,
        event: { type: 'MANAGER_REJECTED' },
      },
    }),
  ).toBe(1);
});

it('redacts prices, supplier identifiers, and timeline access independently', async () => {
  const s = await submit(await draft());
  await db.request.update({
    where: { id: s.id },
    data: { deliveryFee: '12.00' },
  });
  await db.requestItem.update({
    where: { id: s.items[0].id },
    data: { supplierId, lineTotal: '25.10', pricedQuantity: '4.25' },
  });
  const event = {
    requestId: s.id,
    actorId: manager.id,
    actorName: 'اسم محفوظ',
    actorRoleName: 'اسم وقت الحدث',
    at: now,
    stageAfter: 'AWAITING_MANAGER' as const,
    itemIds: [s.items[0].id],
  };
  await db.requestEvent.createMany({
    data: [
      {
        ...event,
        type: 'PRICING_SUBMITTED',
        payload: {
          roundNo: 1,
          roundTotal: '25.10',
          deliveryFee: '12.00',
          items: [
            {
              itemId: s.items[0].id,
              lineNo: 1,
              catalogItemId,
              supplierId,
              lineTotal: '25.10',
              quantity: '4.25',
            },
          ],
        },
      },
      {
        ...event,
        type: 'DELIVERY_FEE_CHANGED',
        payload: { before: null, after: '12.00' },
      },
    ],
  });
  const hidden = (await send('get', path(s.id), undefined, reader).expect(200))
    .body;
  expect(hidden).not.toHaveProperty('deliveryFee');
  for (const key of ['lineTotal', 'pricedQuantity', 'supplierId'])
    expect(hidden.items[0]).not.toHaveProperty(key);
  const visible = (
    await send('get', path(s.id), undefined, manager).expect(200)
  ).body;
  expect(visible).toMatchObject({
    deliveryFee: '12.00',
    items: [{ supplierId, lineTotal: '25.10' }],
  });
  await send('get', path(s.id, '/timeline'), undefined, buyer).expect(403);
  const hiddenEvents = (
    await send('get', path(s.id, '/timeline'), undefined, reader).expect(200)
  ).body.items;
  expect(hiddenEvents.at(-2).payload).toEqual({
    roundNo: 1,
    items: [
      { itemId: s.items[0].id, lineNo: 1, catalogItemId, quantity: '4.25' },
    ],
  });
  expect(hiddenEvents.at(-1).payload).toEqual({});
  expect(hiddenEvents.at(-2)).toMatchObject({
    actorName: 'اسم محفوظ',
    actorRoleName: 'اسم وقت الحدث',
  });
  const list = (
    await send('get', '/?q=' + s.number, undefined, reader).expect(200)
  ).body.items;
  expect(list).toEqual([hidden]);
  const visibleEvents = (
    await send('get', path(s.id, '/timeline'), undefined, manager).expect(200)
  ).body.items;
  expect(visibleEvents.at(-2).payload.items[0]).toMatchObject({
    supplierId,
    lineTotal: '25.10',
  });
});

it('copies fresh catalog data, converts inactive entries to other, and hides cross-site timeline links', async () => {
  const second = (await catalogItem('FIN-INACTIVE', 'اسم سابق')).id;
  const s = await submit(
    await draft([catalogLine(), catalogLine(second), otherLine()]),
  );
  await db.catalogItem.update({
    where: { id: second },
    data: { isActive: false },
  });
  await db.catalogItem.update({
    where: { id: catalogItemId },
    data: { name: 'اسم حالي' },
  });
  await send('post', path(s.id, '/copy'), {
    version: s.version,
    siteId: secondSite,
  }).expect(404);
  await send('post', path(s.id, '/copy'), {
    version: s.version,
    itemIds: [s.items[0].id],
  }).expect(422);
  const copied = (
    await send(
      'post',
      path(s.id, '/copy'),
      { version: s.version, siteId: secondSite },
      all,
    ).expect(201)
  ).body;
  expect(copied).toMatchObject({
    siteId: secondSite,
    createdById: all.id,
    copiedFromId: s.id,
    number: null,
    urgency: 'NORMAL',
    status: 'DRAFT',
    items: [
      { catalogItemId, snapshot: { name: 'اسم حالي' } },
      { catalogItemId: null, otherName: 'اسم سابق' },
      { isOther: true, otherName: 'بند خاص' },
    ],
  });
  expect(
    (
      await send('get', path(s.id, '/timeline'), undefined, all).expect(200)
    ).body.items.at(-1),
  ).toMatchObject({
    type: 'COPIED_TO',
    payload: { requestId: copied.id, number: null },
  });
  expect(
    (
      await send('get', path(copied.id, '/timeline'), undefined, all).expect(
        200,
      )
    ).body.items[0],
  ).toMatchObject({
    type: 'COPIED_FROM',
    payload: { requestId: s.id, number: s.number },
  });
  expect(
    (await send('get', path(s.id, '/timeline')).expect(200)).body.items.at(-1)
      .payload,
  ).toEqual({});
  expect(
    (await send('get', path(copied.id), undefined, otherSite).expect(200)).body,
  ).not.toHaveProperty('copiedFromId');
  await db.catalogItem.update({
    where: { id: catalogItemId },
    data: { name: 'سيراميك' },
  });
  await db.requestItem.update({
    where: { id: s.items[1].id },
    data: { state: 'REJECTED' },
  });
  const selected = (
    await send('post', path(s.id, '/copy'), {
      version: s.version + 1,
      itemIds: [s.items[1].id],
    }).expect(201)
  ).body;
  expect(selected.items).toMatchObject([
    { isOther: true, otherName: 'اسم سابق', lineNo: 1 },
  ]);
});

it('converts an other line through the catalog service and retains its frozen snapshot', async () => {
  const s = await submit(await draft([otherLine(), catalogLine()]));
  const [other, existing] = s.items;
  const conversion = path(s.id, '/items/' + other.id + '/add-to-catalog');
  const size = await db.catalogItem.count();
  await send('post', conversion, {
    version: s.version,
    nodeId: otherCategory,
  }).expect(422);
  expect(await db.catalogItem.count()).toBe(size);
  expect(
    await db.codeSequence.findUnique({ where: { categoryId: otherCategory } }),
  ).toBeNull();
  expect(
    (await db.request.findUniqueOrThrow({ where: { id: s.id } })).version,
  ).toBe(s.version);
  await send('post', path(s.id, '/items/' + existing.id + '/add-to-catalog'), {
    version: s.version,
  }).expect(409);
  const after = (
    await send('post', conversion, {
      version: s.version,
      name: 'صنف محفوظ',
    }).expect(200)
  ).body;
  expect(after.items[0]).toMatchObject({
    isOther: false,
    snapshot: other.snapshot,
  });
  const saved = await db.catalogItem.findUniqueOrThrow({
    where: { id: after.items[0].catalogItemId },
  });
  expect(saved).toMatchObject({
    name: 'صنف محفوظ',
    unitId,
    nodeId: groupId,
    code: 'FIN-0001',
  });
  const timeline = (await send('get', path(s.id, '/timeline')).expect(200)).body
    .items;
  expect(timeline.at(-1)).toMatchObject({
    type: 'ADDED_TO_CATALOG',
    itemIds: [other.id],
    payload: { lineNo: 1, code: saved.code },
  });
  expect(
    await db.auditLog.count({
      where: {
        OR: [
          {
            entity: 'Request',
            entityId: String(s.id),
            action: 'request.addToCatalog',
          },
          {
            entity: 'CatalogItem',
            entityId: String(saved.id),
            action: 'catalogItem.create',
          },
        ],
      },
    }),
  ).toBe(2);
  await send('post', conversion, { version: after.version }).expect(409);
});

it('codes an other line with a unit price only for price viewers', async () => {
  const s = await submit(await draft([otherLine()]));
  const conversion = path(s.id, '/items/' + s.items[0].id + '/add-to-catalog');
  const size = await db.catalogItem.count();
  // The creator can code items but cannot see prices, so it cannot set one.
  await send('post', conversion, {
    version: s.version,
    unitPrice: '15',
  }).expect(403);
  const coder = await user(
    'request-price-coder',
    ['catalog.create', 'requests.viewPrices'],
    [siteId],
  );
  await send(
    'post',
    conversion,
    { version: s.version, unitPrice: '15.555' },
    coder,
  ).expect(422);
  expect(await db.catalogItem.count()).toBe(size);
  expect(
    (await db.request.findUniqueOrThrow({ where: { id: s.id } })).version,
  ).toBe(s.version);
  const coded = (
    await send(
      'post',
      conversion,
      { version: s.version, unitPrice: '15.5' },
      coder,
    ).expect(200)
  ).body;
  const saved = await db.catalogItem.findUniqueOrThrow({
    where: { id: coded.items[0].catalogItemId },
  });
  expect(saved.unitPrice?.toFixed(2)).toBe('15.50');
  // Coding never prices the request line itself.
  expect(coded.items[0].lineTotal).toBeNull();
});

it('filters and paginates by scope, urgency, stage, number, creator, category and Cairo date', async () => {
  now = new Date('2032-02-02T22:15:00Z');
  const older = await submit(await draft());
  now = new Date(+now + 60000);
  const newer = await submit(await draft());
  now = new Date(+now + 60000);
  const urgent = await submit(await draft());
  await send(
    'post',
    path(urgent.id, '/urgency'),
    { version: urgent.version, urgency: 'URGENT' },
    manager,
  ).expect(200);
  const foreign = await create(all, secondSite);
  const base =
    '/?stage=AWAITING_MANAGER&status=AWAITING_MANAGER&siteId=' +
    siteId +
    '&categoryId=' +
    categoryId +
    '&createdById=' +
    creator.id +
    '&from=2032-02-03&to=2032-02-03';
  const page = (await send('get', base + '&pageSize=2').expect(200)).body;
  expect(page.items.map((item: { id: number }) => item.id)).toEqual([
    urgent.id,
    older.id,
  ]);
  expect(page).toMatchObject({ total: 3, page: 1, pageSize: 2 });
  expect(
    (await send('get', base + '&pageSize=2&page=2').expect(200)).body.items.map(
      (item: { id: number }) => item.id,
    ),
  ).toEqual([newer.id]);
  expect(
    (
      await send('get', base + '&q=' + older.number + '&urgency=NORMAL').expect(
        200,
      )
    ).body.total,
  ).toBe(1);
  expect(
    (await send('get', base.replaceAll('2032-02-03', '2032-02-02')).expect(200))
      .body.total,
  ).toBe(0);
  expect(
    (await send('get', '/?siteId=' + secondSite).expect(200)).body,
  ).toMatchObject({ total: 0, items: [] });
  expect(
    (await send('get', '/?siteId=' + secondSite, undefined, all).expect(200))
      .body.items,
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: foreign.id })]),
  );
  await send('get', '/?from=2032-02-03&to=2032-02-02').expect(422);
});

it('returns the last twelve distinct active picked items per creator and category', async () => {
  const created = await Promise.all(
    Array.from({ length: 14 }, (_, i) => catalogItem('REC-' + i)),
  );
  const orderedIds: number[] = [];
  for (const item of created) {
    now = new Date(+now + 60000);
    await draft([catalogLine(item.id), catalogLine(item.id)]);
    orderedIds.unshift(item.id);
  }
  await db.catalogItem.update({
    where: { id: orderedIds[1] },
    data: { isActive: false },
  });
  const recent = (
    await send('get', '/recent-items?categoryId=' + categoryId).expect(200)
  ).body.items;
  expect(recent.map((item: { id: number }) => item.id)).toEqual(
    orderedIds.filter((id) => id !== orderedIds[1]).slice(0, 12),
  );
  expect(
    (
      await send(
        'get',
        '/recent-items?categoryId=' + categoryId,
        undefined,
        all,
      ).expect(200)
    ).body.items.map((item: { id: number }) => item.id),
  ).toEqual([catalogItemId]);
  expect(
    (await send('get', '/recent-items?categoryId=' + otherCategory).expect(200))
      .body.items,
  ).toEqual([]);
});

describe('route authorization, scope, input and status', () => {
  type Route = {
    method: Method;
    route: (id: number, item: number) => string;
    body?: object;
    invalid?: string;
    state?: 'DRAFT' | 'AWAITING_MANAGER' | 'REJECTED';
    status?: number;
  };
  const at = (suffix: string) => (id: number) => path(id, suffix);
  const routes: Route[] = [
    { method: 'get', route: () => '/', invalid: '/?stage=unknown' },
    {
      method: 'get',
      route: () => '/recent-items?categoryId=1',
      invalid: '/recent-items?categoryId=x',
    },
    { method: 'get', route: at(''), invalid: '/no' },
    { method: 'get', route: at('/timeline'), invalid: '/no/timeline' },
    { method: 'post', route: () => '/', body: { version: 1 } },
    {
      method: 'patch',
      route: at('/draft'),
      body: { items: 'invalid' },
      state: 'AWAITING_MANAGER',
      status: 409,
    },
    {
      method: 'delete',
      route: at(''),
      body: { confirm: false },
      state: 'AWAITING_MANAGER',
      status: 409,
    },
    {
      method: 'post',
      route: at('/submit'),
      body: { version: '1' },
      state: 'AWAITING_MANAGER',
      status: 409,
    },
    {
      method: 'post',
      route: at('/resubmit'),
      body: { version: '1' },
      state: 'DRAFT',
      status: 409,
    },
    {
      method: 'post',
      route: at('/approve'),
      body: { version: '1' },
      state: 'DRAFT',
      status: 409,
    },
    {
      method: 'post',
      route: at('/reject'),
      body: { reason: '' },
      state: 'DRAFT',
      status: 409,
    },
    {
      method: 'post',
      route: at('/return'),
      body: { reason: '' },
      state: 'DRAFT',
      status: 409,
    },
    {
      method: 'post',
      route: at('/urgency'),
      body: { urgency: 'unknown' },
      state: 'REJECTED',
      status: 409,
    },
    {
      method: 'patch',
      route: at('/quantities'),
      body: { lines: [] },
      state: 'DRAFT',
      status: 409,
    },
    {
      method: 'patch',
      route: at(''),
      body: { note: 9 },
      state: 'DRAFT',
      status: 409,
    },
    { method: 'post', route: at('/copy'), body: { itemIds: [] } },
    {
      method: 'post',
      route: (id, item) => path(id, '/items/' + item + '/add-to-catalog'),
      body: { name: 55 },
      state: 'DRAFT',
      status: 409,
    },
  ];
  it.each(routes)('$method $route', async (entry) => {
    const s = await draft();
    const route = entry.route(s.id, s.items[0].id);
    const invalidBody = entry.body && { version: s.version, ...entry.body };
    const unauthorized = { id: 0, cookie: '' };
    await send(entry.method, route, invalidBody, unauthorized).expect(401);
    await send(entry.method, route, invalidBody, denied).expect(403);
    if (route.startsWith('/' + s.id))
      await send(entry.method, route, invalidBody, otherSite).expect(404);
    await send(
      entry.method,
      entry.invalid ?? route,
      invalidBody,
      manager,
    ).expect(422);
    if (entry.status) {
      const fields = {
        version: s.version,
        ...(/\/(reject|return)$/.test(route) ? { reason: 'المراجعة' } : {}),
        ...(route.endsWith('/urgency') ? { urgency: 'URGENT' } : {}),
        ...(route.endsWith('/quantities')
          ? { lines: [{ itemId: s.items[0].id, quantity: '2' }] }
          : {}),
        ...(route.endsWith('/draft') ? { items: [] } : {}),
        ...(entry.method === 'delete' ? { confirm: true } : {}),
      };
      await db.request.update({
        where: { id: s.id },
        data: { status: entry.state },
      });
      const actor =
        entry.method === 'delete' ||
        route.endsWith('/draft') ||
        route.endsWith('/submit') ||
        route.endsWith('/resubmit') ||
        (entry.method === 'patch' && !route.endsWith('/quantities'))
          ? creator
          : manager;
      await send(entry.method, route, fields, actor).expect(entry.status);
    }
  });
});
