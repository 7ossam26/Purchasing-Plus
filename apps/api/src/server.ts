import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { bootstrap } from './modules/access/seed.js';
import { startNotificationPurge } from './modules/events/service.js';

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
