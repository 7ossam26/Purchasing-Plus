import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import express from 'express';
import helmet from 'helmet';

import { parseEnv, type AppEnv } from './config/env.js';
import { originCheck } from './middleware/access.js';
import { errorHandler } from './middleware/errors.js';
import { accessRoutes } from './modules/access/routes.js';
import { attributes } from './modules/attributes/routes.js';
import { catalog } from './modules/catalog/routes.js';
import { catalogTree } from './modules/catalog-tree/routes.js';
import { settings } from './modules/settings/routes.js';
import { suppliers } from './modules/suppliers/routes.js';
import { units } from './modules/units/routes.js';

export interface AppOptions {
  databaseUrl: string;
  env?: AppEnv;
}

export function createApp({
  databaseUrl,
  env = parseEnv(process.env),
}: AppOptions) {
  const app = express();
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  app.locals.db = db;

  app.locals.env = env;
  app.locals.cache = new Map();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          fontSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: [
            "'self'",
            ...(env.STORAGE_PUBLIC_BASE_URL
              ? [new URL(env.STORAGE_PUBLIC_BASE_URL).origin]
              : []),
          ],
        },
      },
    }),
  );
  app.use(originCheck(env.PUBLIC_ORIGIN));
  app.use(express.json());
  app.use('/api/v1', accessRoutes());
  app.use('/api/v1/settings', settings);
  app.use('/api/v1', attributes);
  app.use('/api/v1/catalog', catalog);
  app.use('/api/v1/catalog-tree', catalogTree);
  app.use('/api/v1/suppliers', suppliers);
  app.use('/api/v1/units', units);
  app.get('/api/health', async (_request, response, next) => {
    try {
      await db.$queryRaw(Prisma.sql`SELECT 1`);
      response.json({ status: 'ok', db: 'ok' });
    } catch (error) {
      next(error);
    }
  });
  app.use(errorHandler);
  return app;
}
