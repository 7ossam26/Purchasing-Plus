import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import compression from 'compression';
import express from 'express';
import helmet from 'helmet';

import { parseEnv, storageEnvSchema, type AppEnv } from './config/env.js';
import { serveSpa } from './lib/spa.js';
import {
  createStorage,
  imageStorageOrigin,
  LocalStorage,
  mediaPath,
  type StorageDriver,
} from './lib/storage.js';
import { missing, originCheck } from './middleware/access.js';
import { errorHandler } from './middleware/errors.js';
import { accessRoutes } from './modules/access/routes.js';
import { attributes } from './modules/attributes/routes.js';
import { catalog } from './modules/catalog/routes.js';
import { catalogImages } from './modules/catalog-images/routes.js';
import { catalogTree } from './modules/catalog-tree/routes.js';
import { data } from './modules/data/routes.js';
import {
  MemoryEventBus,
  StreamTickets,
  type EventBus,
} from './modules/events/bus.js';
import { events } from './modules/events/routes.js';
import { inbox } from './modules/inbox/routes.js';
import { reports } from './modules/reports/routes.js';
import { requests } from './modules/requests/routes.js';
import { settings } from './modules/settings/routes.js';
import { suppliers } from './modules/suppliers/routes.js';
import { units } from './modules/units/routes.js';

export interface AppOptions {
  databaseUrl: string;
  env?: AppEnv;
  storage?: StorageDriver;
  clock?: () => Date;
  eventBus?: EventBus;
  webRoot?: string;
}

export function createApp({
  databaseUrl,
  env = parseEnv(process.env),
  storage = createStorage(env),
  clock = () => new Date(),
  eventBus = new MemoryEventBus(),
  webRoot,
}: AppOptions) {
  const app = express();
  // Production traffic reaches the private application port through Traefik.
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  app.locals.db = db;
  app.locals.clock = clock;
  app.locals.eventBus = eventBus;
  app.locals.streamTickets = new StreamTickets();

  app.locals.env = env;
  app.locals.storage = storage;
  app.locals.cache = new Map();
  const imageOrigin = imageStorageOrigin(env);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: imageOrigin ? ["'self'", imageOrigin] : ["'self'"],
        },
      },
    }),
  );
  // Compression honors Cache-Control: no-transform on live event streams.
  app.use(compression());
  app.use(originCheck(env.PUBLIC_ORIGIN));
  if (storage instanceof LocalStorage)
    app.get(mediaPath + '/*key', storage.serve);
  app.use(express.json());
  app.use('/api/v1', accessRoutes(), events, inbox, reports);
  app.use('/api/v1/data', data);
  app.use('/api/v1/settings', settings);
  app.use('/api/v1', attributes);
  app.use('/api/v1/catalog', catalogImages, catalog);
  app.use('/api/v1/catalog-tree', catalogTree);
  app.use('/api/v1/suppliers', suppliers);
  app.use('/api/v1/units', units);
  app.use('/api/v1/requests', requests);
  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    const storageStatus = storageEnvSchema.safeParse(env).success
      ? 'ok'
      : 'unavailable';
    let dbStatus = 'ok';
    try {
      await db.$queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      dbStatus = 'unavailable';
    }
    const ok = dbStatus === 'ok' && storageStatus === 'ok';
    response.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'unavailable',
      db: dbStatus,
      storage: storageStatus,
    });
  });
  app.use('/api', (_request, _response, next) => next(missing()));
  if (webRoot) app.use(serveSpa(webRoot));
  app.use(errorHandler);
  return app;
}
