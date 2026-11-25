import { Prisma } from '@prisma/client';
import type { RequestState } from '@purchasing-plus/shared/lifecycle';

import type { Tx } from '../access/repo.js';

const supplierFields = {
  id: true,
  name: true,
  whatsappNumber: true,
} satisfies Prisma.SupplierSelect;
export function activeSuppliers(
  tx: Tx,
  { categoryId, ids }: { categoryId?: number; ids?: number[] },
) {
  return tx.supplier.findMany({
    where: {
      isActive: true,
      id: ids && { in: ids },
      categories:
        categoryId === undefined ? undefined : { some: { categoryId } },
    },
    select: supplierFields,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}
export async function searchSuppliers(
  tx: Tx,
  page: number,
  pageSize: number,
  q = '',
) {
  const search = q.replace(/[\\%_]/g, '\\$&');
  const where = {
    isActive: true,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { whatsappNumber: { contains: search } },
          ],
        }
      : {}),
  };
  const items = await tx.supplier.findMany({
    where,
    select: supplierFields,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total: await tx.supplier.count({ where }), page, pageSize };
}
export const batchSummary = {
  orderBy: { id: 'asc' },
  select: {
    id: true,
    items: { select: { itemId: true } },
    suppliers: { select: { supplierId: true, sentAt: true } },
  },
} satisfies Prisma.Request$batchesArgs;
export const roundState = {
  orderBy: { number: 'asc' },
  select: {
    number: true,
    status: true,
    decidedAt: true,
    decidedById: true,
    deliveryFee: true,
    submittedAt: true,
    items: {
      orderBy: { lineNo: 'asc' },
      select: {
        itemId: true,
        lineNo: true,
        catalogItemId: true,
        supplierId: true,
        lineTotal: true,
        quantity: true,
      },
    },
  },
} satisfies Prisma.Request$roundsArgs;

const batchDetails = {
  items: { orderBy: { item: { lineNo: 'asc' } }, select: { itemId: true } },
  suppliers: {
    orderBy: { supplierId: 'asc' },
    include: { supplier: { select: supplierFields } },
  },
} satisfies Prisma.RfqBatchInclude;
export type BatchRecord = Prisma.RfqBatchGetPayload<{
  include: typeof batchDetails;
}>;
export function listBatches(tx: Tx, requestId: number) {
  return tx.rfqBatch.findMany({
    where: { requestId },
    include: batchDetails,
    orderBy: { id: 'desc' },
  });
}
export function findBatch(tx: Tx, requestId: number, id: number) {
  return tx.rfqBatch.findUniqueOrThrow({
    where: { id, requestId },
    include: batchDetails,
  });
}
export function addBatch(
  tx: Tx,
  data: {
    id: number;
    requestId: number;
    createdAt: Date;
    createdById: number;
    message: string;
    itemIds: number[];
    supplierIds: number[];
  },
) {
  const { itemIds, supplierIds, ...batch } = data;
  return tx.rfqBatch.create({
    data: {
      ...batch,
      items: { create: itemIds.map((itemId) => ({ itemId })) },
      suppliers: {
        create: supplierIds.map((supplierId) => ({
          supplierId,
          message: batch.message,
        })),
      },
    },
  });
}
export function setSupplierMessage(
  tx: Tx,
  batchId: number,
  supplierId: number,
  message: string,
) {
  return tx.rfqBatchSupplier.update({
    where: { batchId_supplierId: { batchId, supplierId } },
    data: { message },
  });
}
export function setSent(
  tx: Tx,
  batchId: number,
  supplierId: number,
  at: Date,
  userId: number,
) {
  return tx.rfqBatchSupplier.update({
    where: { batchId_supplierId: { batchId, supplierId } },
    data: { sentAt: at, sentById: userId },
  });
}
// Freeze the catalog comparison for a whole round before its own price records are appended.
function freezeComparison(tx: Tx, roundId: number) {
  return tx.$executeRaw(Prisma.sql`
    UPDATE "PricingRoundItem" line SET "previousPriceId" = (
      SELECT price.id FROM "CatalogItemPrice" price
      WHERE price."itemId" = line."catalogItemId"
      ORDER BY price."createdAt" DESC, price.id DESC LIMIT 1
    ) WHERE line."roundId" = ${roundId} AND line."catalogItemId" IS NOT NULL
  `);
}
// `by` is the submitting user. A system transition passes null and never creates a round.
export async function persistRounds(
  tx: Tx,
  before: RequestState,
  after: RequestState,
  by: number | null,
  now: Date,
) {
  const previous = new Map(before.rounds.map((round) => [round.number, round]));
  for (const round of after.rounds) {
    const { number, status, decidedAt, decidedById, lines } = round;
    const former = previous.get(number);
    if (!former) {
      if (by === null) throw new Error('A pricing round needs its submitter');
      const created = await tx.pricingRound.create({
        data: {
          requestId: after.id,
          number,
          status,
          decidedAt,
          decidedById,
          submittedAt: now,
          submittedById: by,
          deliveryFee: after.deliveryFee,
          items: { createMany: { data: lines } },
        },
      });
      // A submitted round is final at once: it records prices in this same transition.
      if (status !== 'PENDING') await freezeComparison(tx, created.id);
    } else if (
      former.status !== status ||
      former.decidedAt !== decidedAt ||
      former.decidedById !== decidedById
    ) {
      const updated = await tx.pricingRound.update({
        where: { requestId_number: { requestId: after.id, number } },
        data: { status, decidedAt, decidedById },
      });
      await freezeComparison(tx, updated.id);
    }
  }
}
