import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { bootstrap } from './modules/access/seed.js';
import { startNotificationPurge } from './modules/events/service.js';
import {
  describeMigration,
  migrateToDirectReceipt,
} from './modules/fulfilment/migration.js';

let configuring = true;
try {
  const env = parseEnv(process.env);
  configuring = false;
  const app = createApp({
    databaseUrl: env.DATABASE_URL,
    env,
    webRoot:
      env.NODE_ENV === 'production'
        ? fileURLToPath(new URL('../../web/dist/', import.meta.url))
        : undefined,
  });
  await bootstrap(app.locals.db, env);
  // Idempotent: releases requests left waiting for the removed pricing approval, once.
  const migration = await migrateToDirectReceipt(app.locals.db, {
    auditSecret: env.AUDIT_HMAC_SECRET,
    clock: app.locals.clock,
    eventBus: app.locals.eventBus,
  });
  const summary = describeMigration(migration);
  if (summary) process.stdout.write(summary);
  app.listen(env.PORT, () => {
    startNotificationPurge(app.locals.db, app.locals.clock);
    process.stdout.write(`API listening on ${env.PORT}\n`);
  });
} catch (error) {
  process.stderr.write(
    `${configuring && error instanceof Error ? error.message : 'API startup failed'}\n`,
  );
  process.exitCode = 1;
}
