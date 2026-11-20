import type { PrismaClient } from '@prisma/client';
import { defaultSettings } from '@purchasing-plus/shared';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';
import { bootstrap } from '../access/seed.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app);
const path = '/api/v1/settings';
let reader: string;
let writer: string;

async function login(username: string) {
  const response = await api
    .post('/api/v1/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username, password: testPassword })
    .expect(204);
  return String(response.headers['set-cookie']![0]).split(';')[0]!;
}
function save(cookie: string, body: object) {
  return api
    .put(path)
    .set('Cookie', cookie)
    .set('Origin', env.PUBLIC_ORIGIN)
    .send(body);
}
beforeAll(async () => {
  await resetDb();
  await bootstrap(db, env);
  await makeUser(db, 'settings-reader', []);
  await makeUser(db, 'settings-writer', ['settings.manage']);
  reader = await login('settings-reader');
  writer = await login('settings-writer');
});
afterAll(() => db.$disconnect());

it('only requires sign-in for reads and settings.manage for writes', async () => {
  await api.get(path).expect(401);
  await save('', defaultSettings).expect(401);
  await api.get(path).set('Cookie', reader).expect(200, defaultSettings);
  await save(reader, defaultSettings).expect(403);
});

it('validates templates and aging range, stores changes once and audits the write', async () => {
  const invalid = [
    { rfqIntro: '{unknown}' },
    { supplyOrderIntro: '{siteAddress' },
    { agingDays: 0 },
    { agingDays: 61 },
    { agingDays: 3.5 },
  ];
  for (const change of invalid) {
    const response = await save(writer, {
      ...defaultSettings,
      ...change,
    }).expect(422);
    expect(response.body).toMatchObject({
      error: 'INVALID_SETTINGS',
      fix: expect.any(String),
    });
  }
  await api.get(path).set('Cookie', reader).expect(200, defaultSettings);
  const updated = {
    rfqIntro: 'رقم {requestNumber} في {categoryName}',
    supplyOrderIntro: 'التسليم إلى {siteName} {siteAddress}',
    agingDays: 60,
  };
  await save(writer, updated).expect(200, updated);
  await bootstrap(db, env);
  await api.get(path).set('Cookie', reader).expect(200, updated);
  expect(await db.settings.count()).toBe(1);
  const events = await db.auditLog.findMany({
    where: { action: 'settings.update' },
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    oldValue: defaultSettings,
    newValue: updated,
  });
});
