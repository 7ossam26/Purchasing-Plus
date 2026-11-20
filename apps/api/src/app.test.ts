import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
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
    expect(response.body).toEqual({ status: 'ok', db: 'ok' });
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
