// Run with a migrated, empty *_perf database and PostgreSQL's auto_explain module.
// DATABASE_URL_PERF=... pnpm --filter api exec tsx src/test/query-plans.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { cairoReportPeriod } from '@purchasing-plus/shared';

import type { Viewer } from '../middleware/access.js';
import { searchItems } from '../modules/catalog/repo.js';
import { firstQueuePage } from '../modules/inbox/repo.js';
import {
  spending,
  suppliers,
  priceHistory,
  unavailable,
  userActivity,
} from '../modules/reports/purchasing-repo.js';
import { readRecords } from '../modules/reports/records-repo.js';
import { fromScope, overview, stageTimes } from '../modules/reports/repo.js';
import { listRequests, queueWhere } from '../modules/requests/repo.js';

const connectionString = process.env.DATABASE_URL_PERF;
if (!connectionString || !new URL(connectionString).pathname.endsWith('_perf'))
  throw new Error('Use an empty *_perf database');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const rollback = new Error('benchmark finished');
try {
  await db.$transaction(
    async (tx) => {
      if (
        (await tx.site.count()) ||
        (await tx.user.count()) ||
        (await tx.catalogNode.count())
      )
        throw new Error('Benchmark requires an empty database');
      const actor = await tx.user.create({
        data: {
          name: 'fixture',
          username: 'fixture',
          role: { create: { name: 'fixture', siteScope: 'ASSIGNED' } },
          passwordHash: 'unused',
        },
      });
      const node = await tx.catalogNode.create({
        data: {
          id: 1,
          name: 'fixture',
          depth: 0,
          path: '/1/',
          sortOrder: 0,
          codePrefix: 'MAT',
          iconKey: 'zap',
        },
      });
      const unit = await tx.unit.create({ data: { name: 'unit' } });
      await tx.$executeRaw(
        Prisma.sql`INSERT INTO "Site"(id,name,"updatedAt") SELECT n,'site-'||n,now() FROM generate_series(1,100) n`,
      );
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "CatalogItem"(id,code,name,description,"searchText","nodeId","unitId","updatedAt")
      SELECT n,'MAT-'||n,'material '||n,'','material mat-'||n,${node.id},${unit.id},now() FROM generate_series(1,10000) n`);
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "Request"(id,number,"siteId","categoryId","createdById","updatedAt","submittedAt",version,status,"displayedStage","stageStartedAt",urgency,"urgencyLocked","isModified")
      SELECT n,'PR-'||n,1+n%100,${node.id},${actor.id},now(),now(),1,
        stage::"RequestStatus",stage::"RequestStage",now()-n*interval '1 minute',
        (CASE WHEN n%7=0 THEN 'URGENT' ELSE 'NORMAL' END)::"RequestUrgency",false,false
      FROM (SELECT n,CASE WHEN n%11=0 THEN 'COMPLETED' WHEN n%3=0 THEN 'AWAITING_MANAGER' ELSE 'AT_PURCHASING' END stage FROM generate_series(1,20000) n) s`);
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "RequestItem"("requestId","lineNo","catalogItemId","nodeId",snapshot,specs,quantity,"unitId",state,"receivedQty","needsRepricing","modifiedAfterSend","pickedAt")
      SELECT 1+(n-1)%20000,1+(n-1)/20000,1+(n-1)%10000,${node.id},'{}'::jsonb,'',1,${unit.id},'OPEN',0,false,false,now() FROM generate_series(1,50000) n`);
      await tx.$executeRaw(Prisma.sql`
      INSERT INTO "RequestEvent"("requestId",type,"actorId",at,"itemIds",payload,"stageAfter")
      SELECT id,'SUBMITTED',${actor.id},now(),ARRAY[]::int[],'{}'::jsonb,'AWAITING_MANAGER' FROM "Request"`);
      const supplier = await tx.supplier.create({
        data: {
          name: 'fixture',
          whatsappNumber: '201001234567',
          notes: '',
          contactPerson: '',
        },
      });
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PricingRound" (id,"requestId",number,status,"submittedAt","submittedById","decidedAt","decidedById")
        SELECT id,id,1,'APPROVED',now(),${actor.id},now(),${actor.id} FROM "Request" WHERE status='COMPLETED'`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PricingRoundItem" ("roundId","itemId","lineNo","catalogItemId","supplierId","lineTotal",quantity)
        SELECT p.id,i.id,i."lineNo",i."catalogItemId",${supplier.id},12,1 FROM "PricingRound" p JOIN "RequestItem" i ON i."requestId"=p."requestId"`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "RequestItem" i SET state='RECEIVED',"receivedQty"=1,"supplierId"=${supplier.id},"lineTotal"=12,"pricedQuantity"=1
        FROM "PricingRoundItem" l WHERE i.id=l."itemId"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "CatalogItemPrice" ("updatedAt","itemId","supplierId","requestId","requestItemId","unitPrice",source)
        SELECT now(),l."catalogItemId",l."supplierId",p."requestId",l."itemId",12,'APPROVED' FROM "PricingRoundItem" l JOIN "PricingRound" p ON p.id=l."roundId"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RequestEvent"("requestId",type,at,"itemIds",payload,"stageAfter")
        SELECT id,'COMPLETED',now()+interval '1 second',ARRAY[]::int[],'{}'::jsonb,'COMPLETED' FROM "Request" WHERE status='COMPLETED'`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RfqBatch"(id,"requestId","createdById",message)
        SELECT id,"requestId",${actor.id},'fixture' FROM "PricingRound"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RfqBatchItem"("batchId","itemId") SELECT "roundId","itemId" FROM "PricingRoundItem"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RfqBatchSupplier"("batchId","supplierId",message,"sentAt","sentById")
        SELECT id,${supplier.id},'fixture',now(),${actor.id} FROM "RfqBatch"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SupplyOrder"(id,"requestId",number,"supplierId",message,"createdAt","sentAt","sentById")
        SELECT id,"requestId",1,${supplier.id},'fixture',now(),now(),${actor.id} FROM "PricingRound"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "SupplyOrderItem"("orderId","itemId","lineNo","catalogItemId",quantity,"lineTotal")
        SELECT "roundId","itemId","lineNo","catalogItemId",quantity,"lineTotal" FROM "PricingRoundItem"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "Receipt"(id,"requestId","recordedAt","recordedById")
        SELECT id,"requestId",now(),${actor.id} FROM "SupplyOrder"`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ReceiptLine"("receiptId","itemId",quantity)
        SELECT "orderId","itemId",quantity FROM "SupplyOrderItem"`);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "RequestItem" i SET state='UNAVAILABLE' FROM "Request" r
        WHERE r.id=i."requestId" AND r.status='AT_PURCHASING' AND i."lineNo"=1 AND r.id%7=0`);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "RequestEvent"("requestId",type,"actorId",at,"itemIds",payload,"stageAfter")
        SELECT "requestId",'ITEM_UNAVAILABLE',${actor.id},now(),ARRAY[id],'{"lineNo":1}'::jsonb,'AT_PURCHASING'
        FROM "RequestItem" WHERE state='UNAVAILABLE'`);
      // Drain the bulk insert's GIN pending list as autovacuum would on a settled catalog.
      await tx.$queryRaw(
        Prisma.sql`SELECT gin_clean_pending_list('"CatalogItem_searchText_idx"'::regclass)`,
      );
      await tx.$executeRaw(Prisma.sql`ANALYZE`);
      await tx.$executeRaw(Prisma.sql`LOAD 'auto_explain'`);
      await tx.$executeRaw(Prisma.sql`SET LOCAL auto_explain.log_analyze = on`);
      await tx.$executeRaw(Prisma.sql`SET LOCAL auto_explain.log_buffers = on`);
      await tx.$executeRaw(
        Prisma.sql`SET LOCAL auto_explain.log_min_duration = 0`,
      );
      const viewer: Viewer = {
        userId: actor.id,
        siteScope: 'ASSIGNED',
        siteIds: [1],
        isSuperadmin: false,
        permissions: new Set(['requests.view', 'requests.approve']),
      };
      const list = await listRequests(tx, viewer, {}, 1, 30);
      const inbox = await firstQueuePage(
        tx,
        viewer,
        queueWhere(viewer, 'manager')!,
      );
      const search = await searchItems(tx, node.path, 'mat-987', 1, 30, false);
      const read = fromScope(tx, viewer, {});
      const now = new Date();
      const period = cairoReportPeriod({}, now);
      await overview(read, period, now, 3);
      await stageTimes(read, period, now);
      await spending(read, period, true);
      await suppliers(read, period, true);
      await priceHistory(read, period, 1100);
      await unavailable(read, period);
      await userActivity(read, period, false);
      for (const log of ['requests', 'approvals', 'receipts'] as const) {
        await readRecords(
          read,
          log,
          { page: 1, pageSize: 30 },
          period,
          true,
          true,
        );
      }
      console.log({
        list: list.total,
        inbox: inbox.count,
        search: search.total,
        plans: 'PostgreSQL server log',
      });
      throw rollback;
    },
    { timeout: 120000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await db.$disconnect();
}
