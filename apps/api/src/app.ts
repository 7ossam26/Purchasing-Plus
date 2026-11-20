import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import express from 'express';

import { errorHandler } from './middleware/errors.js';

export interface AppOptions {
  databaseUrl: string;
}

export function createApp({ databaseUrl }: AppOptions) {
  const app = express();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  app.locals.db = db;

  app.use(express.json());
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
