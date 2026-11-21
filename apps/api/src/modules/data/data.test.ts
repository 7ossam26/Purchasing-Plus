import { Prisma, type PrismaClient } from '@prisma/client';
import {
  dataColumnLabel,
  dataColumns,
  dataEntity,
  maxDataFileBytes,
  type DataEntity,
} from '@purchasing-plus/shared';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import ExcelJS from 'exceljs';
import supertest from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = supertest(app);
const prefix = '/api/v1/data';
type Cells = Record<string, string>;

let manager: string,
  reader: string,
  importer: string,
  blocked: string,
  scoped: string;
let allowedSite: number;

const examples: Record<DataEntity, Cells> = {
  units: { name: 'قطعة', active: 'نعم' },
  sites: { name: 'المعادي', address: 'شارع النصر، مصر', active: 'لا' },
  attributes: { name: 'العرض', type: 'رقم', unitLabel: 'سم', active: 'نعم' },
  'catalog-tree': { path: 'كهربا > مفاتيح وبرايز > سلسلة X', active: 'نعم' },
  'catalog-items': {
    name: 'مفتاح',
    path: 'كهربا > مفاتيح وبرايز > سلسلة X > تشطيب',
    unit: 'قطعة',
    active: 'لا',
    attribute1: 'العرض',
    value1: '12.125',
  },
  suppliers: {
    name: 'مورد الكهرباء',
    whatsappNumber: '0101 234 5678',
    categories: 'كهربا',
    active: 'لا',
    notes: 'سطر أول\nسطر "ثاني", تفاصيل',
  },
};

async function account(name: string, keys: PermissionKey[], ids?: number[]) {
  await makeUser(db, name, keys, ids ? 'ASSIGNED' : 'ALL', ids);
  const login = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username: name, password: testPassword })
    .expect(204);
  return String(login.headers['set-cookie']![0]).split(';')[0]!;
}

function csv(entity: DataEntity, ...rows: Cells[]) {
  const keys = dataColumns[entity];
  const lines = [
    keys.map(dataColumnLabel),
    keys,
    ...rows.map((row) => keys.map((key) => row[key] ?? '')),
  ];
  return Buffer.from(
    '\uFEFF' +
      lines
        .map((line) =>
          line.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(','),
        )
        .join('\r\n'),
  );
}

function post(
  entity: DataEntity | 'users',
  operation: 'preview' | 'commit',
  bytes: Buffer,
  filename = 'data.csv',
  cookie = manager,
) {
  return api
    .post(`${prefix}/import/${entity}/${operation}`)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', cookie)
    .attach('file', bytes, filename);
}

function get(path: string, cookie = manager) {
  return api.get(prefix + path).set('Cookie', cookie);
}

function download(path: string, cookie?: string) {
  return get(path, cookie)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    });
}

async function worksheet(bytes: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(new Uint8Array(bytes).buffer);
  return book.worksheets[0]!;
}

beforeAll(async () => {
  await resetDb();
  const category = await db.catalogNode.create({
    data: {
      name: 'كهربا',
      codePrefix: 'ELC',
      iconKey: 'zap',
      path: '/',
      depth: 0,
      sortOrder: 0,
    },
  });
  await db.catalogNode.update({
    where: { id: category.id },
    data: { path: `/${category.id}/` },
  });
  allowedSite = (await db.site.create({ data: { name: 'زايد' } })).id;
  manager = await account('transfer', ['data.import', 'data.export']);
  reader = await account('exporter', ['data.export']);
  importer = await account('importer', ['data.import']);
  blocked = await account('nogrants', []);
  scoped = await account(
    'scoped',
    ['data.import', 'data.export'],
    [allowedSite],
  );
});

afterAll(async () => db.$disconnect());

it('previews CSV without persisting, then commits all six layouts with generated codes and a summary audit', async () => {
  for (const entity of dataEntity.options) {
    const upload = csv(entity, examples[entity]);
    const preview = await post(entity, 'preview', upload).expect(200);
    expect(preview.body).toEqual({ create: 1, update: 0, errors: [] });
    expect(
      await db.auditLog.count({ where: { action: 'data.import', entity } }),
    ).toBe(0);
    expect((await post(entity, 'commit', upload).expect(200)).body).toEqual(
      preview.body,
    );
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: 'data.import', entity },
    });
    expect(audit.newValue).toEqual({ create: 1, update: 0 });
  }
  expect(await db.catalogNode.count()).toBe(4);
  expect(
    await db.catalogItem.findFirst({
      select: {
        code: true,
        isActive: true,
        attributeValues: { select: { numberValue: true } },
      },
    }),
  ).toMatchObject({
    code: 'ELC-0001',
    isActive: false,
    attributeValues: [{ numberValue: new Prisma.Decimal('12.125') }],
  });
  expect(await db.supplier.findFirst()).toMatchObject({
    whatsappNumber: '201012345678',
    isActive: false,
    notes: examples.suppliers.notes,
  });
});

it.each(dataEntity.options)(
  'downloads an RTL template and round-trips the %s export',
  async (entity) => {
    const template = await download(`/templates/${entity}`).expect(200);
    const sheet = await worksheet(template.body as Buffer);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.views[0]?.rightToLeft).toBe(true);
    const headers = dataColumns[entity];
    const sheetRow = (row: number) =>
      Array.from(
        { length: sheet.getRow(row).cellCount },
        (_, index) => sheet.getCell(row, index + 1).value,
      );
    expect(sheetRow(1)).toEqual(headers.map(dataColumnLabel));
    expect(sheetRow(2)).toEqual(headers);
    const exported = await download(`/export/${entity}`).expect(200);
    expect(exported.headers['content-disposition']).toContain(`${entity}.xlsx`);
    const result = await post(
      entity,
      'preview',
      exported.body as Buffer,
      'export.xlsx',
    ).expect(200);
    const rows = (await worksheet(exported.body as Buffer)).rowCount - 2;
    expect(rows).toBeGreaterThan(0);
    expect(result.body).toEqual({ create: 0, update: rows, errors: [] });
  },
);

it('validates every independent error with the source row, column and a repair', async () => {
  const item = await post(
    'catalog-items',
    'preview',
    csv(
      'catalog-items',
      {
        ...examples['catalog-items'],
        path: 'غير موجودة > مجموعة',
        unit: 'وحدة غير موجودة',
        value1: 'مش رقم',
      },
      {},
      { ...examples['catalog-items'], attribute15: 'العرض', value15: '11' },
    ),
  ).expect(200);
  expect(item.body.errors).toEqual([
    {
      row: 3,
      column: 'unit',
      message: expect.any(String),
      fix: expect.any(String),
    },
    {
      row: 3,
      column: 'path',
      message: expect.any(String),
      fix: expect.any(String),
    },
    {
      row: 3,
      column: 'value1',
      message: expect.any(String),
      fix: expect.any(String),
    },
    {
      row: 5,
      column: 'attribute15',
      message: expect.any(String),
      fix: expect.any(String),
    },
  ]);
  const vendor = await post(
    'suppliers',
    'preview',
    csv('suppliers', { ...examples.suppliers, whatsappNumber: '0221234567' }),
  ).expect(200);
  expect(vendor.body.errors).toEqual([
    {
      row: 3,
      column: 'whatsappNumber',
      message: 'اكتب رقم موبايل مصري، مثال: 01012345678',
      fix: expect.any(String),
    },
  ]);
  const duplicate = await post(
    'units',
    'preview',
    csv('units', { name: 'متر' }, { name: 'مِـتر' }),
  ).expect(200);
  expect(duplicate.body).toMatchObject({
    create: 1,
    update: 0,
    errors: [{ row: 4, column: 'name' }],
  });
  const unknownCategory = await post(
    'catalog-tree',
    'preview',
    csv('catalog-tree', { path: 'غير موجودة > مجموعة' }),
  ).expect(200);
  expect(unknownCategory.body.errors).toMatchObject([
    { row: 3, column: 'path' },
  ]);
});

it('matches options by label and keeps existing inactive relationships on round-trip', async () => {
  const attribute = { name: 'اللون', type: 'اختيار', options: 'أبيض، أسود' };
  await post('attributes', 'commit', csv('attributes', attribute)).expect(200);
  const validItem = {
    ...examples['catalog-items'],
    attribute2: 'اللون',
    value2: 'أسود',
  };
  await post('catalog-items', 'commit', csv('catalog-items', validItem)).expect(
    200,
  );
  const invalid = await post(
    'catalog-items',
    'preview',
    csv('catalog-items', { ...validItem, value2: 'أزرق' }),
  ).expect(200);
  expect(invalid.body.errors).toMatchObject([{ row: 3, column: 'value2' }]);
  await post(
    'attributes',
    'commit',
    csv('attributes', { ...attribute, options: 'أبيض', active: 'لا' }),
  ).expect(200);
  await post(
    'units',
    'commit',
    csv('units', { ...examples.units, active: 'لا' }),
  ).expect(200);
  await post(
    'catalog-tree',
    'commit',
    csv('catalog-tree', { ...examples['catalog-tree'], active: 'لا' }),
  ).expect(200);
  const exported = await download('/export/catalog-items').expect(200);
  expect(
    (
      await post(
        'catalog-items',
        'commit',
        exported.body as Buffer,
        'catalog-items.xlsx',
      ).expect(200)
    ).body,
  ).toEqual({ create: 0, update: 2, errors: [] });
});

it('revalidates commit and rolls back earlier rows when a later row is invalid', async () => {
  await post(
    'units',
    'commit',
    csv('units', { name: 'أول' }, { name: 'أول' }),
  ).expect(422);
  expect(await db.unit.count({ where: { name: 'أول' } })).toBe(0);
  const input = csv('suppliers', {
    ...examples.suppliers,
    name: 'مورد آخر',
    whatsappNumber: '01112345678',
  });
  expect(
    (await post('suppliers', 'preview', input).expect(200)).body.create,
  ).toBe(1);
  await db.supplier.updateMany({
    where: { name: 'مورد الكهرباء' },
    data: { whatsappNumber: '201112345678' },
  });
  await post('suppliers', 'commit', input).expect(422);
  expect(await db.supplier.count({ where: { name: 'مورد آخر' } })).toBe(0);
});

it('leaves zero writes and no audit when a database failure interrupts commit', async () => {
  const input = csv('units', { name: 'صف تمهيدي' }, { name: 'صف يفشل' });
  expect((await post('units', 'preview', input).expect(200)).body.create).toBe(
    2,
  );
  const audits = await db.auditLog.count();
  await db.$executeRaw(
    Prisma.sql`ALTER TABLE "Unit" ADD CONSTRAINT p16_test_failure CHECK (name <> 'صف يفشل')`,
  );
  try {
    await post('units', 'commit', input).expect(500);
  } finally {
    await db.$executeRaw(
      Prisma.sql`ALTER TABLE "Unit" DROP CONSTRAINT p16_test_failure`,
    );
  }
  expect(
    await db.unit.count({ where: { name: { in: ['صف تمهيدي', 'صف يفشل'] } } }),
  ).toBe(0);
  expect(await db.auditLog.count()).toBe(audits);
});

it('rejects unknown entities, wrong types, malformed workbook and uploads over 10 MiB', async () => {
  await post('users', 'preview', Buffer.from('a')).expect(422);
  await post('units', 'preview', Buffer.from('a'), 'image.png').expect(422);
  await post(
    'units',
    'commit',
    Buffer.from('not a workbook'),
    'fake.xlsx',
  ).expect(422);
  const result = await post(
    'units',
    'preview',
    Buffer.alloc(maxDataFileBytes + 1, 65),
  ).expect(422);
  expect(result.body.error).toBe('DATA_FILE_TOO_LARGE');
});

it('enforces template, preview, commit and export grants and filters scoped site rows', async () => {
  await get('/templates/units', reader).expect(403);
  await get('/export/units', importer).expect(403);
  await get('/export/suppliers', blocked).expect(403);
  await post('units', 'preview', csv('units'), 'data.csv', reader).expect(403);
  await post('units', 'commit', csv('units'), 'data.csv', blocked).expect(403);
  const exported = await download('/export/sites', scoped).expect(200);
  const sheet = await worksheet(exported.body as Buffer);
  expect(sheet.rowCount).toBe(3);
  expect(sheet.getCell('A3').value).toBe('زايد');
  const outside = csv('sites', { name: 'المعادي', address: 'تعديل غير مسموح' });
  expect(
    (await post('sites', 'preview', outside, 'data.csv', scoped).expect(200))
      .body.errors,
  ).toMatchObject([{ row: 3, column: 'name' }]);
  await post('sites', 'commit', outside, 'data.csv', scoped).expect(422);
  await post(
    'sites',
    'commit',
    csv('sites', { name: 'زايد', address: 'عنوان جديد' }),
    'data.csv',
    scoped,
  ).expect(200);
  expect(
    await db.site.findUnique({ where: { id: allowedSite } }),
  ).toMatchObject({ address: 'عنوان جديد' });
  expect(
    await db.site.findUnique({ where: { name: 'المعادي' } }),
  ).toMatchObject({ address: 'شارع النصر، مصر' });
});
