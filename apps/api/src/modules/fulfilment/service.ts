import {
  priceChange,
  snapshot,
  unitPrice,
} from '@purchasing-plus/shared/lifecycle';

import { allowed, missing } from '../../middleware/access.js';
import type { Context } from '../access/endpoint.js';
import { toPriceDto } from '../catalog/prices.js';
import { latestPrices } from '../catalog/repo.js';
import { loadRequestInScope } from '../requests/repo.js';
import { runTransition } from '../requests/service.js';

import { roundSummaries, toOrdersDto } from './dto.js';
import * as repo from './repo.js';

export async function getRound(
  ctx: Context,
  id: number,
  readNumber: () => number,
) {
  const { tx, viewer } = ctx;
  const row = await loadRequestInScope(tx, id, viewer);
  const number = readNumber();
  const round = await repo.roundDetails(tx, id, number);
  if (!round) throw missing();
  const prices = allowed(viewer, 'requests.viewPrices');
  const latest = await latestPrices(
    tx,
    prices && round.status === 'PENDING'
      ? round.items.flatMap((line) => line.catalogItemId ?? [])
      : [],
  );
  const summaries = roundSummaries(row, viewer);
  const requestItems = new Map(row.items.map((item) => [item.id, item]));
  return {
    ...summaries.find((summary) => summary.number === number),
    version: row.version,
    // Earlier rounds that reached the site, whether submitted directly or approved historically.
    previousApprovedRounds: summaries.filter(
      (summary) =>
        summary.number < number &&
        (summary.status === 'SUBMITTED' || summary.status === 'APPROVED'),
    ),
    items: round.items.map((line) => {
      const item = requestItems.get(line.itemId)!;
      const previous =
        line.catalogItemId === null
          ? null
          : round.status === 'PENDING'
            ? (latest.get(line.catalogItemId) ?? null)
            : line.previousPrice;
      const quantity = line.quantity.toFixed(2);
      const total = line.lineTotal.toFixed(2);
      const unit = unitPrice(total, quantity);
      return {
        itemId: line.itemId,
        lineNo: line.lineNo,
        catalogItemId: line.catalogItemId,
        snapshot: snapshot.parse(item.snapshot),
        specs: item.specs,
        quantity,
        ...(allowed(viewer, 'requests.viewSupplierNames')
          ? { supplier: line.supplier }
          : {}),
        ...(prices
          ? {
              lineTotal: total,
              unitPrice: unit,
              lastPrice: toPriceDto(previous, viewer),
              priceChange: previous
                ? priceChange(unit, previous.unitPrice.toFixed(2))
                : null,
            }
          : {}),
      };
    }),
  };
}

export async function listOrders(ctx: Context, id: number) {
  const row = await loadRequestInScope(ctx.tx, id, ctx.viewer);
  return { version: row.version, items: toOrdersDto(row, ctx.viewer) };
}
export function editMessage(
  ctx: Context,
  id: number,
  read: () => { version: number; orderNo: number; message: string },
) {
  return runTransition(
    ctx,
    id,
    'editSupplyOrderMessage',
    read,
    (_state, command) => ({
      command,
      persist: async () => {
        const { order, before } = await repo.changeMessage(
          ctx.tx,
          id,
          command.orderNo,
          command.message,
        );
        await ctx.audit(
          'supplyOrder.message',
          'SupplyOrder',
          order.id,
          before,
          { message: order.message },
        );
      },
    }),
  );
}
