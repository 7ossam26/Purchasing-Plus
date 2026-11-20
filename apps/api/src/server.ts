import { createApp } from './app.js';
import { parseEnv } from './config/env.js';

try {
  const env = parseEnv(process.env);
  createApp({ databaseUrl: env.DATABASE_URL }).listen(env.PORT, () => {
    process.stdout.write(`API listening on ${env.PORT}\n`);
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
