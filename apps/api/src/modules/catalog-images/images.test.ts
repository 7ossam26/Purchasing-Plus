import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { LocalStorage, R2Storage } from '../../lib/storage.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { bootstrap } from '../access/seed.js';

import { maxUploadBytes, variants } from './pipeline.js';

const heic = await readFile(new URL('./fixtures/sample.heic', import.meta.url));
const pixels = {
  create: {
    width: 2100,
    height: 1050,
    channels: 3 as const,
    background: '#61645d',
  },
};
const jpeg = await sharp(pixels)
  .jpeg()
  .withMetadata({ orientation: 6 })
  .toBuffer();
const png = await sharp(pixels).png().toBuffer();

it('decodes actual JPEG, PNG, WebP and HEIC into oriented, metadata-free WebP variants', async () => {
  const webp = await sharp(pixels).webp().toBuffer();
  for (const [input, dimensions] of [
    [jpeg, [800, 1600, 200, 400]],
    [png, [1600, 800, 400, 200]],
    [webp, [1600, 800, 400, 200]],
    [heic, [96, 64, 96, 64]],
  ] as const) {
    const result = await variants(input);
    const display = await sharp(result.display).metadata(),
      thumb = await sharp(result.thumb).metadata();
    expect([display.width, display.height, thumb.width, thumb.height]).toEqual(
      dimensions,
    );
    for (const meta of [display, thumb]) {
      expect(meta.format).toBe('webp');
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
  }
  await expect(
    variants(Buffer.alloc(maxUploadBytes + 1)),
  ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  await expect(variants(Buffer.from('fake image'))).rejects.toMatchObject({
    code: 'IMAGE_TYPE',
  });
});

it('stores, deletes and signs R2 commands for one hour, and supports a public base URL', async () => {
  const send = vi.fn().mockResolvedValue({});
  const sign = vi.fn().mockResolvedValue('https://example.test/signed');
  const key = 'catalog/1/9cb7c04e-b55f-4834-886a-b35e37a8a552-display.webp';
  const client = { send } as unknown as Pick<S3Client, 'send'>;
  const storage = new R2Storage(
    client,
    'parts',
    undefined,
    sign as typeof getSignedUrl,
  );
  await storage.put(key, png, 'image/webp');
  await storage.delete(key);
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
  expect(send.mock.calls[0]?.[0].input).toMatchObject({
    Bucket: 'parts',
    Key: key,
    ContentType: 'image/webp',
  });
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  expect(await storage.url(key)).toBe('https://example.test/signed');
  expect(sign.mock.calls[0]?.[1]).toBeInstanceOf(GetObjectCommand);
  expect(sign).toHaveBeenCalledWith(client, expect.any(GetObjectCommand), {
    expiresIn: 3600,
  });
  expect(
    await new R2Storage(client, 'parts', 'https://images.test/').url(key),
  ).toBe('https://images.test/' + key);
});

const env = parseEnv(process.env);
const root = await mkdtemp(join(tmpdir(), 'purchasing-img-'));
const storage = new LocalStorage(root, env.SESSION_SECRET);
const app = createApp({ databaseUrl: testDatabaseUrl(), env, storage });
const db: PrismaClient = app.locals.db;
const api = request(app);
let item: number,
  rootNode: number,
  branch: number,
  editor: string,
  picker: string;
const auth = (
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  cookie = editor,
) =>
  api[method]('/api/v1' + path)
    .set('Cookie', cookie)
    .set('Origin', env.PUBLIC_ORIGIN);
const path = () => `/catalog/items/${item}/images`;
const upload = (input: Buffer, cookie = editor) =>
  auth('post', path(), cookie).attach('file', input, 'iPhone.HEIC');

beforeAll(async () => {
  await resetDb();
  await bootstrap(db, env);
  await makeUser(db, 'photo-editor', [
    'catalog.edit',
    'catalog.create',
    'catalogTree.create',
  ]);
  await makeUser(db, 'photo-picker', ['catalog.view']);
  async function login(username: string) {
    const res = await auth('post', '/auth/login', '')
      .send({ username, password: testPassword })
      .expect(204);
    return String(res.headers['set-cookie']![0]).split(';')[0]!;
  }
  editor = await login('photo-editor');
  picker = await login('photo-picker');
  const unit = await db.unit.findFirstOrThrow();
  rootNode = (
    await auth('post', '/catalog-tree/categories')
      .send({ name: 'إضاءة', codePrefix: 'IMG', iconKey: 'zap' })
      .expect(201)
  ).body.id;
  branch = (
    await auth('post', '/catalog-tree/nodes')
      .send({ parentId: rootNode, name: 'حي' })
      .expect(201)
  ).body.id;
  const leaf = (
    await auth('post', '/catalog-tree/nodes')
      .send({ parentId: branch, name: 'داخل حي' })
      .expect(201)
  ).body.id;
  item = (
    await auth('post', '/catalog/items')
      .send({ name: 'كشاف', unitId: unit.id, nodeId: leaf })
      .expect(201)
  ).body.id;
});
afterAll(async () => {
  await db.$disconnect();
  await rm(root, { recursive: true, force: true });
});

it('authorizes image actions, rejects bad inputs and rolls back a failed put', async () => {
  await upload(heic, '').expect(401);
  await upload(heic, picker).expect(403);
  await auth('post', path()).send({}).expect(422);
  await upload(Buffer.from('not an image')).expect(422);
  for (const [method, suffix] of [
    ['put', '/order'],
    ['put', '/1/cover'],
    ['delete', '/1'],
  ] as const) {
    await auth(method, path() + suffix, '').expect(401);
    await auth(method, path() + suffix, picker).expect(403);
  }
  await auth('put', path() + '/order')
    .send({ ids: [1, 1] })
    .expect(422);
  await auth('put', path() + '/bad/cover').expect(422);
  await auth('delete', path() + '/bad').expect(422);
  const put = storage.put.bind(storage);
  const failure = vi
    .spyOn(storage, 'put')
    .mockImplementationOnce(put)
    .mockRejectedValueOnce(new Error('put failed'));
  try {
    await upload(heic).expect(500);
    expect(await readdir(join(root, 'catalog', String(item)))).toEqual([]);
    expect(await db.catalogItemImage.count()).toBe(0);
  } finally {
    failure.mockRestore();
  }
});

it('limits the item, serves signed files, updates cover and exposes nested thumbnails', async () => {
  const first = (await upload(heic).expect(201)).body[0];
  expect(first).toMatchObject({
    isCover: true,
    width: 96,
    height: 64,
    order: 0,
  });
  const url = new URL(first.thumbUrl, 'http://localhost');
  const expiry = Number(url.searchParams.get('expires'));
  expect(expiry - Math.floor(Date.now() / 1000)).toBeGreaterThan(3580);
  await api.get(first.thumbUrl).expect(200).expect('Content-Type', /webp/);
  await api.get(url.pathname).expect(404);
  await api
    .get(first.thumbUrl.replace(/signature=./, 'signature=z'))
    .expect(404);
  const publicStorage = new LocalStorage(
    root,
    env.SESSION_SECRET,
    'https://example.test/api/v1/media/',
  );
  expect(await publicStorage.url(url.pathname.split('/media/')[1]!)).toBe(
    'https://example.test' + url.pathname,
  );
  const second = (await upload(png).expect(201)).body[1];
  await auth('put', path() + '/order')
    .send({ ids: [second.id] })
    .expect(409);
  await auth('put', path() + '/order')
    .send({ ids: [second.id, first.id] })
    .expect(200);
  await auth('put', path() + '/' + second.id + '/cover').expect(200);
  await auth('put', path() + '/999999/cover').expect(404);
  const response = await auth('get', '/catalog/items/' + item, picker).expect(
    200,
  );
  expect(
    response.body.images.map((image: { id: number; isCover: boolean }) => [
      image.id,
      image.isCover,
    ]),
  ).toEqual([
    [second.id, true],
    [first.id, false],
  ]);
  expect(response.body.images[0]).not.toHaveProperty('thumbKey');
  const folders = (
    await auth(
      'get',
      '/catalog/nodes/' + rootNode + '/children',
      picker,
    ).expect(200)
  ).body;
  expect(folders[0].id).toBe(branch);
  expect(folders[0].coverThumbs[0].split('?')[0]).toBe(
    second.thumbUrl.split('?')[0],
  );
  await db.catalogItem.update({
    where: { id: item },
    data: { isActive: false },
  });
  expect(
    (await auth('get', '/catalog/nodes/' + rootNode + '/children', picker))
      .body[0].coverThumbs,
  ).toEqual([]);
  await db.catalogItem.update({
    where: { id: item },
    data: { isActive: true },
  });
  for (let i = 0; i < 8; i++) await upload(heic).expect(201);
  await upload(heic).expect(409);
  const fail = vi
    .spyOn(storage, 'delete')
    .mockRejectedValueOnce(new Error('delete failed'));
  try {
    await auth('delete', path() + '/' + second.id).expect(503);
  } finally {
    fail.mockRestore();
  }
  const remaining = (await auth('delete', path() + '/' + second.id).expect(200))
    .body;
  expect(remaining[0]).toMatchObject({ id: first.id, isCover: true });
  await api.get(second.thumbUrl).expect(404);
  await api.get(second.displayUrl).expect(404);
  expect(
    await db.auditLog.count({ where: { action: 'catalogImage.delete' } }),
  ).toBe(1);
}, 20000);

it('previews oriented images without writing files and saves framing independently of the full image', async () => {
  const source = await db.catalogItem.findUniqueOrThrow({
    where: { id: item },
  });
  const target = (
    await auth('post', '/catalog/items')
      .send({
        name: 'إطار الكشاف',
        unitId: source.unitId,
        nodeId: source.nodeId,
      })
      .expect(201)
  ).body.id;
  const targetPath = `/catalog/items/${target}/images`;
  const preview = (buffer: Buffer, cookie = editor, url = targetPath) =>
    auth('post', url + '/preview', cookie).attach('file', buffer, 'photo');

  await preview(heic, '').expect(401);
  await preview(heic, picker).expect(403);
  await preview(heic, editor, '/catalog/items/999999/images').expect(404);
  await preview(Buffer.from('invalid')).expect(422);
  for (const [input, width, height] of [
    [heic, 96, 64],
    [jpeg, 800, 1600],
  ] as const) {
    const response = await preview(input)
      .expect(200)
      .expect('Content-Type', /webp/);
    expect(await sharp(response.body).metadata()).toMatchObject({
      width,
      height,
    });
  }
  expect(await db.catalogItemImage.count({ where: { itemId: target } })).toBe(
    0,
  );
  await expect(
    readdir(join(root, 'catalog', String(target))),
  ).rejects.toMatchObject({ code: 'ENOENT' });

  const crop = { x: 30, y: 8, size: 56 };
  const add = (value: string) =>
    auth('post', targetPath)
      .attach('file', heic, 'photo.heic')
      .field('crop', value);
  await add('{').expect(422);
  await add(JSON.stringify({ ...crop, x: 50 })).expect(422);
  const [image] = (await add(JSON.stringify(crop)).expect(201)).body;
  expect(image).toMatchObject({
    crop,
    width: 96,
    height: 64,
    isCover: true,
    order: 0,
  });

  const cropPath = targetPath + '/' + image.id + '/crop';
  const update = (value: unknown, cookie = editor, url = cropPath) =>
    auth('patch', url, cookie).send({ crop: value });
  const changed = { x: 0, y: 1, size: 50 };
  await update(changed, picker).expect(403);
  await update(changed, editor, path() + '/' + image.id + '/crop').expect(404);
  await update({ ...changed, size: 65 }).expect(422);
  await update({ ...changed, x: 0.5 }).expect(422);
  const original = (await api.get(image.displayUrl).expect(200)).body;
  const fileWrites = vi.spyOn(storage, 'put');
  try {
    const [updated] = (await update(changed).expect(200)).body;
    expect(updated).toMatchObject({
      id: image.id,
      crop: changed,
      isCover: true,
      order: 0,
    });
    expect(new URL(updated.displayUrl, 'http://localhost').pathname).toBe(
      new URL(image.displayUrl, 'http://localhost').pathname,
    );
    expect((await api.get(updated.displayUrl).expect(200)).body).toEqual(
      original,
    );
    expect(
      (await auth('get', '/catalog/items/' + target, picker).expect(200)).body
        .images[0].crop,
    ).toEqual(changed);
    expect((await update(null).expect(200)).body[0].crop).toBeNull();
    expect(fileWrites).not.toHaveBeenCalled();
    expect(
      await db.auditLog.count({ where: { action: 'catalogImage.crop' } }),
    ).toBe(2);
  } finally {
    fileWrites.mockRestore();
  }
});
