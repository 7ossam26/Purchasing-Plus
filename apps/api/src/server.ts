import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { bootstrap } from './modules/access/seed.js';

try {
  const env = parseEnv(process.env);
  const app = createApp({ databaseUrl: env.DATABASE_URL, env });
  await bootstrap(app.locals.db, env);
  app.listen(env.PORT, () => {
    process.stdout.write(`API listening on ${env.PORT}\n`);
  });
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
