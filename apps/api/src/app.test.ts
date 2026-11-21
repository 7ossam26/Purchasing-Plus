import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createStorage } from './lib/storage.js';
import { AppError, errorHandler } from './middleware/errors.js';
import { testDatabaseUrl } from './test/db.js';

const app = createApp({ databaseUrl: testDatabaseUrl() });

afterAll(async () => {
  await app.locals.db.$disconnect();
});

describe('API scaffold', () => {
  it('checks the real test database', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', db: 'ok', storage: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects a missing DATABASE_URL with a bilingual error', () => {
    const values = { ...process.env, DATABASE_URL: undefined };
    expect(() => parseEnv(values)).toThrow(/DATABASE_URL/);
    expect(() => parseEnv(values)).toThrow(/إعدادات البيئة/);
  });

  it('renders AppError as the public error shape', async () => {
    const errorApp = express();
    errorApp.get('/api/test-error', () => {
      throw new AppError(422, 'INVALID_INPUT', 'قيمة غير صحيحة', 'أصلح القيمة');
    });
    errorApp.use(errorHandler);
    const response = await request(errorApp).get('/api/test-error');
    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: 'INVALID_INPUT',
      message: 'قيمة غير صحيحة',
      fix: 'أصلح القيمة',
    });
  });
});

const r2Env = {
  ...process.env,
  NODE_ENV: 'production',
  PUBLIC_ORIGIN: 'https://purchasing.example.com',
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: '123456789abcdef0123456789abcdef0',
  R2_ACCESS_KEY_ID: 'example-access-key',
  R2_SECRET_ACCESS_KEY: 'example-secret-key',
  R2_BUCKET: 'purchasing-images',
  STORAGE_PUBLIC_BASE_URL: '',
};

describe('production deployment', () => {
  const env = parseEnv(r2Env);
  const index = '<!doctype html><title>Purchasing+</title>';
  const asset = 'app-D4m4GBa1.js';
  let webRoot: string;
  let production: ReturnType<typeof createApp>;

  beforeAll(async () => {
    webRoot = await mkdtemp(join(tmpdir(), 'purchasing-spa-'));
    await mkdir(join(webRoot, 'assets'));
    await Promise.all([
      writeFile(join(webRoot, 'index.html'), index),
      writeFile(join(webRoot, 'manifest.webmanifest'), '{}'),
      writeFile(
        join(webRoot, 'assets', asset),
        'console.log("purchasing");\n'.repeat(100),
      ),
    ]);
    production = createApp({ databaseUrl: testDatabaseUrl(), env, webRoot });
  });

  afterAll(async () => {
    await production?.locals.db.$disconnect();
    if (webRoot) await rm(webRoot, { recursive: true, force: true });
  });

  it('reports each missing R2 setting at boot without exposing values', () => {
    const invalid = {
      ...r2Env,
      R2_ACCOUNT_ID: undefined,
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '  ',
      R2_BUCKET: undefined,
    };
    for (const key of [
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ]) {
      expect(() => parseEnv(invalid)).toThrow(
        `${key} (Required for R2 storage)`,
      );
    }
    expect(() => parseEnv({ ...r2Env, R2_BUCKET: '' })).toThrow(
      /: R2_BUCKET \(Required for R2 storage\)$/,
    );
    expect(() =>
      parseEnv({ ...r2Env, STORAGE_PUBLIC_BASE_URL: 'bad url' }),
    ).toThrow(
      /Missing or invalid environment variables: STORAGE_PUBLIC_BASE_URL/,
    );
    expect(() =>
      parseEnv({ ...r2Env, PUBLIC_ORIGIN: 'http://purchasing.example.com' }),
    ).toThrow('PUBLIC_ORIGIN (HTTPS is required in production)');
  });

  it('serves the SPA entry point on deep links with revalidation', async () => {
    for (const path of ['/', '/index.html', '/requests/123/items']) {
      const page = await request(production)
        .get(path)
        .accept('html')
        .expect(200);
      expect(page.text).toBe(index);
      expect(page.headers['cache-control']).toBe('no-cache');
    }
    await request(production)
      .get('/manifest.webmanifest')
      .expect('Cache-Control', 'no-cache')
      .expect(200);
    await request(production)
      .get('/assets/missing-AAAAAAAA.js')
      .accept('html')
      .expect(404);
    await request(production)
      .get('/api/unknown')
      .accept('html')
      .expect('Content-Type', /json/)
      .expect(404);
    await request(production)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://elsewhere.example.com')
      .send({})
      .expect(403);
  });

  it('serves hashed assets with immutable caching and negotiates compression', async () => {
    await request(production)
      .get('/assets/' + asset)
      .set('Accept-Encoding', 'gzip')
      .expect('Cache-Control', 'public, max-age=31536000, immutable')
      .expect('Content-Encoding', 'gzip')
      .expect('Vary', 'Accept-Encoding')
      .expect(200);
  });

  it.each([
    ['', `https://${r2Env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`],
    ['https://images.example.com/static', 'https://images.example.com'],
  ])(
    'allows exactly the selected R2 image origin for base %j',
    async (base, origin) => {
      const mode = parseEnv({ ...r2Env, STORAGE_PUBLIC_BASE_URL: base });
      const storage = createStorage(mode);
      const key = 'catalog/1/12345678-1234-1234-1234-123456789abc-thumb.webp';
      const url = new URL(await storage.url(key));
      expect(url.origin).toBe(origin);
      if (base) {
        expect(url.href).toBe(base + '/' + key);
      } else {
        expect(url.pathname).toBe(`/${mode.R2_BUCKET}/${key}`);
        expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
        expect(url.searchParams.has('X-Amz-Signature')).toBe(true);
      }
      const appForMode = createApp({
        databaseUrl: testDatabaseUrl(),
        env: mode,
        storage,
        webRoot,
      });
      try {
        const page = await request(appForMode).get('/').expect(200);
        expect(page.headers['content-security-policy']?.split(';')).toContain(
          `img-src 'self' ${origin}`,
        );
      } finally {
        await appForMode.locals.db.$disconnect();
      }
    },
  );

  it('returns 503 for invalid storage configuration without contacting R2', async () => {
    const invalid = createApp({
      databaseUrl: testDatabaseUrl(),
      env: { ...env, R2_BUCKET: '' },
    });
    try {
      const response = await request(invalid).get('/api/health').expect(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        db: 'ok',
        storage: 'unavailable',
      });
    } finally {
      await invalid.locals.db.$disconnect();
    }
  });

  it('returns 503 when the database is unreachable', async () => {
    const offline = createApp({
      databaseUrl: 'postgresql://postgres@127.0.0.1:1/purchasing',
      env,
    });
    try {
      const response = await request(offline).get('/api/health').expect(503);
      expect(response.body).toEqual({
        status: 'unavailable',
        db: 'unavailable',
        storage: 'ok',
      });
    } finally {
      await offline.locals.db.$disconnect();
    }
  });
});
