import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { parseEnv } from '../config/env.js';
import {
  describeMigration,
  migrateToDirectReceipt,
} from '../modules/fulfilment/migration.js';

// Runs the same idempotent migration as API startup. Safe to repeat: a second run reports nothing.
let configuring = true;
try {
  const env = parseEnv(process.env);
  configuring = false;
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  });
  try {
    const result = await migrateToDirectReceipt(db, {
      auditSecret: env.AUDIT_HMAC_SECRET,
    });
    process.stdout.write(
      describeMigration(result) ||
        'Direct-receipt migration: nothing left to migrate.\n',
    );
    if (result.skipped.length) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
} catch (error) {
  process.stderr.write(
    `${configuring && error instanceof Error ? error.message : 'Direct-receipt migration failed'}\n`,
  );
  process.exitCode = 1;
}
