import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { bootstrap } from './modules/access/seed.js';
import { startNotificationPurge } from './modules/events/service.js';

try {
  const env = parseEnv(process.env);
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
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
