import { once } from 'node:events';

import { Prisma, type PrismaClient } from '@prisma/client';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeEach, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { parseEnv } from '../../config/env.js';
import { resetDb, testDatabaseUrl } from '../../test/db.js';
import { makeUser, testPassword } from '../../test/factories.js';

import { MemoryEventBus, type LiveSignal } from './bus.js';
import { purgeNotifications } from './repo.js';

const env = parseEnv(process.env);
let now = new Date();
const bus = new MemoryEventBus();
const app = createApp({
  databaseUrl: testDatabaseUrl(),
  env,
  clock: () => now,
  eventBus: bus,
});
const db: PrismaClient = app.locals.db;
const api = request(app);
const root = '/api/v1';
const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string')
  throw new Error('Expected a TCP server');
const url = 'http://127.0.0.1:' + address.port + root;
let siteId: number,
  elsewhere: number,
  categoryId: number,
  nodeId: number,
  unitId: number;

async function account(name: string, keys: PermissionKey[], site = siteId) {
  const user = await makeUser(db, name, keys, 'ASSIGNED', [site]);
  const response = await api
    .post(root + '/auth/login')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({ username: name, password: testPassword })
    .expect(204);
  return {
    id: user.id,
    cookie: String(response.headers['set-cookie']![0]).split(';')[0]!,
  };
}
type Account = Awaited<ReturnType<typeof account>>;
let creator: Account,
  approver: Account,
  foreign: Account,
  reader: Account,
  denied: Account;

function get(user: Account, path: string) {
  return api.get(root + path).set('Cookie', user.cookie);
}
function post(user: Account, path: string, body: object = {}) {
  return api
    .post(root + path)
    .set('Cookie', user.cookie)
    .set('Origin', env.PUBLIC_ORIGIN)
    .send(body);
}
async function ticket(user: Account) {
  return (await post(user, '/events/ticket').expect(201)).body.ticket as string;
}
async function stream(user: Account, key: string, lastEventId?: number) {
  const controller = new AbortController();
  try {
    const response = await fetch(url + '/events/stream?ticket=' + key, {
      headers: {
        Cookie: user.cookie,
        ...(lastEventId === undefined
          ? {}
          : { 'Last-Event-ID': String(lastEventId) }),
      },
      signal: controller.signal,
    });
    const reader = response
      .body!.pipeThrough(new TextDecoderStream())
      .getReader();
    let buffer = '';
    return {
      response,
      close: () => controller.abort(),
      async next() {
        while (!buffer.includes('\n\n')) {
          const result = await reader.read();
          if (result.done) throw new Error('Stream ended');
          buffer += result.value;
        }
        const split = buffer.indexOf('\n\n');
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        return frame;
      },
    };
  } catch (error) {
    controller.abort();
    throw error;
  }
}

beforeEach(async () => {
  await resetDb();
  siteId = (await db.site.create({ data: { name: 'الموقع الأول' } })).id;
  elsewhere = (await db.site.create({ data: { name: 'الموقع الثاني' } })).id;
  categoryId = (
    await db.catalogNode.create({
      data: {
        name: 'تشطيبات',
        path: '/1/',
        depth: 0,
        sortOrder: 0,
        codePrefix: 'FIN',
        iconKey: 'zap',
      },
    })
  ).id;
  nodeId = (
    await db.catalogNode.create({
      data: {
        name: 'أرضيات',
        parentId: categoryId,
        path: '/1/2/',
        depth: 1,
        sortOrder: 0,
      },
    })
  ).id;
  unitId = (await db.unit.create({ data: { name: 'متر' } })).id;
  creator = await account('live-writer', ['requests.create']);
  approver = await account('live-decider', ['requests.approve']);
  foreign = await account('live-elsewhere', ['requests.approve'], elsewhere);
  reader = await account('live-reader', ['requests.view']);
  denied = await account('live-ungranted', []);
});
afterAll(async () => {
  server.closeAllConnections();
  const closed = once(server, 'close');
  server.close();
  await closed;
  await db.$disconnect();
});

async function draft() {
  const row = (
    await post(creator, '/requests', { siteId, categoryId }).expect(201)
  ).body;
  return (
    await api
      .patch(root + '/requests/' + row.id + '/draft')
      .set('Cookie', creator.cookie)
      .set('Origin', env.PUBLIC_ORIGIN)
      .send({
        version: row.version,
        items: [
          { nodeId, unitId, otherName: 'اختبار', quantity: '2', specs: '' },
        ],
      })
      .expect(200)
  ).body as { id: number; version: number };
}
const submit = (row: { id: number; version: number }) =>
  post(creator, '/requests/' + row.id + '/submit', { version: row.version });

it('requires a session and validates, binds, expires and consumes tickets exactly once', async () => {
  await api
    .post(root + '/events/ticket')
    .set('Origin', env.PUBLIC_ORIGIN)
    .send({})
    .expect(401);
  await get(approver, '/events/stream?ticket=bad').expect(422);
  const key = await ticket(approver);
  await get(foreign, '/events/stream?ticket=' + key).expect(401);
  await get(approver, '/events/stream?ticket=' + key)
    .set('Last-Event-ID', 'bad')
    .expect(422);
  const live = await stream(approver, key);
  try {
    expect(live.response.headers.get('x-accel-buffering')).toBe('no');
    expect(await live.next()).toContain('event: ready');
    await get(approver, '/events/stream?ticket=' + key).expect(401);
  } finally {
    live.close();
  }
  const expired = await ticket(approver);
  now = new Date(+now + 30_000);
  await get(approver, '/events/stream?ticket=' + expired).expect(401);
});

it('publishes a committed submit, replays only the viewer’s notifications and supports read actions', async () => {
  const row = await draft();
  const live = await stream(approver, await ticket(approver));
  try {
    expect(await live.next()).toContain('event: ready');
    await submit(row).expect(200);
    const notice = await db.notification.findFirstOrThrow({
      where: { requestId: row.id, userId: approver.id },
    });
    const frames = [await live.next(), await live.next()];
    expect(frames).toContain(
      `id: ${notice.id}\nevent: notification\ndata: {"id":${notice.id},"requestId":${row.id},"type":"SUBMITTED"}`,
    );
    expect(frames).toContain(
      `event: request.changed\ndata: {"requestId":${row.id}}`,
    );
    expect(
      (await get(approver, '/notifications').expect(200)).body,
    ).toMatchObject({
      unread: 1,
      pageSize: 30,
      items: [{ id: notice.id, requestId: row.id, readAt: null }],
    });
    expect(
      (await get(creator, '/notifications').expect(200)).body.items,
    ).toEqual([]);
    await get(denied, '/notifications').expect(403);
    await get(approver, '/notifications?page=0').expect(422);
    await post(foreign, '/notifications/' + notice.id + '/read').expect(404);
    await post(approver, '/notifications/' + notice.id + '/read').expect(200);
    expect(await live.next()).toContain('event: notifications.read');
    const read = (await get(approver, '/notifications').expect(200)).body;
    expect(read.unread).toBe(0);
    expect(read.items[0].readAt).not.toBeNull();
    expect(
      (
        await post(approver, '/notifications/' + notice.id + '/read').expect(
          200,
        )
      ).body.count,
    ).toBe(0);

    const another = await draft();
    await submit(another).expect(200);
    const newer = await db.notification.findFirstOrThrow({
      where: { requestId: another.id, userId: approver.id },
    });
    const replay = await stream(approver, await ticket(approver), notice.id);
    try {
      expect(await replay.next()).toContain('event: ready');
      expect(await replay.next()).toBe(
        `id: ${newer.id}\nevent: notification\ndata: {"id":${newer.id},"requestId":${another.id},"type":"SUBMITTED"}`,
      );
    } finally {
      replay.close();
    }
    expect(
      (await get(approver, '/notifications').expect(200)).body.items.map(
        (item: { id: number }) => item.id,
      ),
    ).toEqual([newer.id, notice.id]);
    expect(
      (await post(approver, '/notifications/read-all').expect(200)).body.count,
    ).toBe(1);
    expect(
      (await get(approver, '/notifications').expect(200)).body.unread,
    ).toBe(0);

    await db.notification.update({
      where: { id: notice.id },
      data: { createdAt: new Date(+now - 91 * 86_400_000) },
    });
    expect((await purgeNotifications(db, now)).count).toBe(1);
    expect((await purgeNotifications(db, now)).count).toBe(0);
  } finally {
    live.close();
  }
});

it('publishes nothing when the submit rolls back after notification insertion', async () => {
  const row = await draft();
  const signals: LiveSignal[] = [];
  const stop = bus.subscribe((signal) => signals.push(signal));
  await db.$executeRaw(Prisma.sql`
    CREATE FUNCTION p14_abort_submit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test rollback'; END;
    $$
  `);
  try {
    await db.$executeRaw(Prisma.sql`
      CREATE TRIGGER p14_abort_submit BEFORE INSERT ON "AuditLog" FOR EACH ROW
      WHEN (NEW.action = 'request.submit') EXECUTE FUNCTION p14_abort_submit()
    `);
    await submit(row).expect(500);
    expect(await db.notification.count({ where: { requestId: row.id } })).toBe(
      0,
    );
    expect(
      await db.requestEvent.count({
        where: { requestId: row.id, type: 'SUBMITTED' },
      }),
    ).toBe(0);
    expect(
      (await db.request.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe('DRAFT');
    expect(signals).toEqual([]);
  } finally {
    stop();
    await db.$executeRaw(Prisma.sql`DROP FUNCTION p14_abort_submit() CASCADE`);
  }
});

it('queries only permitted queues and sorts urgency before time in stage', async () => {
  const normal = await draft();
  await submit(normal).expect(200);
  const older = await draft();
  await submit(older).expect(200);
  await draft();
  await db.request.update({
    where: { id: older.id },
    data: { urgency: 'URGENT' },
  });
  const recent = await draft();
  await submit(recent).expect(200);
  await db.request.update({
    where: { id: recent.id },
    data: { urgency: 'URGENT', stageStartedAt: new Date(+now + 1_000) },
  });
  const foreignDraft = await db.request.create({
    data: {
      siteId: elsewhere,
      categoryId,
      createdById: creator.id,
      version: 0,
      stageStartedAt: now,
      status: 'AWAITING_MANAGER',
      displayedStage: 'AWAITING_MANAGER',
      urgency: 'VERY_URGENT',
      isModified: false,
      urgencyLocked: false,
    },
  });
  expect((await get(approver, '/inbox').expect(200)).body.queues).toMatchObject(
    [
      {
        id: 'manager',
        count: 3,
        items: [{ id: older.id }, { id: recent.id }, { id: normal.id }],
      },
    ],
  );
  expect((await get(foreign, '/inbox').expect(200)).body.queues).toMatchObject([
    { id: 'manager', count: 1, items: [{ id: foreignDraft.id }] },
  ]);
  expect((await get(creator, '/inbox').expect(200)).body.queues).toMatchObject([
    { id: 'drafts', count: 1 },
  ]);
  expect((await get(reader, '/inbox').expect(200)).body.queues).toEqual([]);
  expect((await get(denied, '/inbox').expect(200)).body.queues).toEqual([]);
  await api.get(root + '/inbox').expect(401);
});

it('sends a 25 second heartbeat and omits request signals outside scope or permission', async () => {
  const live = await stream(foreign, await ticket(foreign));
  const ungranted = await stream(denied, await ticket(denied));
  try {
    expect(live.response.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    expect(live.response.headers.get('cache-control')).toBe(
      'no-cache, no-store, no-transform',
    );
    expect(live.response.headers.get('x-accel-buffering')).toBe('no');
    expect(live.response.headers.has('content-encoding')).toBe(false);
    expect(await live.next()).toContain('event: ready');
    expect(await ungranted.next()).toContain('event: ready');
    bus.publish({ type: 'request.changed', requestId: 123, siteId });
    bus.publish({ type: 'request.changed', requestId: 456, siteId: elsewhere });
    expect(await live.next()).toBe(
      'event: request.changed\ndata: {"requestId":456}',
    );
    const start = Date.now();
    expect(await live.next()).toBe(': heartbeat');
    expect(await ungranted.next()).toBe(': heartbeat');
    expect(Date.now() - start).toBeGreaterThan(24_000);
  } finally {
    live.close();
    ungranted.close();
  }
}, 32_000);
