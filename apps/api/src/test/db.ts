import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is required for API tests');
  if (!/\/purchasing_test(?:\?|$)/.test(url)) throw new Error('DATABASE_URL_TEST must point to purchasing_test');
  return url;
}

export async function resetDb(): Promise<void> {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl() }) });
  try {
    await db.$executeRaw(Prisma.sql`
      DO $$
      DECLARE table_row record;
      BEGIN
        FOR table_row IN
          SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        LOOP
          EXECUTE format('TRUNCATE TABLE %I RESTART IDENTITY CASCADE', table_row.tablename);
        END LOOP;
      END $$;
    `);
  } finally {
    await db.$disconnect();
  }
}
