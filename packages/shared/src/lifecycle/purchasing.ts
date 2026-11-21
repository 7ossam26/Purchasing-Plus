import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { id } from '../access.js';

import {
  action,
  command,
  finish,
  refuse,
  unique,
  type Context,
} from './engine.js';
import {
  amount,
  outstanding,
  quantity,
  sumAmounts,
  unitPrice,
  validReceiptQuantity,
  type ItemState,
  type PricingRound,
  type RequestItem,
  type RequestState,
  type RoundLine,
} from './model.js';

const pricingStages = ['AT_PURCHASING', 'FULFILMENT'] as const;
const fulfilment = ['FULFILMENT'] as const;
const hasItems =
  (...states: ItemState[]) =>
  (s: RequestState) =>
    s.items.some((i) => states.includes(i.state))
      ? undefined
      : 'WRONG_ITEM_STATE';
function target(s: RequestState, id: number, ...states: ItemState[]) {
  const item = s.items.find((i) => i.id === id) ?? refuse('ITEM_NOT_FOUND');
  if (!states.includes(item.state)) refuse('WRONG_ITEM_STATE');
  return item;
}
const note = z.string().trim().optional();
const line = command({ itemId: id, note });
const pricing = { key: 'purchasing.price', statuses: pricingStages } as const;
const remaining = {
  key: 'purchasing.handleRemaining',
  statuses: fulfilment,
  ready: hasItems('REMAINING'),
} as const;
const price = { supplierId: id, lineTotal: quantity };
const rfq = { key: 'purchasing.sendRfq', statuses: ['AT_PURCHASING'] } as const;
const pendingRfq = {
  ...rfq,
  ready: (state: RequestState) =>
    state.batches.some(
      (batch) => batch.supplierIds.length > batch.sentTo.length,
    )
      ? undefined
      : 'NO_PENDING_SEND',
} as const;

function pendingBatch(
  state: RequestState,
  batchId: number,
  supplierId: number,
) {
  const batch = state.batches.find((batch) => batch.id === batchId);
  if (
    !batch ||
    !batch.supplierIds.includes(supplierId) ||
    batch.sentTo.includes(supplierId)
  )
    refuse('NO_PENDING_SEND');
  return batch;
}

export function wasBatchSent(
  state: RequestState,
  batchId: number,
  supplierId: number,
) {
  return state.batches.some(
    (batch) => batch.id === batchId && batch.sentTo.includes(supplierId),
  );
}
export const createBatch = action(
  command({
    batchId: id,
    itemIds: z.array(id).min(1),
    supplierIds: z.array(id).min(1),
  }),
  {
    ...rfq,
    ready: hasItems('OPEN', 'UNAVAILABLE'),
  },
  (ctx, i) => {
    unique(i.itemIds);
    unique(i.supplierIds);
    if (ctx.state.batches.some((b) => b.id === i.batchId)) refuse('DUPLICATE');
    const lineNos = i.itemIds.map(
      (id) => target(ctx.state, id, 'OPEN', 'UNAVAILABLE').lineNo,
    );
    ctx.state.batches.push({
      id: i.batchId,
      itemIds: i.itemIds,
      supplierIds: i.supplierIds,
      sentTo: [],
    });
    ctx.emit(
      'BATCH_CREATED',
      { batchId: i.batchId, lineNos, supplierIds: i.supplierIds },
      i.itemIds,
    );
  },
);
export const markBatchSent = action(
  command({ batchId: id, supplierId: id }),
  pendingRfq,
  (ctx, i) => {
    const batch = pendingBatch(ctx.state, i.batchId, i.supplierId);
    batch.sentTo.push(i.supplierId);
    ctx.emit(
      'BATCH_SENT_MARKED',
      { batchId: batch.id, supplierId: i.supplierId },
      batch.itemIds,
    );
  },
);
export const editBatchMessage = action(
  command({ batchId: id, supplierId: id, message: z.string().trim().min(1) }),
  pendingRfq,
  (ctx, input) => {
    pendingBatch(ctx.state, input.batchId, input.supplierId);
  },
);
function checkCatalogUnitPrice(
  item: RequestItem,
  total: string,
  units: string,
) {
  if (
    item.catalogItemId !== null &&
    !amount.safeParse(unitPrice(total, units)).success
  )
    refuse('UNIT_PRICE_TOO_LARGE');
}
function setDraft(
  item: RequestItem,
  supplierId: number | null,
  total: string | null,
) {
  if (total !== null) checkCatalogUnitPrice(item, total, item.quantity);
  item.supplierId = supplierId;
  item.lineTotal = total;
  item.pricedQuantity = total === null ? null : item.quantity;
  if (supplierId !== null && total !== null) item.needsRepricing = false;
}
export const savePricingDraft = action(
  command({
    itemId: id,
    supplierId: id.nullable(),
    lineTotal: quantity.nullable(),
  }),
  { ...pricing, ready: hasItems('OPEN') },
  (ctx, i) =>
    setDraft(target(ctx.state, i.itemId, 'OPEN'), i.supplierId, i.lineTotal),
);
export const markUnavailable = action(
  line,
  { ...pricing, ready: hasItems('OPEN') },
  (ctx, i) => {
    const item = target(ctx.state, i.itemId, 'OPEN');
    setDraft(item, null, null);
    item.unavailableNote = i.note ?? null;
    item.state = 'UNAVAILABLE';
    item.needsRepricing = false;
    ctx.emit(
      'ITEM_UNAVAILABLE',
      { lineNo: item.lineNo, note: item.unavailableNote },
      [item.id],
    );
  },
);
function availableAgain(ctx: Context, item: RequestItem, note: string | null) {
  item.state = 'OPEN';
  item.unavailableNote = null;
  ctx.emit('ITEM_AVAILABLE_AGAIN', { lineNo: item.lineNo, note }, [item.id]);
}
export const markAvailable = action(
  line,
  { ...pricing, statuses: ['AT_PURCHASING'], ready: hasItems('UNAVAILABLE') },
  (ctx, i) =>
    availableAgain(
      ctx,
      target(ctx.state, i.itemId, 'UNAVAILABLE'),
      i.note ?? null,
    ),
);
export const priceUnavailable = action(
  command({ itemId: id, ...price }),
  { ...pricing, statuses: fulfilment, ready: hasItems('UNAVAILABLE') },
  (ctx, i) => {
    const item = target(ctx.state, i.itemId, 'UNAVAILABLE');
    availableAgain(ctx, item, null);
    setDraft(item, i.supplierId, i.lineTotal);
  },
);
export function pricingDraftAction(
  state: RequestState,
  itemId: number,
  hasPrice: boolean,
) {
  return hasPrice &&
    state.status === 'FULFILMENT' &&
    state.items.some(
      (item) => item.id === itemId && item.state === 'UNAVAILABLE',
    )
    ? 'priceUnavailable'
    : 'savePricingDraft';
}
export const isPricingCandidate = (i: RequestItem) =>
  i.state === 'OPEN' && i.supplierId !== null && i.lineTotal !== null;
function pricingReady(s: RequestState) {
  if (s.items.some((i) => i.state === 'OPEN' && i.needsRepricing))
    return 'NEEDS_REPRICING';
  return s.items.some(isPricingCandidate) ? undefined : 'NO_PRICED_ITEMS';
}
const priceLine = (item: RequestItem): RoundLine => ({
  itemId: item.id,
  lineNo: item.lineNo,
  catalogItemId: item.catalogItemId,
  supplierId: item.supplierId!,
  lineTotal: item.lineTotal!,
  quantity: item.pricedQuantity ?? item.quantity,
});
export const submitPricing = action(
  command({}),
  { ...pricing, ready: pricingReady, hint: 'primary' },
  (ctx) => {
    const s = ctx.state,
      items = s.items.filter(isPricingCandidate);
    const lines = items.map(priceLine);
    const roundNo = (s.rounds.at(-1)?.number ?? 0) + 1;
    s.rounds.push({
      number: roundNo,
      lines,
      status: 'PENDING',
      decidedAt: null,
      decidedById: null,
    });
    items.forEach((i) => {
      i.state = 'AWAITING_APPROVAL';
    });
    s.status = 'FULFILMENT';
    const roundTotal = sumAmounts(lines.map((line) => line.lineTotal));
    ctx.emit(
      'PRICING_SUBMITTED',
      { roundNo, items: lines, roundTotal, deliveryFee: s.deliveryFee },
      items.map((i) => i.id),
    );
  },
);
const pending = (s: RequestState) =>
  s.rounds.some((r) => r.status === 'PENDING')
    ? undefined
    : 'ROUND_NOT_PENDING';
function decide(ctx: Context, no: number, status: 'APPROVED' | 'REJECTED') {
  const r =
    ctx.state.rounds.find((r) => r.number === no && r.status === 'PENDING') ??
    refuse('ROUND_NOT_PENDING');
  for (const line of r.lines)
    target(ctx.state, line.itemId, 'AWAITING_APPROVAL').state =
      status === 'APPROVED' ? 'AWAITING_RECEIPT' : 'REJECTED';
  Object.assign(r, { status, decidedAt: ctx.now, decidedById: ctx.actorId });
  return r.lines;
}
function recordPrice(
  ctx: Context,
  line: RoundLine,
  source: 'APPROVED' | 'REPRICED',
) {
  if (line.catalogItemId !== null)
    ctx.result.priceRecords.push({
      requestItemId: line.itemId,
      source,
      catalogItemId: line.catalogItemId,
      supplierId: line.supplierId,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
      unitPrice: unitPrice(line.lineTotal, line.quantity),
    });
}
function createOrders(s: RequestState, lines: RoundLine[]) {
  for (const supplierId of new Set(lines.map((l) => l.supplierId))) {
    s.supplyOrders.push({
      number: (s.supplyOrders.at(-1)?.number ?? 0) + 1,
      supplierId,
      lines: lines.filter((l) => l.supplierId === supplierId),
      sent: false,
    });
  }
}
export const approvePricing = action(
  command({ roundNo: id }),
  {
    key: 'pricing.approve',
    statuses: fulfilment,
    ready: pending,
    hint: 'primary',
  },
  (ctx, i) => {
    const lines = decide(ctx, i.roundNo, 'APPROVED');
    lines.forEach((l) => recordPrice(ctx, l, 'APPROVED'));
    createOrders(ctx.state, lines);
    ctx.emit(
      'PRICING_APPROVED',
      { roundNo: i.roundNo },
      lines.map((l) => l.itemId),
    );
  },
);
export const rejectPricing = action(
  command({ roundNo: id, reason: z.string().trim().min(1) }),
  {
    key: 'pricing.reject',
    statuses: fulfilment,
    ready: pending,
    hint: 'danger',
  },
  (ctx, i) => {
    const lines = decide(ctx, i.roundNo, 'REJECTED');
    ctx.emit(
      'PRICING_REJECTED',
      { roundNo: i.roundNo, reason: i.reason },
      lines.map((l) => l.itemId),
    );
    if (rejectingRoundEndsRequest(i.roundNo, ctx.state.rounds))
      finish(ctx, 'REJECTED');
  },
);
export function rejectingRoundEndsRequest(
  roundNo: number,
  rounds: ReadonlyArray<Pick<PricingRound, 'status'>>,
) {
  return roundNo === 1 && !rounds.some((round) => round.status === 'APPROVED');
}
const pendingOrderRules = {
  key: 'purchasing.sendSupplyOrder',
  statuses: fulfilment,
  ready: (s: RequestState) =>
    s.supplyOrders.some((o) => !o.sent) ? undefined : 'NO_PENDING_SEND',
} as const;
export function wasSupplyOrderSent(state: RequestState, number: number) {
  return state.supplyOrders.some(
    (order) => order.number === number && order.sent,
  );
}
function pendingOrder(state: RequestState, number: number) {
  return (
    state.supplyOrders.find((o) => o.number === number && !o.sent) ??
    refuse('NO_PENDING_SEND')
  );
}
export const editSupplyOrderMessage = action(
  command({ orderNo: id, message: z.string().trim().min(1) }),
  pendingOrderRules,
  (ctx, i) => {
    pendingOrder(ctx.state, i.orderNo);
  },
);
export const markSupplyOrderSent = action(
  command({ orderNo: id }),
  pendingOrderRules,
  (ctx, i) => {
    const order = pendingOrder(ctx.state, i.orderNo);
    order.sent = true;
    ctx.emit(
      'SUPPLY_ORDER_SENT_MARKED',
      {
        orderNo: order.number,
        supplierId: order.supplierId,
        lineNos: order.lines.map((l) => l.lineNo),
      },
      order.lines.map((l) => l.itemId),
    );
  },
);
export const recordReceipt = action(
  command({
    lines: z.array(z.strictObject({ itemId: id, quantity, note })).min(1),
    note,
  }),
  {
    key: 'receipt.record',
    statuses: fulfilment,
    ready: hasItems('AWAITING_RECEIPT'),
    hint: 'primary',
  },
  (ctx, i) => {
    unique(i.lines.map((l) => l.itemId));
    const lines = i.lines.map((l) => {
      const item = target(ctx.state, l.itemId, 'AWAITING_RECEIPT');
      if (!validReceiptQuantity(l.quantity, outstanding(item)))
        refuse('INVALID_QUANTITY');
      item.receivedQty = new Decimal(item.receivedQty)
        .plus(l.quantity)
        .toFixed(2);
      const left = outstanding(item);
      item.state = left === '0.00' ? 'RECEIVED' : 'REMAINING';
      return {
        itemId: item.id,
        lineNo: item.lineNo,
        quantity: l.quantity,
        outstanding: left,
        ...(l.note === undefined ? {} : { note: l.note }),
      };
    });
    ctx.emit(
      'RECEIPT_RECORDED',
      { lines, note: i.note ?? null },
      lines.map((l) => l.itemId),
    );
  },
);
export const stillComing = action(
  command({ itemId: id }),
  remaining,
  (ctx, i) => {
    const item = target(ctx.state, i.itemId, 'REMAINING');
    item.state = 'AWAITING_RECEIPT';
    ctx.emit('ITEM_STILL_COMING', { lineNo: item.lineNo }, [item.id]);
  },
);
export const repriceRemaining = action(
  command({ itemId: id, ...price }),
  remaining,
  (ctx, i) => {
    const item = target(ctx.state, i.itemId, 'REMAINING'),
      previousSupplierId = item.supplierId!;
    item.pricedQuantity = outstanding(item);
    checkCatalogUnitPrice(item, i.lineTotal, item.pricedQuantity);
    item.supplierId = i.supplierId;
    item.lineTotal = i.lineTotal;
    item.state = 'AWAITING_RECEIPT';
    const line = priceLine(item);
    recordPrice(ctx, line, 'REPRICED');
    if (previousSupplierId !== i.supplierId) createOrders(ctx.state, [line]);
    ctx.emit('ITEM_REPRICED', { ...line, previousSupplierId }, [item.id]);
  },
);
export const resolveExternally = action(
  line,
  {
    key: 'items.resolveExternally',
    statuses: pricingStages,
    ready: hasItems('UNAVAILABLE', 'REMAINING'),
  },
  (ctx, i) => {
    const item = target(ctx.state, i.itemId, 'UNAVAILABLE', 'REMAINING');
    item.state = 'RESOLVED_EXTERNALLY';
    ctx.emit(
      'ITEM_RESOLVED_EXTERNALLY',
      { lineNo: item.lineNo, note: i.note ?? null },
      [item.id],
    );
    if (ctx.state.status === 'AT_PURCHASING') finish(ctx);
  },
);
