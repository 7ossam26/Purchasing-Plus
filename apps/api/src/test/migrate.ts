import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { testDatabaseUrl } from './db.js';
export default function migrateTestDatabase() {
  const prisma = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );
  execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
