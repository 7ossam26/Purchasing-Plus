import { buildWhatsAppUrl } from '@purchasing-plus/shared';
import {
  eventPayloadSchemas,
  sumAmounts,
} from '@purchasing-plus/shared/lifecycle';

import { allowed, type Viewer } from '../../middleware/access.js';
import type { RequestRecord } from '../requests/repo.js';

type Event = RequestRecord['events'][number];

function actor(event: Event) {
  return {
    id: event.actorId,
    name: event.actorName,
    roleName: event.actorRoleName,
  };
}

export function resolutions(row: RequestRecord) {
  const result = new Map<number, ReturnType<typeof actor>>();
  for (const event of row.events) {
    if (event.type === 'ITEM_RESOLVED_EXTERNALLY')
      for (const id of event.itemIds) result.set(id, actor(event));
  }
  return result;
}

export function roundSummaries(row: RequestRecord, viewer: Viewer) {
  const decisions = new Map<
    number,
    { decidedBy: ReturnType<typeof actor>; reason?: string }
  >();
  for (const event of row.events) {
    if (
      event.type === 'PRICING_APPROVED' ||
      event.type === 'PRICING_REJECTED'
    ) {
      const payload = eventPayloadSchemas[event.type].parse(event.payload);
      decisions.set(payload.roundNo, {
        decidedBy: actor(event),
        ...('reason' in payload && typeof payload.reason === 'string'
          ? { reason: payload.reason }
          : {}),
      });
    }
  }
  return row.rounds.map((round) => ({
    number: round.number,
    status: round.status,
    submittedAt: round.submittedAt,
    decidedAt: round.decidedAt,
    decidedById: round.decidedById,
    decidedBy: null,
    ...decisions.get(round.number),
    itemIds: round.items.map((line) => line.itemId),
    ...(allowed(viewer, 'requests.viewPrices')
      ? {
          roundTotal: sumAmounts(
            round.items.map((line) => line.lineTotal.toFixed(2)),
          ),
          deliveryFee: round.deliveryFee?.toFixed(2) ?? null,
        }
      : {}),
  }));
}

export function toOrdersDto(row: RequestRecord, viewer: Viewer) {
  const names = allowed(viewer, 'requests.viewSupplierNames');
  const canSend = names && allowed(viewer, 'purchasing.sendSupplyOrder');
  return row.supplyOrders.map((order) => {
    const link = canSend
      ? buildWhatsAppUrl(order.supplier.whatsappNumber, order.message)
      : null;
    return {
      id: order.id,
      number: order.number,
      createdAt: order.createdAt,
      sentAt: order.sentAt,
      sentById: order.sentById,
      ...(names
        ? { supplier: { id: order.supplierId, name: order.supplier.name } }
        : {}),
      ...(link
        ? { message: order.message, waUrl: link.url, tooLong: link.tooLong }
        : {}),
      items: order.items.map((line) => ({
        itemId: line.itemId,
        lineNo: line.lineNo,
        quantity: line.quantity.toFixed(2),
        ...(allowed(viewer, 'requests.viewPrices')
          ? { lineTotal: line.lineTotal.toFixed(2) }
          : {}),
      })),
    };
  });
}

export function toReceiptsDto(row: RequestRecord) {
  return row.receipts.map(({ id, recordedAt, recorder, note, lines }) => ({
    id,
    recordedAt,
    recordedBy: recorder,
    note,
    lines: lines.map((line) => ({
      ...line,
      quantity: line.quantity.toFixed(2),
    })),
  }));
}
