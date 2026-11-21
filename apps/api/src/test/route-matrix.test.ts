import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import {
  registry,
  type PermissionKey,
} from '@purchasing-plus/shared/permissions';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { parseEnv } from '../config/env.js';
import { cookie, digest } from '../middleware/access.js';

import { resetDb, testDatabaseUrl } from './db.js';
import { makeUser } from './factories.js';
import { publicRoutes, routeManifest } from './route-manifest.js';

const env = parseEnv(process.env);
const app = createApp({ databaseUrl: testDatabaseUrl(), env });
const db: PrismaClient = app.locals.db;
const api = request(app);
const keys = registry.filter((p) => !p.superadminOnly).map((p) => p.key);
const sessions = new Map<string, string>();
let foreignId: number;

async function sessionWithout(missing: readonly PermissionKey[]) {
  const name = [...missing].sort().join(',');
  if (sessions.has(name)) return sessions.get(name)!;
  const user = await makeUser(db, 'matrix-' + sessions.size, keys, 'ASSIGNED');
  // Exercise independent runtime checks, even for keys normally required by other grants.
  await db.rolePermission.deleteMany({
    where: { roleId: user.roleId!, key: { in: [...missing] } },
  });
  const token = randomBytes(32).toString('hex');
  await db.session.create({
    data: {
      id: digest(env.SESSION_SECRET, token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const header = cookie + '=' + token;
  sessions.set(name, header);
  return header;
}
beforeAll(async () => {
  await resetDb();
  const owner = await makeUser(db, 'foreign-owner', ['requests.create'], 'ALL');
  const site = await db.site.create({ data: { name: 'foreign' } });
  const node = await db.catalogNode.create({
    data: {
      name: 'category',
      sortOrder: 0,
      depth: 0,
      path: '/1/',
      codePrefix: 'MAT',
      iconKey: 'zap',
    },
  });
  foreignId = (
    await db.request.create({
      data: {
        siteId: site.id,
        categoryId: node.id,
        createdById: owner.id,
        version: 1,
        status: 'DRAFT',
        displayedStage: 'DRAFT',
        stageStartedAt: new Date(),
        urgency: 'NORMAL',
        urgencyLocked: false,
        isModified: false,
      },
    })
  ).id;
});
afterAll(() => db.$disconnect());

for (const { method, path, groups } of routeManifest) {
  const url = () =>
    '/api/v1' +
    path
      .replace(':id', String(foreignId))
      .replace(':entity', 'units')
      .replace(':action', 'verify-audit')
      .replace(/:\w+/g, '1');
  for (const missing of groups) {
    it(`${method} ${path} requires ${missing.join(' or ')}`, async () => {
      await api[method](url())
        .set('Origin', env.PUBLIC_ORIGIN)
        .set('Cookie', await sessionWithout(missing))
        .expect(403);
    });
  }
  if (!groups.length)
    it(`${method} ${path} requires a session`, async () => {
      await api[method](url()).set('Origin', env.PUBLIC_ORIGIN).expect(401);
    });
  if (path.startsWith('/requests/:id'))
    it(`${method} ${path} conceals an existing foreign request`, async () => {
      await api[method](url())
        .set('Origin', env.PUBLIC_ORIGIN)
        .set('Cookie', await sessionWithout([]))
        .expect(404);
    });
}

// Express 5 exposes matchers on mounted routers. Walk the actual registrations so a new
// handler cannot silently bypass the manifest. Resolve dynamic mount prefixes literally.
interface Layer {
  slash?: boolean;
  route?: { path: string; methods: Record<string, boolean> };
  handle: { stack?: Layer[] };
  matchers: ((path: string) => false | { path: string })[];
}
it('accounts for every mounted API method and path', () => {
  const expected = new Set([
    ...publicRoutes,
    ...routeManifest.map(
      ({ method, path }) => method + ' /api/v1' + path.split('?')[0],
    ),
  ]);
  const paths = [...expected].map((entry) => entry.split(' ')[1]!);
  const found = new Set<string>();
  function walk(layers: Layer[], prefix: string) {
    for (const layer of layers) {
      if (layer.route) {
        const path = (prefix + layer.route.path).replace(/\/$/, '');
        if (path.startsWith('/api/'))
          for (const method of Object.keys(layer.route.methods))
            found.add(method + ' ' + path);
      } else if (layer.handle.stack) {
        if (layer.slash) {
          walk(layer.handle.stack, prefix);
          continue;
        }
        const mounts = new Set<string>();
        for (const path of paths) {
          if (!path.startsWith(prefix + '/') && path !== prefix) continue;
          const suffix = path.slice(prefix.length) || '/';
          const match = layer.matchers[0]!(suffix);
          if (match) mounts.add(match.path);
        }
        // Dynamic :id routers match static siblings too. The template mount covers those paths.
        const templates = [...mounts].filter((p) => p.includes(':'));
        const choices = templates.length ? templates : [...mounts];
        expect(
          choices.length,
          'unlisted router under ' + prefix,
        ).toBeGreaterThan(0);
        for (const mount of choices)
          walk(layer.handle.stack, prefix + mount.replace(/\/$/, ''));
      }
    }
  }
  walk(app.router.stack as unknown as Layer[], '');
  expect([...found].sort()).toEqual([...expected].sort());
});
