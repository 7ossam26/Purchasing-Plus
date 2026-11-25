import type { PrismaClient } from '@prisma/client';
import { masterData } from '@purchasing-plus/shared/i18n/ar';
import { registry } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { verifyAudit } from '../access/audit.js';
import { bootstrap } from '../access/seed.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app);
const tree = '/catalog-tree';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
let manager: string;
let picker: string;
let unprivileged: string;
let pieceId: number;

function send(method: Method, path: string, body?: object, cookie = manager) {
  const req = api[method]('/api/v1' + path)
    .set('Origin', env.PUBLIC_ORIGIN)
    .set('Cookie', cookie);
  return body ? req.send(body) : req;
}

async function login(username: string) {
  const response = await send(
    'post',
    '/auth/login',
    { username, password: testPassword },
    '',
  ).expect(204);
  return String(response.headers['set-cookie']![0]).split(';')[0]!;
}

async function category(codePrefix: string): Promise<number> {
  const { body } = await send('post', tree + '/categories', {
    name: `فئة ${codePrefix}`,
    codePrefix,
    iconKey: 'zap',
  }).expect(201);
  return body.id;
}

async function group(parentId: number, name = 'مجموعة'): Promise<number> {
  const { body } = await send('post', tree + '/nodes', {
    name,
    parentId,
  }).expect(201);
  return body.id;
}

async function search(
  categoryId: number,
  q: string,
  cookie = picker,
  query = '',
) {
  return send(
    'get',
    `/catalog/search?categoryId=${categoryId}&q=${encodeURIComponent(q)}${query}`,
    undefined,
    cookie,
  ).expect(200);
}

beforeAll(async () => {
  await resetDb();
  await bootstrap(db, env);
  await makeUser(
    db,
    'catalog-manager',
    registry
      .map(({ key }) => key)
      .filter(
        (key) =>
          /^(?:catalog|catalogTree|attributes|units|suppliers)\./.test(key) ||
          key === 'requests.viewPrices',
      ),
  );
  await makeUser(db, 'catalog-picker', ['catalog.view']);
  await makeUser(db, 'catalog-denied', []);
  manager = await login('catalog-manager');
  picker = await login('catalog-picker');
  unprivileged = await login('catalog-denied');
  pieceId = (await db.unit.findUniqueOrThrow({ where: { name: 'قطعة' } })).id;
});

afterAll(() => db.$disconnect());

describe('route authorization and validation', () => {
  const invalid: [Method, string, object?][] = [
    ['get', tree + '/categories?active=maybe'],
    ['get', tree + '/nodes/0'],
    ['get', tree + '/nodes/no/children'],
    [
      'post',
      tree + '/categories',
      { name: 'كهربا', codePrefix: 'el', iconKey: 'zap' },
    ],
    ['post', tree + '/nodes', { name: 'صحي', parentId: 0 }],
    ['put', tree + '/nodes/order', { parentId: null, ids: [1, 1] }],
    ['patch', tree + '/nodes/1', { name: ' ' }],
    ['post', tree + '/nodes/1/move', { parentId: null }],
    ['post', tree + '/nodes/1/deactivate', { isActive: true }],
    ['delete', tree + '/nodes/1', { force: true }],
    ['get', '/attributes?pageSize=101'],
    ['get', '/attributes/0'],
    [
      'post',
      '/attributes',
      { name: 'لون', type: 'SELECT', options: ['أحمر', 'أحمر'] },
    ],
    ['patch', '/attributes/1', { type: 'COLOR' }],
    ['post', '/attributes/1/deactivate', { reason: 1 }],
    ['delete', '/attributes/no'],
    ['post', '/attributes/1/options', { label: '' }],
    ['put', '/attributes/1/options/order', { ids: [1, 1] }],
    ['patch', '/attributes/1/options/1', { isActive: false }],
    ['post', '/attributes/1/options/1/deactivate', { force: true }],
    ['delete', '/attributes/1/options/0'],
    ['get', '/nodes/-1/attributes'],
    ['get', '/nodes/-1/effective-attributes'],
    ['put', '/nodes/1/attributes', { attributeIds: [1, 1] }],
    ['get', '/units?active=maybe'],
    ['get', '/units/0'],
    ['post', '/units', { name: ' ' }],
    ['patch', '/units/1', {}],
    ['post', '/units/1/deactivate', { force: true }],
    ['delete', '/units/0'],
    ['get', '/catalog/categories?page=2'],
    ['get', '/catalog/nodes/0'],
    ['get', '/catalog/nodes/no/children'],
    ['get', '/catalog/nodes/1/items?page=0'],
    ['get', '/catalog/items/1?includeInactive=maybe'],
    ['get', '/catalog/search?categoryId=1&q=%D9%80'],
    [
      'post',
      '/catalog/items',
      { name: 'سلك', nodeId: 1, unitId: 1, code: 'FAKE' },
    ],
    ['patch', '/catalog/items/1', { nodeId: 1 }],
    ['post', '/catalog/items/1/move', { nodeId: -1 }],
    ['delete', '/catalog/items/1', { force: true }],
    ['get', '/suppliers?categoryId=0'],
    ['get', '/suppliers/no'],
    [
      'post',
      '/suppliers',
      { name: 'مورد', whatsappNumber: '01012345678', categoryIds: [] },
    ],
    ['patch', '/suppliers/1', { categoryIds: [1, 1] }],
    ['post', '/suppliers/1/deactivate', { force: true }],
    ['delete', '/suppliers/0'],
  ];
  it.each(invalid)(
    '%s %s checks permission before validation',
    async (method, path, input) => {
      await send(method, path, input, unprivileged).expect(403);
      await send(method, path, input).expect(422);
    },
  );

  it('lets catalog.view alone browse global catalog data without granting administration', async () => {
    const { body } = await send(
      'get',
      '/catalog/categories',
      undefined,
      picker,
    ).expect(200);
    const { id } = body[0];
    await send('get', `/catalog/nodes/${id}`, undefined, picker).expect(200);
    await send(
      'get',
      `/catalog/nodes/${id}/children`,
      undefined,
      picker,
    ).expect(200);
    await send('get', `/catalog/nodes/${id}/items`, undefined, picker).expect(
      200,
    );
    await send('get', tree + '/categories', undefined, picker).expect(403);
    await send('get', '/units', undefined, picker).expect(403);
    await send('get', '/suppliers', undefined, picker).expect(403);
    await send('get', '/catalog/categories', undefined, '').expect(401);
  });
});

it('seeds the specified categories and units once, preserving subsequent changes and deletes', async () => {
  const { body: roots } = await send('get', tree + '/categories').expect(200);
  expect(
    roots.map(({ name, codePrefix }: { name: string; codePrefix: string }) => [
      name,
      codePrefix,
    ]),
  ).toEqual([
    ['كهربا', 'ELC'],
    ['صحي', 'PLM'],
    ['سيراميك', 'CER'],
    ['دهانات', 'PNT'],
    ['أوكر ومقابض', 'HDW'],
  ]);
  expect(
    roots.every((root: { iconKey: string }) => root.iconKey.length > 0),
  ).toBe(true);
  const { body: units } = await send('get', '/units').expect(200);
  expect(units.total).toBe(11);
  expect(units.items.map(({ name }: { name: string }) => name).sort()).toEqual(
    [
      'قطعة',
      'متر',
      'م²',
      'م³',
      'كرتونة',
      'شيكارة',
      'لتر',
      'جالون',
      'لفة',
      'طقم',
      'كيلو',
    ].sort(),
  );
  await send('patch', `${tree}/nodes/${roots[0].id}`, {
    name: 'أعمال الكهرباء',
  }).expect(200);
  await send('delete', `${tree}/nodes/${roots[4].id}`).expect(200);
  const gallon = units.items.find(
    ({ name }: { name: string }) => name === 'جالون',
  );
  await send('delete', `/units/${gallon.id}`).expect(200);
  await bootstrap(db, env);
  const { body: updated } = await send('get', tree + '/categories').expect(200);
  expect(updated.map(({ name }: { name: string }) => name)).toEqual([
    'أعمال الكهرباء',
    'صحي',
    'سيراميك',
    'دهانات',
  ]);
  await send('get', `/units/${gallon.id}`).expect(404);
  const seedEvents = await db.auditLog.findMany({
    where: { action: 'seed', entity: { in: ['CatalogNode', 'Unit'] } },
  });
  expect(seedEvents).toHaveLength(16);
  expect(
    seedEvents.every((event) => verifyAudit(env.AUDIT_HMAC_SECRET, event)),
  ).toBe(true);
});

it('moves entire subtrees, measures folder contents, and rejects invalid moves and deletes', async () => {
  const root = await category('TR');
  const other = await category('OTHER');
  await send('post', tree + '/categories', {
    name: 'ازدواج',
    codePrefix: 'TR',
    iconKey: 'zap',
  }).expect(409);
  const branch = await group(root, 'الفرع');
  const target = await group(root, 'المقصد');
  const targetChild = await group(target, 'داخل المقصد');
  const chain: number[] = [];
  for (let i = 1; i <= 6; i++)
    chain.push(await group(chain.at(-1) ?? branch, `المستوى ${i}`));
  const [head] = chain;
  const leaf = chain.at(-1)!;
  const { body: leafBefore } = await send(
    'get',
    `${tree}/nodes/${leaf}`,
  ).expect(200);
  expect(leafBefore.depth).toBe(7);
  expect(leafBefore.breadcrumb.map(({ id }: { id: number }) => id)).toEqual([
    root,
    branch,
    ...chain,
  ]);
  await send('put', tree + '/nodes/order', {
    parentId: root,
    ids: [target],
  }).expect(422);
  await send('put', tree + '/nodes/order', {
    parentId: root,
    ids: [target, branch],
  }).expect(200);
  const { body: beforeCounts } = await send(
    'get',
    `${tree}/nodes/${root}/children`,
  ).expect(200);
  expect(beforeCounts.map(({ id }: { id: number }) => id)).toEqual([
    target,
    branch,
  ]);
  const { body: deepItem } = await send('post', '/catalog/items', {
    name: 'مصباح',
    unitId: pieceId,
    nodeId: leaf,
  }).expect(201);
  await send('post', '/catalog/items', {
    name: 'سلك',
    unitId: pieceId,
    nodeId: root,
  }).expect(201);
  await send('patch', `${tree}/nodes/${root}`, { codePrefix: 'NEW' }).expect(
    409,
  );
  await send('patch', `${tree}/nodes/${branch}`, { codePrefix: 'NEW' }).expect(
    422,
  );
  await send('delete', `${tree}/nodes/${branch}`).expect(409);
  await send('delete', `${tree}/nodes/${leaf}`).expect(409);
  await send('post', `${tree}/nodes/${root}/move`, { parentId: target }).expect(
    409,
  );
  await send('post', `${tree}/nodes/${head}/move`, { parentId: other }).expect(
    409,
  );
  await send('post', `${tree}/nodes/${head}/move`, { parentId: leaf }).expect(
    409,
  );
  await send('post', `${tree}/nodes/${head}/move`, {
    parentId: targetChild,
  }).expect(200);

  for (const [offset, id] of chain.entries()) {
    const trail = [root, target, targetChild, ...chain.slice(0, offset + 1)];
    const { body } = await send('get', `${tree}/nodes/${id}`).expect(200);
    expect(body).toMatchObject({
      depth: 3 + offset,
      path: `/${trail.join('/')}/`,
    });
    expect(body.breadcrumb.map((crumb: { id: number }) => crumb.id)).toEqual(
      trail,
    );
  }
  const { body: children } = await send(
    'get',
    `${tree}/nodes/${root}/children`,
  ).expect(200);
  expect(children).toMatchObject([
    { id: target, childGroupCount: 1, subtreeItemCount: 1, coverThumbs: [] },
    { id: branch, childGroupCount: 0, subtreeItemCount: 0, coverThumbs: [] },
  ]);
  const { body: roots } = await send('get', tree + '/categories').expect(200);
  expect(roots.find((row: { id: number }) => row.id === root)).toMatchObject({
    childGroupCount: 2,
    subtreeItemCount: 2,
  });
  await send('delete', `${tree}/nodes/${branch}`).expect(200);
  const deactivated = await send(
    'post',
    `${tree}/nodes/${target}/deactivate`,
  ).expect(200);
  expect(deactivated.body.isActive).toBe(false);
  await send('get', `/catalog/nodes/${leaf}`, undefined, picker).expect(404);
  await send('get', `/catalog/items/${deepItem.id}`, undefined, picker).expect(
    404,
  );
  await send(
    'get',
    `/catalog/items/${deepItem.id}?includeInactive=true`,
    undefined,
    picker,
  ).expect(403);
  await send(
    'get',
    `/catalog/items/${deepItem.id}?includeInactive=true`,
  ).expect(200);
  expect((await search(root, 'مصباح')).body.total).toBe(0);
  const { body: filtered } = await send(
    'get',
    `${tree}/nodes/${root}/children?active=false`,
  ).expect(200);
  expect(filtered.map(({ id }: { id: number }) => id)).toEqual([target]);
  const { body: pickerFolders } = await send(
    'get',
    '/catalog/categories',
    undefined,
    picker,
  ).expect(200);
  expect(
    pickerFolders.find((row: { id: number }) => row.id === root),
  ).toMatchObject({ childGroupCount: 0, subtreeItemCount: 1 });
  await send('patch', `${tree}/nodes/${target}`, { isActive: true }).expect(
    200,
  );
  await send('get', `/catalog/items/${deepItem.id}`, undefined, picker).expect(
    200,
  );
});

it('validates attribute definitions and manages ordered options and inherited defaults', async () => {
  const root = await category('ATTR');
  const mid = await group(root);
  const leaf = await group(mid);
  const text = (
    await send('post', '/attributes', { name: 'السطح', type: 'TEXT' }).expect(
      201,
    )
  ).body;
  const length = (
    await send('post', '/attributes', {
      name: 'الطول',
      type: 'NUMBER',
      unitLabel: 'سم',
    }).expect(201)
  ).body;
  const finish = (
    await send('post', '/attributes', {
      name: 'التشطيب',
      type: 'SELECT',
      options: ['لامع', 'مطفي'],
    }).expect(201)
  ).body;
  const extra = (
    await send('post', '/attributes', { name: 'الموديل', type: 'TEXT' }).expect(
      201,
    )
  ).body;
  const [gloss, matte] = finish.options;
  await send('post', '/attributes', { name: 'السطح', type: 'TEXT' }).expect(
    409,
  );
  await send('patch', `/attributes/${text.id}`, { unitLabel: 'سم' }).expect(
    422,
  );
  await send('patch', `/attributes/${length.id}`, {
    name: 'العرض',
    unitLabel: 'م',
  }).expect(200);
  await send('post', `/attributes/${text.id}/options`, {
    label: 'خيار',
  }).expect(422);
  await send('post', `/attributes/${finish.id}/options`, {
    label: matte.label,
  }).expect(409);
  const satin = (
    await send('post', `/attributes/${finish.id}/options`, {
      label: 'ساتان',
    }).expect(201)
  ).body;
  await send('put', `/attributes/${finish.id}/options/order`, {
    ids: [gloss.id],
  }).expect(422);
  await send('put', `/attributes/${finish.id}/options/order`, {
    ids: [satin.id, matte.id, gloss.id],
  }).expect(200);
  await send('patch', `/attributes/${finish.id}/options/${satin.id}`, {
    label: 'نصف لامع',
  }).expect(200);
  await send(
    'post',
    `/attributes/${finish.id}/options/${matte.id}/deactivate`,
  ).expect(200);
  await send('put', `/nodes/${root}/attributes`, {
    attributeIds: [text.id, finish.id],
  }).expect(200);
  await send('put', `/nodes/${mid}/attributes`, {
    attributeIds: [length.id, text.id],
  }).expect(200);
  await send('put', `/nodes/${leaf}/attributes`, {
    attributeIds: [extra.id],
  }).expect(200);
  await send('put', `/nodes/${leaf}/attributes`, {
    attributeIds: [2147483647],
  }).expect(422);
  const own = await send('get', `/nodes/${leaf}/attributes`).expect(200);
  expect(own.body.map(({ id }: { id: number }) => id)).toEqual([extra.id]);
  const eff = await send('get', `/nodes/${leaf}/effective-attributes`).expect(
    200,
  );
  expect(eff.body.map(({ id }: { id: number }) => id)).toEqual([
    text.id,
    finish.id,
    length.id,
    extra.id,
  ]);
  expect(
    eff.body[1].options.map(({ label }: { label: string }) => label),
  ).toEqual(['نصف لامع', 'لامع']);
  await send('post', `/attributes/${length.id}/deactivate`).expect(200);
  const disabled = await send('get', '/attributes?active=false').expect(200);
  expect(disabled.body.items.map(({ id }: { id: number }) => id)).toContain(
    length.id,
  );
  const withoutLength = await send(
    'get',
    `/nodes/${leaf}/effective-attributes`,
  ).expect(200);
  expect(withoutLength.body.map(({ id }: { id: number }) => id)).toEqual([
    text.id,
    finish.id,
    extra.id,
  ]);
  await send('delete', `/attributes/${length.id}`).expect(409);
  await send('patch', `/attributes/${length.id}`, { isActive: true }).expect(
    200,
  );
  await send('patch', `/attributes/${finish.id}/options/${matte.id}`, {
    isActive: true,
  }).expect(200);
  await send('delete', `/attributes/${finish.id}/options/${gloss.id}`).expect(
    200,
  );
  const remaining = await send('get', `/attributes/${finish.id}`).expect(200);
  expect(remaining.body.options.map(({ id }: { id: number }) => id)).toEqual([
    satin.id,
    matte.id,
  ]);
  await send('put', `/nodes/${leaf}/attributes`, { attributeIds: [] }).expect(
    200,
    [],
  );
  await send('delete', `/attributes/${extra.id}`).expect(200);
});

it('searches normalized item fields at any depth and keeps code, search text and visibility consistent', async () => {
  const root = await category('SRC');
  const other = await category('SCO');
  const mid = await group(root, 'المجموعة');
  const leaf = await group(mid, 'الداخل');
  const text = (
    await send('post', '/attributes', { name: 'الخامة', type: 'TEXT' }).expect(
      201,
    )
  ).body;
  const numeric = (
    await send('post', '/attributes', { name: 'الوزن', type: 'NUMBER' }).expect(
      201,
    )
  ).body;
  const choice = (
    await send('post', '/attributes', {
      name: 'اللون',
      type: 'SELECT',
      options: ['أَزْرَق', 'أبيض'],
    }).expect(201)
  ).body;
  const foreign = (
    await send('post', '/attributes', {
      name: 'المقاس',
      type: 'SELECT',
      options: ['كبير'],
    }).expect(201)
  ).body;
  const input = {
    nodeId: leaf,
    unitId: pieceId,
    name: 'إضَــاءة  سقفىة',
    attributeValues: [
      { attributeId: text.id, value: 'أَلُومِنْيُوم' },
      { attributeId: numeric.id, value: '-12.340' },
      { attributeId: choice.id, value: choice.options[0].id },
    ],
  };
  for (const [attributeId, value] of [
    [text.id, 1],
    [numeric.id, 'abc'],
    [choice.id, foreign.options[0].id],
    [2147483647, 'قيمة'],
  ]) {
    await send('post', '/catalog/items', {
      ...input,
      attributeValues: [{ attributeId, value }],
    }).expect(422);
  }
  await send('post', '/catalog/items', { ...input, unitId: 2147483647 }).expect(
    422,
  );
  const { body: item } = await send('post', '/catalog/items', input).expect(
    201,
  );
  expect(item).toMatchObject({
    code: 'SRC-0001',
    nodeId: leaf,
    unit: { id: pieceId, name: 'قطعة' },
  });
  expect(
    item.attributeValues.map(({ value }: { value: unknown }) => value),
  ).toEqual(['أَلُومِنْيُوم', '-12.34', choice.options[0].id]);
  const atRoot = (
    await send('post', '/catalog/items', {
      name: 'اضاءه سقفيه',
      unitId: pieceId,
      nodeId: root,
    }).expect(201)
  ).body;
  const otherItem = (
    await send('post', '/catalog/items', { ...input, nodeId: other }).expect(
      201,
    )
  ).body;
  expect(otherItem.code).toBe('SCO-0001');
  const get = await send(
    'get',
    `/catalog/items/${item.id}`,
    undefined,
    picker,
  ).expect(200);
  expect(get.body).not.toHaveProperty('latestPrice');
  expect(get.body).not.toHaveProperty('searchText');
  const withPrice = await send('get', `/catalog/items/${item.id}`).expect(200);
  expect(withPrice.body.latestPrice).toBeNull();
  expect(await db.catalogItemPrice.count()).toBe(0);

  const page1 = (await search(root, 'اضاءه سقفيه', picker, '&pageSize=1')).body;
  const page2 = (
    await search(root, 'اضاءه سقفيه', picker, '&pageSize=1&page=2')
  ).body;
  expect(page1).toMatchObject({ total: 2, page: 1, pageSize: 1 });
  expect(page2).toMatchObject({ total: 2, page: 2, pageSize: 1 });
  expect([page1.items[0].id, page2.items[0].id].sort()).toEqual(
    [item.id, atRoot.id].sort(),
  );
  for (const q of ['src-0001', 'الومنيوم', '-12.34', 'ازرق']) {
    const { items, total } = (await search(root, q)).body;
    expect(total).toBe(1);
    expect(items[0].id).toBe(item.id);
    expect(items[0].nodePath.map(({ id }: { id: number }) => id)).toEqual([
      root,
      mid,
      leaf,
    ]);
  }
  expect((await search(root, '%')).body.total).toBe(0);
  expect((await search(other, 'الومنيوم')).body.items[0].id).toBe(otherItem.id);
  await send(
    'get',
    `/catalog/search?categoryId=${leaf}&q=src`,
    undefined,
    picker,
  ).expect(422);
  expect(
    (
      await send(
        'get',
        `/catalog/nodes/${root}/items`,
        undefined,
        picker,
      ).expect(200)
    ).body.items.map(({ id }: { id: number }) => id),
  ).toEqual([atRoot.id]);
  await send('post', `/catalog/items/${item.id}/move`, {
    nodeId: other,
  }).expect(409);
  const moved = await send('post', `/catalog/items/${item.id}/move`, {
    nodeId: mid,
  }).expect(200);
  expect(moved.body).toMatchObject({ nodeId: mid, code: item.code });

  await send('patch', `/attributes/${choice.id}`, { type: 'TEXT' }).expect(409);
  await send(
    'delete',
    `/attributes/${choice.id}/options/${choice.options[0].id}`,
  ).expect(409);
  await send(
    'patch',
    `/attributes/${choice.id}/options/${choice.options[0].id}`,
    { label: 'بنفسجي' },
  ).expect(200);
  expect((await search(root, 'ازرق')).body.total).toBe(0);
  expect((await search(root, 'بنفسجي')).body.items[0].id).toBe(item.id);
  await send(
    'post',
    `/attributes/${choice.id}/options/${choice.options[0].id}/deactivate`,
  ).expect(200);
  await send('post', '/catalog/items', input).expect(422);
  const values = [
    { attributeId: text.id, value: 'نحاس' },
    { attributeId: choice.id, value: choice.options[0].id },
  ];
  await send('patch', `/catalog/items/${item.id}`, {
    name: 'كَشَّاف',
    attributeValues: values,
  }).expect(200);
  expect((await search(root, 'نحاس')).body.items[0].id).toBe(item.id);
  expect((await search(root, 'اضاءه')).body.total).toBe(1);
  expect((await search(root, 'الومنيوم')).body.total).toBe(0);
  const itemPath = (await search(root, 'كشاف')).body.items[0].nodePath;
  expect(itemPath.map(({ id }: { id: number }) => id)).toEqual([root, mid]);
  await send('delete', `/catalog/items/${item.id}`).expect(200);
  await send('get', `/catalog/items/${item.id}`, undefined, picker).expect(404);
  expect((await search(root, 'كشاف')).body.total).toBe(0);
  expect(
    (await search(root, 'كشاف', manager, '&includeInactive=true')).body.items[0]
      .isActive,
  ).toBe(false);
  await send('patch', `/catalog/items/${item.id}`, { isActive: true }).expect(
    200,
  );
  expect((await search(root, 'كشاف')).body.items[0].isActive).toBe(true);
});

it('allocates 50 sequential codes under concurrent HTTP creates and never reuses a code', async () => {
  const root = await category('SEQ');
  const leaf = await group(root);
  const responses = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      send('post', '/catalog/items', {
        name: `صنف ${index}`,
        nodeId: index % 2 ? root : leaf,
        unitId: pieceId,
      }).expect(201),
    ),
  );
  expect(responses.map(({ body }) => body.code).sort()).toEqual(
    Array.from(
      { length: 50 },
      (_, i) => `SEQ-${String(i + 1).padStart(4, '0')}`,
    ),
  );
  const ids = responses.map(({ body }) => String(body.id));
  const audits = await db.auditLog.findMany({
    where: { entityId: { in: ids }, action: 'catalogItem.create' },
  });
  expect(audits).toHaveLength(50);
  expect(
    audits.every((event) => verifyAudit(env.AUDIT_HMAC_SECRET, event)),
  ).toBe(true);
  await send('delete', `/catalog/items/${responses[0]!.body.id}`).expect(200);
  expect(
    (
      await send('post', '/catalog/items', {
        name: 'صنف جديد',
        nodeId: root,
        unitId: pieceId,
      }).expect(201)
    ).body.code,
  ).toBe('SEQ-0051');
  await db.codeSequence.update({
    where: { categoryId: root },
    data: { lastValue: 9999 },
  });
  expect(
    (
      await send('post', '/catalog/items', {
        name: 'صنف 10000',
        nodeId: root,
        unitId: pieceId,
      }).expect(201)
    ).body.code,
  ).toBe('SEQ-10000');
}, 30_000);

it('manages uniquely named units and prevents deletion when a catalog item uses a unit', async () => {
  const root = await category('UNT');
  const unit = (await send('post', '/units', { name: 'علبة' }).expect(201))
    .body;
  await send('post', '/units', { name: ' علبة ' }).expect(409);
  await send('patch', `/units/${unit.id}`, { name: 'صندوق' }).expect(200);
  const renamed = await send('get', `/units/${unit.id}`).expect(200);
  expect(renamed.body.name).toBe('صندوق');
  await send('post', '/catalog/items', {
    nodeId: root,
    unitId: unit.id,
    name: 'مسامير',
  }).expect(201);
  await send('delete', `/units/${unit.id}`).expect(409);
  await send('post', `/units/${unit.id}/deactivate`).expect(200);
  await send('post', '/catalog/items', {
    nodeId: root,
    unitId: unit.id,
    name: 'مسمار',
  }).expect(422);
  await send('patch', `/units/${unit.id}`, { isActive: true }).expect(200);
  const spare = (await send('post', '/units', { name: 'ظرف' }).expect(201))
    .body;
  await send('delete', `/units/${spare.id}`).expect(200);
  await send('get', `/units/${spare.id}`).expect(404);
});

it('normalizes supplier phones, enforces unique numbers and lists only active suppliers by category', async () => {
  const root = await category('SUP');
  const other = await category('SU');
  const child = await group(root);
  const payload = {
    name: 'مورد',
    whatsappNumber: '0101 234-5678',
    categoryIds: [root, other],
  };
  await send('post', '/suppliers', { ...payload, categoryIds: [child] }).expect(
    422,
  );
  await send('post', '/suppliers', {
    ...payload,
    whatsappNumber: '0212345678',
  }).expect(422, {
    error: 'INVALID_EGYPTIAN_MOBILE',
    message: 'اكتب رقم موبايل مصري، مثال: 01012345678',
  });
  const first = (await send('post', '/suppliers', payload).expect(201)).body;
  expect(first).toMatchObject({
    whatsappNumber: '201012345678',
    whatsappDisplay: '0101 234 5678',
    categoryIds: [root, other],
  });
  await send('post', '/suppliers', {
    ...payload,
    whatsappNumber: '+20 10 1234 5678',
  }).expect(409);
  const second = (
    await send('post', '/suppliers', {
      ...payload,
      whatsappNumber: '01212345678',
      categoryIds: [other],
    }).expect(201)
  ).body;
  await send('patch', `/suppliers/${second.id}`, {
    whatsappNumber: '00201012345678',
  }).expect(409);
  await send('patch', `/suppliers/${first.id}`, {
    whatsappNumber: '00201012345678',
    contactPerson: 'علي',
    categoryIds: [root],
  }).expect(200);
  await send('delete', `${tree}/nodes/${other}`).expect(409);
  await send('get', `/suppliers?categoryId=${child}`).expect(422);
  const byCategory = await send('get', `/suppliers?categoryId=${root}`).expect(
    200,
  );
  expect(byCategory.body.items.map(({ id }: { id: number }) => id)).toEqual([
    first.id,
  ]);
  await send('post', `/suppliers/${first.id}/deactivate`).expect(200);
  await send('get', `/suppliers?categoryId=${root}`).expect(200, {
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
  });
  await send('post', '/suppliers', payload).expect(409);
  expect(
    (await send('get', `/suppliers/${first.id}`).expect(200)).body,
  ).toMatchObject({
    isActive: false,
    contactPerson: 'علي',
    categoryIds: [root],
  });
  await send('patch', `/suppliers/${first.id}`, { isActive: true }).expect(200);
  await send('delete', `/suppliers/${second.id}`).expect(200);
  await send('get', `/suppliers/${second.id}`).expect(404);
});

it('keeps inactive folder data and editor choices behind the management grants', async () => {
  const root = await category('PUI');
  const child = await group(root, 'مجلد موقوف');
  const { body: definition } = await send('post', '/attributes', {
    name: 'عرض المجلد',
    type: 'NUMBER',
    unitLabel: 'سم',
  }).expect(201);
  await send('put', '/nodes/' + root + '/attributes', {
    attributeIds: [definition.id],
  }).expect(200);
  await send('post', tree + '/nodes/' + child + '/deactivate').expect(200);
  await send('get', '/catalog/nodes/' + child, undefined, picker).expect(404);
  await send(
    'get',
    '/catalog/nodes/' + child + '?includeInactive=true',
    undefined,
    picker,
  ).expect(403);
  await send(
    'get',
    '/catalog/categories?includeInactive=true',
    undefined,
    picker,
  ).expect(403);
  await send(
    'get',
    '/catalog/nodes/' + root + '/children?includeInactive=true',
    undefined,
    picker,
  ).expect(403);
  const folders = await send(
    'get',
    '/catalog/nodes/' + root + '/children?includeInactive=true',
  ).expect(200);
  expect(folders.body).toEqual([
    expect.objectContaining({ id: child, isActive: false }),
  ]);
  const folder = await send(
    'get',
    '/catalog/nodes/' + child + '?includeInactive=true',
  ).expect(200);
  expect(folder.body.breadcrumb.map(({ id }: { id: number }) => id)).toEqual([
    root,
    child,
  ]);
  const choices = '/catalog/nodes/' + child + '/editor-choices';
  await send('get', choices, undefined, picker).expect(403);
  await send('get', choices + '?pageSize=101').expect(422);
  await send('get', '/catalog/nodes/2147483647/editor-choices').expect(404);
  const { body } = await send('get', choices).expect(200);
  expect(body.defaults).toEqual([
    expect.objectContaining({ id: definition.id, unitLabel: 'سم' }),
  ]);
  expect(body.units.items).toContainEqual(
    expect.objectContaining({ id: pieceId }),
  );
  await send('get', '/suppliers/category-choices', undefined, picker).expect(
    403,
  );
  const categories = await send('get', '/suppliers/category-choices').expect(
    200,
  );
  expect(categories.body).toContainEqual(expect.objectContaining({ id: root }));
  expect(categories.body).not.toContainEqual(
    expect.objectContaining({ id: child }),
  );
});

it('saves item changes, relocation and active status in one update', async () => {
  const root = await category('PUE');
  const other = await category('PUO');
  const first = await group(root, 'أول');
  const second = await group(root, 'ثاني');
  const restrictedName = 'catalog-editor-only';
  await makeUser(db, restrictedName, [
    'catalog.edit',
    'catalog.create',
    'suppliers.edit',
    'suppliers.create',
  ]);
  const restricted = await login(restrictedName);
  const { body: item } = await send('post', '/catalog/items', {
    name: 'كوع',
    nodeId: first,
    unitId: pieceId,
  }).expect(201);
  const editor = '/catalog/items/' + item.id + '/editor';
  await send('patch', editor, { name: 'اسم آخر' }, picker).expect(403);
  await send('patch', editor, { nodeId: 0 }).expect(422);
  await send('patch', editor, { name: 'نقل ممنوع', nodeId: other }).expect(409);
  await send(
    'patch',
    editor,
    { name: 'اسم ممنوع', isActive: false },
    restricted,
  ).expect(403);
  await send(
    'post',
    '/catalog/items',
    { name: 'موقوف', nodeId: first, unitId: pieceId, isActive: false },
    restricted,
  ).expect(403);
  const unchanged = await send('get', '/catalog/items/' + item.id).expect(200);
  expect(unchanged.body).toMatchObject({
    name: 'كوع',
    nodeId: first,
    isActive: true,
  });
  const saved = await send('patch', editor, {
    name: 'كوع كبير',
    nodeId: second,
    isActive: false,
  }).expect(200);
  expect(saved.body).toMatchObject({
    name: 'كوع كبير',
    nodeId: second,
    isActive: false,
    code: item.code,
  });
  await send('get', '/catalog/items/' + item.id, undefined, picker).expect(404);
  const stoppedItems = await send(
    'get',
    '/catalog/nodes/' + second + '/items?includeInactive=true&active=false',
  ).expect(200);
  expect(stoppedItems.body.items.map(({ id }: { id: number }) => id)).toEqual([
    item.id,
  ]);
  expect(
    (
      await search(
        root,
        'كوع كبير',
        manager,
        '&includeInactive=true&active=true',
      )
    ).body.total,
  ).toBe(0);
  expect(
    (
      await search(
        root,
        'كوع كبير',
        manager,
        '&includeInactive=true&active=false',
      )
    ).body.items,
  ).toHaveLength(1);
  const supplier = {
    name: 'مورد المجلد',
    whatsappNumber: '01522224444',
    categoryIds: [root],
  };
  await send(
    'post',
    '/suppliers',
    { ...supplier, isActive: false },
    restricted,
  ).expect(403);
  const created = await send('post', '/suppliers', supplier).expect(201);
  await send(
    'patch',
    '/suppliers/' + created.body.id,
    { isActive: false },
    restricted,
  ).expect(403);
  const stopped = await send('patch', '/suppliers/' + created.body.id, {
    isActive: false,
  }).expect(200);
  expect(stopped.body.isActive).toBe(false);
});

it('stores an optional unit price, keeps "not set" distinct from zero and redacts it by grant', async () => {
  const root = await category('UPR');
  const folder = await group(root, 'أسعار');
  const create = (fields: object, cookie = manager) =>
    send(
      'post',
      '/catalog/items',
      { name: 'صنف', nodeId: folder, unitId: pieceId, ...fields },
      cookie,
    );
  const unset = (await create({ name: 'بدون سعر' }).expect(201)).body;
  const zero = (await create({ name: 'سعره صفر', unitPrice: '0' }).expect(201))
    .body;
  const priced = (
    await create({ name: 'مسعّر', unitPrice: '1250.5' }).expect(201)
  ).body;
  expect([unset.unitPrice, zero.unitPrice, priced.unitPrice]).toEqual([
    null,
    '0.00',
    '1250.50',
  ]);
  const stored = new Map(
    (
      await db.catalogItem.findMany({
        where: { id: { in: [unset.id, zero.id, priced.id] } },
      })
    ).map((row) => [row.id, row.unitPrice?.toFixed(2) ?? null]),
  );
  expect([
    stored.get(unset.id),
    stored.get(zero.id),
    stored.get(priced.id),
  ]).toEqual([null, '0.00', '1250.50']);
  for (const unitPrice of [
    '-1',
    '1.234',
    '1e3',
    12,
    '',
    ' 5',
    '01',
    '1234567890123',
    false,
  ])
    await create({ name: 'سعر غلط', unitPrice }).expect(422);
  expect(await db.catalogItem.count({ where: { name: 'سعر غلط' } })).toBe(0);

  // Editing sets, keeps and clears the price; omitting it leaves the stored value alone.
  const item = '/catalog/items/' + priced.id;
  expect(
    (await send('patch', item, { unitPrice: '99.99' }).expect(200)).body
      .unitPrice,
  ).toBe('99.99');
  expect(
    (await send('patch', item + '/editor', { name: 'مسعّر 2' }).expect(200)).body
      .unitPrice,
  ).toBe('99.99');
  const audit = await db.auditLog.findFirstOrThrow({
    where: { action: 'catalogItem.update', entityId: String(priced.id) },
    orderBy: { id: 'asc' },
  });
  expect(audit.oldValue).toMatchObject({ unitPrice: '1250.50' });
  expect(audit.newValue).toMatchObject({ unitPrice: '99.99' });
  expect(
    (await send('patch', item + '/editor', { unitPrice: null }).expect(200))
      .body.unitPrice,
  ).toBeNull();
  await send('patch', item, { unitPrice: '0.00' }).expect(200);
  await send('patch', item, { unitPrice: '0.001' }).expect(422);
  // The entered price is reference data only: purchase price history stays empty.
  const detail = (await send('get', item).expect(200)).body;
  expect(detail).toMatchObject({ unitPrice: '0.00', latestPrice: null });

  // Without requests.viewPrices the field is absent everywhere and cannot be written.
  await makeUser(db, 'catalog-blind-editor', [
    'catalog.create',
    'catalog.edit',
  ]);
  const blind = await login('catalog-blind-editor');
  await makeUser(db, 'catalog-price-reader', [
    'catalog.view',
    'requests.viewPrices',
  ]);
  const reader = await login('catalog-price-reader');
  for (const cookie of [blind, picker]) {
    expect(
      (await send('get', item, undefined, cookie).expect(200)).body,
    ).not.toHaveProperty('unitPrice');
    const listed = (
      await send(
        'get',
        '/catalog/nodes/' + folder + '/items',
        undefined,
        cookie,
      ).expect(200)
    ).body.items;
    expect(listed).toHaveLength(3);
    for (const row of listed) expect(row).not.toHaveProperty('unitPrice');
    for (const row of (await search(root, 'سعر', cookie)).body.items)
      expect(row).not.toHaveProperty('unitPrice');
  }
  for (const unitPrice of ['5', null]) {
    const refused = await send('patch', item, { unitPrice }, blind).expect(403);
    expect(refused.body.message).toBe(masterData.unitPriceForbidden);
    await create({ name: 'محجوب', unitPrice }, blind).expect(403);
  }
  const renamed = (
    await send('patch', item, { name: 'اسم بدون سعر' }, blind).expect(200)
  ).body;
  expect(renamed).not.toHaveProperty('unitPrice');
  const added = (await create({ name: 'من غير سعر' }, blind).expect(201)).body;
  expect(added).not.toHaveProperty('unitPrice');
  expect(
    (
      await db.catalogItem.findUniqueOrThrow({ where: { id: priced.id } })
    ).unitPrice?.toFixed(2),
  ).toBe('0.00');
  expect(
    (await send('get', item, undefined, reader).expect(200)).body.unitPrice,
  ).toBe('0.00');
});
