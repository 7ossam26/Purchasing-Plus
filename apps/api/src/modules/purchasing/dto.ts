import {
  buildWhatsAppUrl,
  formatEgyptianMobile,
} from '@purchasing-plus/shared';
import {
  isPricingCandidate,
  sumAmounts,
} from '@purchasing-plus/shared/lifecycle';

import { allowed, type Viewer } from '../../middleware/access.js';
import { toRequestDto } from '../requests/dto.js';
import { toState, type RequestRecord } from '../requests/repo.js';

import { type activeSuppliers, type BatchRecord } from './repo.js';

type Supplier = Awaited<ReturnType<typeof activeSuppliers>>[number];
function supplierDto(supplier: Supplier) {
  return {
    ...supplier,
    whatsappDisplay: formatEgyptianMobile(supplier.whatsappNumber),
  };
}
export function toBatchDto(batch: BatchRecord, viewer: Viewer) {
  const names = allowed(viewer, 'requests.viewSupplierNames');
  const canSend = names && allowed(viewer, 'purchasing.sendRfq');
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    createdById: batch.createdById,
    itemIds: batch.items.map((item) => item.itemId),
    ...(canSend ? { message: batch.message } : {}),
    ...(names
      ? {
          suppliers: batch.suppliers.map((row) => ({
            supplierId: row.supplierId,
            supplier: supplierDto(row.supplier),
            sentAt: row.sentAt,
            sentById: row.sentById,
            ...(canSend ? { message: row.message, ...whatsapp(row) } : {}),
          })),
        }
      : {}),
  };
}
function whatsapp(row: BatchRecord['suppliers'][number]) {
  const { url, tooLong } = buildWhatsAppUrl(
    row.supplier.whatsappNumber,
    row.message,
  );
  return { waUrl: url, tooLong };
}

export function toPurchasingDto(
  row: RequestRecord,
  batches: BatchRecord[],
  suppliers: Supplier[],
  selection: number[],
  viewer: Viewer,
) {
  const request = toRequestDto(row, viewer);
  const state = toState(row);
  const names = allowed(viewer, 'requests.viewSupplierNames');
  const prices = allowed(viewer, 'requests.viewPrices');
  const histories = new Map<
    number,
    {
      batchId: number;
      supplierId: number;
      supplierName: string;
      sentAt: Date;
    }[]
  >();
  const selectedSet = new Set(selection);
  const selectedReceived = new Map<number, Set<number>>();
  if (names) {
    for (const batch of batches) {
      for (const supplier of batch.suppliers) {
        if (!supplier.sentAt) continue;
        const entry = {
          batchId: batch.id,
          supplierId: supplier.supplierId,
          supplierName: supplier.supplier.name,
          sentAt: supplier.sentAt,
        };
        const received =
          selectedReceived.get(supplier.supplierId) ?? new Set<number>();
        for (const item of batch.items) {
          const history = histories.get(item.itemId) ?? [];
          history.push(entry);
          histories.set(item.itemId, history);
          if (selectedSet.has(item.itemId)) received.add(item.itemId);
        }
        selectedReceived.set(supplier.supplierId, received);
      }
    }
  }
  const priced = state.items.filter(isPricingCandidate);
  return {
    ...request,
    items: request.items.map((item) => {
      const sentTo = histories.get(item.id) ?? [];
      return names
        ? {
            ...item,
            sentTo: sentTo.sort((a, b) => +b.sentAt - +a.sentAt),
            sentSupplierCount: new Set(sentTo.map((entry) => entry.supplierId))
              .size,
          }
        : item;
    }),
    batches: batches.map((batch) => toBatchDto(batch, viewer)),
    ...(names
      ? {
          suppliers: suppliers.map((supplier) => ({
            ...supplierDto(supplier),
            alreadyReceivedCount: selectedReceived.get(supplier.id)?.size ?? 0,
          })),
        }
      : {}),
    ...(prices
      ? {
          pricing: {
            pricedCount: priced.length,
            unavailableCount: request.stateCounts.UNAVAILABLE,
            needsRepricingItemIds: state.items
              .filter((item) => item.state === 'OPEN' && item.needsRepricing)
              .map((item) => item.id),
            pendingTotal: sumAmounts(priced.map((item) => item.lineTotal!)),
            total: sumAmounts(
              request.items.flatMap((item) =>
                item.lineTotal === undefined || item.lineTotal === null
                  ? []
                  : [item.lineTotal],
              ),
            ),
          },
        }
      : {}),
  };
}
