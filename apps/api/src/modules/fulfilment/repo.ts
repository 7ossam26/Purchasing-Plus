import type { Prisma } from '@prisma/client';
import { buildSupplierMessage } from '@purchasing-plus/shared';
import type { Transition } from '@purchasing-plus/shared/lifecycle';

import type { Tx } from '../access/repo.js';
import { priceDetails } from '../catalog/prices.js';
import type { RequestRecord } from '../requests/repo.js';
import { readSettings } from '../settings/repo.js';

export const ordersInclude = {
  orderBy: { number: 'asc' },
  include: {
    supplier: { select: { id: true, name: true, whatsappNumber: true } },
    items: { orderBy: { lineNo: 'asc' } },
  },
} satisfies Prisma.Request$supplyOrdersArgs;
export const receiptsInclude = {
  orderBy: { id: 'asc' },
  include: {
    recorder: { select: { id: true, name: true } },
    lines: {
      orderBy: { item: { lineNo: 'asc' } },
      select: { itemId: true, quantity: true, note: true },
    },
  },
} satisfies Prisma.Request$receiptsArgs;

export function roundDetails(tx: Tx, requestId: number, number: number) {
  return tx.pricingRound.findUnique({
    where: { requestId_number: { requestId, number } },
    include: {
      items: {
        orderBy: { lineNo: 'asc' },
        include: {
          supplier: { select: { id: true, name: true } },
          previousPrice: { select: priceDetails },
        },
      },
    },
  });
}
export async function changeMessage(
  tx: Tx,
  requestId: number,
  number: number,
  message: string,
) {
  const where = { requestId_number: { requestId, number } };
  const before = await tx.supplyOrder.findUniqueOrThrow({
    where,
    select: { message: true },
  });
  const order = await tx.supplyOrder.update({
    where,
    data: { message },
    select: { id: true, message: true },
  });
  return { order, before };
}

export async function persistFulfilment(
  tx: Tx,
  row: RequestRecord,
  result: Transition,
  now: Date,
) {
  const { next, priceRecords, events } = result;
  if (priceRecords.length)
    await tx.catalogItemPrice.createMany({
      data: priceRecords.map(
        ({ catalogItemId, requestItemId, supplierId, source, unitPrice }) => ({
          itemId: catalogItemId,
          requestId: row.id,
          requestItemId,
          supplierId,
          source,
          unitPrice,
          createdAt: now,
        }),
      ),
    });
  // The lifecycle appends numbered orders and never removes or reorders earlier ones.
  const added = next.supplyOrders.slice(row.supplyOrders.length);
  if (added.length) {
    const { supplyOrderIntro } = await readSettings(tx);
    const items = new Map(next.items.map((item) => [item.id, item]));
    for (const order of added) {
      const message = buildSupplierMessage(
        supplyOrderIntro,
        {
          requestNumber: next.number!,
          siteName: row.site.name,
          siteAddress: row.site.address,
          categoryName: row.category.name,
        },
        order.lines.map((line) => {
          const item = items.get(line.itemId)!;
          return {
            lineNo: line.lineNo,
            name: item.snapshot.name,
            specs: item.specs,
            quantity: line.quantity,
            unit: item.snapshot.unitName,
          };
        }),
      );
      await tx.supplyOrder.create({
        data: {
          requestId: row.id,
          number: order.number,
          supplierId: order.supplierId,
          createdAt: now,
          message,
          items: {
            createMany: {
              data: order.lines.map(
                ({ itemId, lineNo, catalogItemId, quantity, lineTotal }) => ({
                  itemId,
                  lineNo,
                  catalogItemId,
                  quantity,
                  lineTotal,
                }),
              ),
            },
          },
        },
      });
    }
  }
  for (const event of events) {
    if (event.type === 'SUPPLY_ORDER_SENT_MARKED')
      await tx.supplyOrder.update({
        where: {
          requestId_number: {
            requestId: row.id,
            number: event.payload.orderNo,
          },
        },
        data: { sentAt: now, sentById: event.actorId },
      });
    if (event.type === 'RECEIPT_RECORDED')
      await tx.receipt.create({
        data: {
          requestId: row.id,
          recordedAt: now,
          recordedById: event.actorId!,
          note: event.payload.note,
          lines: {
            createMany: {
              data: event.payload.lines.map(({ itemId, quantity, note }) => ({
                itemId,
                quantity,
                note,
              })),
            },
          },
        },
      });
  }
}
