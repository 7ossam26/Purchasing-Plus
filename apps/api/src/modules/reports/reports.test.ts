import type { Prisma, PrismaClient } from '@prisma/client';
import {
  reportDestinations,
  recordDestinations,
  reportKeys,
  type ReportTable,
} from '@purchasing-plus/shared';
import { reportsUi as copy } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import ExcelJS from 'exceljs';
import supertest from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

const now = new Date('2026-05-15T09:00:00Z');
const env = parseEnv(process.env);
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => now,
});
const db: PrismaClient = app.locals.db;
const api = supertest(app);
const day = (date: number, hour = 6) => new Date(Date.UTC(2026, 4, date, hour));
const grants: PermissionKey[] = [...reportKeys, 'records.view'];
const visibility: PermissionKey[] = [
  'requests.viewPrices',
  'requests.viewSupplierNames',
  'requests.viewTimeline',
];
let local: number,
  foreign: number,
  rootId: number,
  catalogId: number,
  creatorId: number,
  requestId: number;
let reader: string,
  redacted: string,
  blocked: string,
  limited: string,
  namesHidden: string,
  finance: string;

async function account(
  name: string,
  keys: PermissionKey[],
  siteScope: 'ALL' | 'ASSIGNED' = 'ASSIGNED',
) {
  const user = await makeUser(
    db,
    name,
    keys,
    siteScope,
    siteScope === 'ASSIGNED' ? [local] : [],
  );
  const login = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username: name, password: testPassword })
    .expect(204);
  return {
    id: user.id,
    cookie: String(login.headers['set-cookie']![0]).split(';')[0]!,
  };
}

function get(cookie: string, path: string) {
  return api.get('/api/v1/' + path).set('Cookie', cookie);
}

beforeAll(async () => {
  await resetDb();
  local = (await db.site.create({ data: { name: 'المعادي' } })).id;
  foreign = (await db.site.create({ data: { name: 'الشيخ زايد' } })).id;
  rootId = (
    await db.catalogNode.create({
      data: {
        name: 'كهربا',
        codePrefix: 'EL',
        path: '/1/',
        sortOrder: 1,
        depth: 0,
        iconKey: 'zap',
      },
    })
  ).id;
  const unit = await db.unit.create({ data: { name: 'متر' } });
  const catalog = await db.catalogItem.create({
    data: {
      name: 'سلك',
      description: '',
      searchText: 'سلك EL-0001',
      code: 'EL-0001',
      nodeId: rootId,
      unitId: unit.id,
    },
  });
  catalogId = catalog.id;
  const primary = await db.supplier.create({
    data: {
      name: 'مورد أول',
      whatsappNumber: '201011111111',
      contactPerson: '',
      notes: '',
    },
  });
  const alternate = await db.supplier.create({
    data: {
      name: 'مورد تاني',
      whatsappNumber: '201022222222',
      contactPerson: '',
      notes: '',
    },
  });
  const author = await account('reader', [
    ...grants,
    ...visibility,
    'reports.export',
  ]);
  creatorId = author.id;
  reader = author.cookie;
  redacted = (await account('redacted', [...grants, 'reports.export'])).cookie;
  namesHidden = (
    await account('hide-names', [
      'reports.spending',
      'reports.suppliers',
      'reports.priceHistory',
      'requests.viewPrices',
    ])
  ).cookie;
  blocked = (await account('blocked', ['reports.export'])).cookie;
  limited = (
    await account('limited', ['reports.requestsOverview', 'records.view'])
  ).cookie;
  finance = (await account('finance', [...grants, ...visibility], 'ALL'))
    .cookie;

  async function addRequest(
    number: string,
    at: Date,
    status: Prisma.RequestUncheckedCreateInput['status'],
    displayedStage: Prisma.RequestUncheckedCreateInput['displayedStage'],
    siteId = local,
  ) {
    return db.request.create({
      data: {
        number,
        createdAt: at,
        submittedAt: at,
        status,
        displayedStage,
        stageStartedAt: day(2, 0),
        version: 1,
        urgency: 'NORMAL',
        urgencyLocked: false,
        isModified: false,
        siteId,
        categoryId: rootId,
        createdById: creatorId,
        deliveryFee: '8.50',
      },
    });
  }
  const request = await addRequest(
    '2026-001',
    day(1),
    'COMPLETED',
    'COMPLETED',
  );
  requestId = request.id;
  const open = await addRequest('2026-002', day(1), 'PAUSED', 'PAUSED');
  const cancelled = await addRequest(
    '2026-003',
    day(4),
    'CANCELLED',
    'CANCELLED',
  );
  const rejected = await addRequest('2026-004', day(6), 'REJECTED', 'REJECTED');
  const other = await addRequest(
    '2026-005',
    day(1),
    'COMPLETED',
    'COMPLETED',
    foreign,
  );

  async function line(
    requestId: number,
    lineNo: number,
    name: string,
    state: Prisma.RequestItemUncheckedCreateInput['state'],
    lineTotal: string,
  ) {
    return db.requestItem.create({
      data: {
        requestId,
        lineNo,
        catalogItemId: catalogId,
        nodeId: rootId,
        snapshot: { name },
        specs: '',
        quantity: '2.00',
        unitId: unit.id,
        state,
        receivedQty: '0.00',
        pickedAt: day(1),
        modifiedAfterSend: false,
        needsRepricing: false,
        lineTotal,
      },
    });
  }
  const wire = await line(request.id, 1, 'سلك', 'RECEIVED', '55.50');
  const missing = await line(
    request.id,
    2,
    'مفتاح',
    'RESOLVED_EXTERNALLY',
    '22.00',
  );
  const discarded = await line(request.id, 3, 'مقبس', 'REJECTED', '500.00');
  const removed = await line(
    cancelled.id,
    1,
    'بند ملغي',
    'CANCELLED',
    '900.00',
  );
  const elsewhere = await line(other.id, 1, 'سلك', 'RECEIVED', '70.00');

  async function round(
    requestId: number,
    number: number,
    date: Date,
    lines: [number, string][],
    status: 'APPROVED' | 'REJECTED' = 'APPROVED',
  ) {
    return db.pricingRound.create({
      data: {
        requestId,
        number,
        status,
        submittedAt: new Date(date.getTime() - 60_000),
        submittedById: creatorId,
        decidedAt: date,
        decidedById: creatorId,
        deliveryFee: '8.50',
        items: {
          create: lines.map(([itemId, lineTotal], index) => ({
            itemId,
            lineTotal,
            lineNo: index + 1,
            supplierId: primary.id,
            quantity: '2.00',
            catalogItemId: catalogId,
          })),
        },
      },
    });
  }
  await round(request.id, 1, day(2, 9), [
    [wire.id, '100.25'],
    [discarded.id, '500.00'],
  ]);
  await round(request.id, 2, day(7), [[missing.id, '22.00']]);
  await round(request.id, 3, day(8), [[discarded.id, '500.00']], 'REJECTED');
  await round(cancelled.id, 1, day(4, 9), [[removed.id, '900.00']]);
  await round(other.id, 1, day(2, 9), [[elsewhere.id, '70.00']]);

  async function event(
    requestId: number,
    type: string,
    at: Date,
    stageAfter: Prisma.RequestEventUncheckedCreateInput['stageAfter'],
    payload: Prisma.InputJsonObject = {},
    itemIds: number[] = [],
  ) {
    await db.requestEvent.create({
      data: {
        requestId,
        type,
        at,
        stageAfter,
        payload,
        itemIds,
        actorId: creatorId,
        actorName: 'الاسم وقت الإجراء',
        actorRoleName: 'الدور وقت الإجراء',
      },
    });
  }
  await event(request.id, 'SUBMITTED', day(1), 'AWAITING_MANAGER');
  await event(request.id, 'EDITED', day(1, 7), 'AWAITING_MANAGER');
  await event(request.id, 'MANAGER_APPROVED', day(1, 8), 'AT_PURCHASING');
  await event(request.id, 'PRICING_SUBMITTED', day(1, 9), 'AWAITING_APPROVAL', {
    roundNo: 1,
  });
  await event(request.id, 'PRICING_APPROVED', day(2, 9), 'AWAITING_RECEIPT', {
    roundNo: 1,
  });
  await event(request.id, 'ITEM_UNAVAILABLE', day(3), 'REMAINING', {}, [
    missing.id,
  ]);
  await event(
    request.id,
    'ITEM_REPRICED',
    day(5),
    'AWAITING_RECEIPT',
    {
      supplierId: alternate.id,
      lineTotal: '55.50',
    },
    [wire.id],
  );
  await event(request.id, 'PRICING_APPROVED', day(7), 'AWAITING_RECEIPT', {
    roundNo: 2,
  });
  await event(request.id, 'PRICING_REJECTED', day(8), 'AWAITING_RECEIPT', {
    roundNo: 3,
  });
  await event(
    request.id,
    'ITEM_RESOLVED_EXTERNALLY',
    day(9),
    'AWAITING_RECEIPT',
    {},
    [missing.id],
  );
  await event(request.id, 'RECEIPT_RECORDED', day(9, 7), 'AWAITING_RECEIPT');
  await event(request.id, 'COMPLETED', day(9, 7), 'COMPLETED');
  await event(open.id, 'SUBMITTED', day(1), 'AWAITING_MANAGER');
  await event(open.id, 'MANAGER_APPROVED', day(1, 10), 'AT_PURCHASING');
  await event(open.id, 'PAUSED', day(2, 0), 'PAUSED');
  await event(cancelled.id, 'CANCELLED', day(4, 10), 'CANCELLED');
  await event(rejected.id, 'MANAGER_REJECTED', day(6, 10), 'REJECTED');
  await event(other.id, 'COMPLETED', day(2, 10), 'COMPLETED');

  for (const sentAt of [day(1), day(2)]) {
    await db.rfqBatch.create({
      data: {
        requestId,
        createdAt: day(1),
        createdById: creatorId,
        message: '',
        items: {
          create: [
            { itemId: wire.id },
            { itemId: missing.id },
            { itemId: discarded.id },
          ],
        },
        suppliers: {
          create: [
            {
              supplierId: primary.id,
              message: '',
              sentAt,
              sentById: creatorId,
            },
            { supplierId: alternate.id, message: '' },
          ],
        },
      },
    });
  }
  await db.supplyOrder.create({
    data: {
      requestId,
      number: 1,
      supplierId: primary.id,
      message: '',
      createdAt: day(2, 9),
      sentAt: day(2, 10),
      sentById: creatorId,
    },
  });
  await db.receipt.create({
    data: {
      requestId,
      recordedById: creatorId,
      recordedAt: day(9, 7),
      lines: { create: { itemId: wire.id, quantity: '1.50' } },
    },
  });
  await db.receipt.create({
    data: {
      requestId: other.id,
      recordedById: creatorId,
      recordedAt: day(2, 10),
      lines: { create: { itemId: elsewhere.id, quantity: '2.00' } },
    },
  });
  await db.catalogItemPrice.createMany({
    data: [
      {
        requestId,
        requestItemId: wire.id,
        itemId: catalogId,
        supplierId: primary.id,
        source: 'APPROVED',
        createdAt: day(2, 9),
        unitPrice: '50.13',
      },
      {
        requestId,
        requestItemId: wire.id,
        itemId: catalogId,
        supplierId: alternate.id,
        source: 'REPRICED',
        createdAt: day(5),
        unitPrice: '27.75',
      },
      {
        requestId: other.id,
        requestItemId: elsewhere.id,
        itemId: catalogId,
        supplierId: primary.id,
        source: 'APPROVED',
        createdAt: day(2, 9),
        unitPrice: '35.00',
      },
    ],
  });
});

afterAll(() => db.$disconnect());

it('reports lifecycle counts and current overdue requests over different time domains', async () => {
  const { body } = await get(reader, 'reports/requests-overview').expect(200);
  expect(body.period).toMatchObject({ from: '2026-05-01', to: '2026-05-31' });
  expect(body.measures).toBe(copy.destinations['requests-overview'].measures);
  expect(body.metrics.map((metric: { value: number }) => metric.value)).toEqual(
    [4, 1, 1, 1, 1],
  );
  expect(body.metrics[4].domain).toBe('current');
  expect(body.main.rows).toMatchObject([
    { number: '2026-002', stage: 'PAUSED' },
  ]);
  expect(body.chart.series[0].values).toEqual([4, 1, 1, 1]);
  expect(body.breakdowns[0].rows).toEqual([{ label: 'المعادي', count: 4 }]);
  expect(body.breakdowns[2].rows).toEqual([{ label: 'NORMAL', count: 4 }]);
});

it('computes average and median visits from stage changes and ranks the slowest requests', async () => {
  const { body } = await get(
    reader,
    'reports/stage-times?from=2026-05-01&to=2026-05-02',
  ).expect(200);
  expect(body.breakdowns[0].rows).toContainEqual({
    site: 'المعادي',
    stage: 'AWAITING_MANAGER',
    average: 10_800_000,
    median: 10_800_000,
    count: 2,
  });
  expect(body.main.rows).toMatchObject([
    {
      number: '2026-001',
      stage: 'AWAITING_APPROVAL',
      duration: 86_400_000,
      total: 140_400_000,
    },
    {
      number: '2026-002',
      stage: 'PAUSED',
      duration: 75_600_000,
      total: 140_400_000,
    },
  ]);
});

it('sums approved spend, excludes rejected and cancelled lines and separates the delivery charge', async () => {
  const { body } = await get(reader, 'reports/spending').expect(200);
  expect(body.metrics.map((metric: { value: string }) => metric.value)).toEqual(
    ['177.75', '8.50'],
  );
  expect(body.main.rows).toEqual(
    expect.arrayContaining([
      {
        month: '2026-05',
        site: 'المعادي',
        category: 'كهربا',
        supplier: 'مورد أول',
        amount: '122.25',
        fee: null,
      },
      {
        month: '2026-05',
        site: 'المعادي',
        category: 'كهربا',
        supplier: 'مورد تاني',
        amount: '55.50',
        fee: null,
      },
    ]),
  );
  const repriced = await get(
    reader,
    'reports/spending?from=2026-05-05&to=2026-05-05',
  ).expect(200);
  expect(
    repriced.body.metrics.map((metric: { value: string }) => metric.value),
  ).toEqual(['55.50', '0']);
  const all = await get(finance, 'reports/spending').expect(200);
  expect(all.body.metrics[0].value).toEqual('247.75');
});

it('counts unique sent RFQ lines, wins, sent orders and uses won divided by asked', async () => {
  const { body } = await get(reader, 'reports/suppliers').expect(200);
  expect(body.main.rows).toEqual([
    {
      supplier: 'مورد أول',
      asked: 3,
      won: 2,
      winRate: '66.67',
      orders: 1,
      amount: '122.25',
    },
    {
      supplier: 'مورد تاني',
      asked: 0,
      won: 1,
      winRate: null,
      orders: 0,
      amount: '55.50',
    },
  ]);
  expect(
    body.metrics.map((metric: { value: string | number }) => metric.value),
  ).toEqual([3, 3, '100.00', 1, '177.75']);
});

it('finds catalog items by name and code and shows their scoped price series', async () => {
  for (const q of ['EL-0001', 'سلك']) {
    const { body } = await get(
      reader,
      'reports/price-history/items?q=' + encodeURIComponent(q),
    ).expect(200);
    expect(body).toEqual([{ id: catalogId, name: 'سلك', code: 'EL-0001' }]);
  }
  const { body } = await get(
    reader,
    'reports/price-history?itemId=' + catalogId,
  ).expect(200);
  expect(body.chart.series[0].values).toEqual(['50.13', '27.75']);
  expect(body.main.rows).toMatchObject([
    { supplier: 'مورد أول' },
    { supplier: 'مورد تاني' },
  ]);
});

it('reports unavailable and external-resolution events with the historical resolver and role', async () => {
  const { body } = await get(reader, 'reports/unavailable').expect(200);
  expect(body.main.rows).toMatchObject([
    {
      item: 'مفتاح',
      event: 'ITEM_RESOLVED_EXTERNALLY',
      resolver: 'الاسم وقت الإجراء',
      role: 'الدور وقت الإجراء',
    },
    { item: 'مفتاح', event: 'ITEM_UNAVAILABLE', resolver: null, role: null },
  ]);
  expect(body.breakdowns[0].rows).toEqual([
    { site: 'المعادي', category: 'كهربا', unavailable: 1, resolved: 1 },
  ]);
});

it('counts user activity by action date and actor', async () => {
  const { body } = await get(reader, 'reports/user-activity').expect(200);
  expect(body.main.rows).toEqual([
    {
      actor: 'reader',
      created: 4,
      edited: 1,
      managerDecisions: 3,
      pricingSubmitted: 1,
      pricingDecisions: 3,
      received: 1,
    },
  ]);
});

it('paginates and filters each read-only log and keeps timestamps and roles intact', async () => {
  const logs = await get(reader, 'records/requests?pageSize=1&page=2').expect(
    200,
  );
  expect(logs.body).toMatchObject({
    total: 4,
    period: null,
    page: 2,
    pageSize: 1,
    main: { rows: [{ number: '2026-003' }] },
  });
  const requests = await get(
    reader,
    'records/requests?q=001&status=COMPLETED&stage=COMPLETED&urgency=NORMAL&creatorId=' +
      creatorId,
  ).expect(200);
  expect(requests.body.main.rows).toMatchObject([
    { requestId, number: '2026-001', total: '577.50' },
  ]);
  expect(
    (await get(reader, 'records/requests?page=99').expect(200)).body,
  ).toMatchObject({ total: 4, main: { rows: [] } });
  const receipts = await get(
    reader,
    'records/receipts?q=' + encodeURIComponent('سلك'),
  ).expect(200);
  expect(receipts.body.main.rows).toMatchObject([
    { number: '2026-001', quantity: '1.50', recorder: 'reader' },
  ]);
  expect(new Date(receipts.body.main.rows[0].date)).toEqual(day(9, 7));
  const approvals = await get(
    reader,
    'records/approvals?q=001&from=2026-05-07&to=2026-05-08',
  ).expect(200);
  expect(approvals.body.main.rows).toMatchObject([
    {
      round: 3,
      decision: 'REJECTED',
      total: '500.00',
      role: 'الدور وقت الإجراء',
    },
    {
      round: 2,
      decision: 'APPROVED',
      total: '22.00',
      decisionActor: 'الاسم وقت الإجراء',
    },
  ]);
});

it('enforces each route permission, scoped options, filters and foreign-site isolation', async () => {
  await get(blocked, 'reports/options').expect(403);
  await get(
    reader,
    'reports/requests-overview?siteId=' + local + '&categoryId=' + (rootId + 1),
  )
    .expect(200)
    .expect(({ body }) => expect(body.metrics[0].value).toBe(0));
  const { body } = await get(reader, 'reports/options').expect(200);
  expect(body.sites).toEqual([{ id: local, name: 'المعادي' }]);
  await get(reader, 'reports/price-history/items?siteId=' + foreign).expect(
    200,
    [],
  );
  for (const [id] of reportDestinations) {
    await get(blocked, 'reports/' + id).expect(403);
    await get(reader, 'reports/' + id + '?preset=custom').expect(422);
    const { body } = await get(
      reader,
      'reports/' +
        id +
        '?siteId=' +
        foreign +
        (id === 'price-history' ? '&itemId=' + catalogId : ''),
    ).expect(200);
    expect(body.main.rows).toEqual([]);
    expect(body.chart).toBeNull();
  }
  for (const [id] of recordDestinations) {
    await get(blocked, 'records/' + id).expect(403);
    await get(reader, 'records/' + id + '?pageSize=101').expect(422);
    const { body } = await get(
      reader,
      'records/' + id + '?siteId=' + foreign,
    ).expect(200);
    expect(body.total).toBe(0);
  }
});

it('redacts both column definitions and data and never sends supplier chart labels without permission', async () => {
  const { body } = await get(redacted, 'reports/suppliers').expect(200);
  expect(body.main.rows).toEqual([
    { asked: 3, won: 3, winRate: '100.00', orders: 1 },
  ]);
  expect(JSON.stringify(body)).not.toContain('مورد أول');
  expect(body.main.columns.map((c: { key: string }) => c.key)).not.toContain(
    'amount',
  );
  const priced = await get(namesHidden, 'reports/spending').expect(200);
  expect(priced.body.main.rows).toMatchObject([
    { amount: '177.75', fee: '8.50' },
  ]);
  expect(priced.body.main.rows[0]).not.toHaveProperty('supplier');
  const { body: history } = await get(
    namesHidden,
    'reports/price-history?itemId=' + catalogId,
  ).expect(200);
  expect(history.main.rows[0]).toHaveProperty('price', '50.13');
  expect(history.main.rows[0]).not.toHaveProperty('supplier');
  expect(history.chart.table.rows[0]).not.toHaveProperty('supplier');
  await get(redacted, 'reports/price-history/items').expect(403);
  await get(redacted, 'reports/price-history?itemId=' + catalogId)
    .expect(200)
    .expect(({ body }) => expect(body.chart).toBeNull());
  for (const id of ['requests', 'approvals']) {
    const response = await get(redacted, 'records/' + id).expect(200);
    expect(response.body.main.rows[0]).not.toHaveProperty('total');
    expect(response.body.main.rows[0]).not.toHaveProperty('fee');
  }
  const decisions = await get(redacted, 'records/approvals').expect(200);
  expect(decisions.body.main.rows[0]).toHaveProperty('decisionActor', 'reader');
  expect(decisions.body.main.rows[0]).not.toHaveProperty('role');
  const exceptions = await get(redacted, 'reports/unavailable').expect(200);
  expect(exceptions.body.main.rows[0]).not.toHaveProperty('resolver');
  expect(exceptions.body.main.rows[0]).not.toHaveProperty('role');
});

async function exported(cookie: string, path: string) {
  const response = await get(
    cookie,
    path + (path.includes('?') ? '&' : '?') + 'format=xlsx',
  )
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (data: Buffer) => chunks.push(data));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  expect(response.headers['content-type']).toContain('spreadsheetml');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(response.body);
  return book.worksheets[0]!;
}

it('exports every main table and all filtered log rows using the visible Arabic headers', async () => {
  await get(limited, 'reports/requests-overview?format=xlsx').expect(403);
  await get(limited, 'records/requests?format=xlsx').expect(403);
  const paths = [
    ...reportDestinations.map(
      ([id]) =>
        'reports/' +
        id +
        (id === 'price-history' ? '?itemId=' + catalogId : ''),
    ),
    ...recordDestinations.map(([id]) => 'records/' + id + '?q=001&pageSize=1'),
  ];
  for (const path of paths) {
    const sheet = await exported(reader, path);
    const { body } = await get(
      reader,
      path.replace('pageSize=1', 'pageSize=100'),
    ).expect(200);
    const table: ReportTable = body.main;
    expect(sheet.views[0]).toMatchObject({ rightToLeft: true });
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      table.columns.map((column) => column.label),
    );
    expect(sheet.rowCount).toBe(table.rows.length + 1);
  }
  const spend = await exported(
    reader,
    'reports/spending?from=2026-05-05&to=2026-05-05',
  );
  expect(spend.rowCount).toBe(2);
  expect(spend.getRow(2).getCell(5).value).toBe(55.5);
  expect(spend.getRow(2).getCell(5).numFmt).toBe('#,##0.00');
  const requests = await exported(redacted, 'records/requests?q=001');
  expect(requests.getRow(1).values).not.toContain(copy.total);
  expect(requests.getRow(2).getCell(1).value).toBe('2026-001');
  const approvals = await exported(redacted, 'records/approvals?q=001');
  expect(approvals.getRow(1).values).not.toContain(copy.role);
});

it('keeps restricted columns and supplier identities out of all ten workbooks', async () => {
  for (const path of [
    ...reportDestinations.map(
      ([id]) =>
        'reports/' +
        id +
        (id === 'price-history' ? '?itemId=' + catalogId : ''),
    ),
    ...recordDestinations.map(([id]) => 'records/' + id),
  ]) {
    const { body } = await get(redacted, path).expect(200);
    const table: ReportTable = body.main;
    expect(
      table.columns.filter(
        (col) =>
          col.kind === 'money' ||
          ['supplier', 'role', 'resolver'].includes(col.key),
      ),
      path,
    ).toEqual([]);
    const sheet = await exported(redacted, path);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(
      table.columns.map((col) => col.label),
    );
    expect(JSON.stringify(sheet.getSheetValues())).not.toContain('مورد أول');
    expect(sheet.rowCount).toBe(table.rows.length + 1);
  }
});

it('hides support accounts in user activity and its workbook', async () => {
  const support = await db.user.create({
    data: {
      name: 'Support fixture',
      username: 'support-fixture',
      isSuperadmin: true,
      passwordHash: 'unused',
    },
  });
  await db.requestEvent.create({
    data: {
      requestId,
      type: 'MANAGER_APPROVED',
      at: new Date('2026-06-10T10:00:00Z'),
      actorId: support.id,
      actorName: support.name,
      itemIds: [],
      payload: {},
      stageAfter: 'AT_PURCHASING',
    },
  });
  const path = 'reports/user-activity?from=2026-06-10&to=2026-06-10';
  expect((await get(reader, path).expect(200)).body.main.rows).toEqual([]);
  expect(
    JSON.stringify((await exported(reader, path)).getSheetValues()),
  ).not.toContain(support.name);
});
