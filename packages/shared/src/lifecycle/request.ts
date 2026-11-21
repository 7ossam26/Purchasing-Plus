import { z } from 'zod';

import { id } from '../access.js';
import { cairoYear } from '../formatters.js';

import { editRequest, edits } from './edits.js';
import {
  action,
  autoOutcome,
  command,
  finish,
  openStatuses,
  refuse,
  unique,
} from './engine.js';
import {
  amount,
  draftState,
  inSite,
  isClosed,
  openItem,
  quantity,
  requestStatuses,
  sameDecimal,
  snapshot,
  urgencies,
  type RequestState,
} from './model.js';

const none = command({});
const withReason = command({ reason: z.string().trim().min(1) });
const creator = { key: 'requests.create', owner: true } as const;
const hasItems = (s: RequestState) =>
  s.items.some((i) => i.state !== 'REMOVED') ? undefined : 'ITEMS_REQUIRED';
export const saveDraft = action(
  command(edits),
  { ...creator, statuses: ['DRAFT'] },
  (ctx, input, v) => {
    editRequest(ctx, input, v!);
    if (!ctx.state.version) ctx.emit('CREATED', {});
  },
);
export const deleteDraft = action(
  command({ confirm: z.literal(true) }),
  { ...creator, statuses: ['DRAFT'], hint: 'danger' },
  ({ state }) => {
    state.deleted = true;
  },
);
export const submit = action(
  command({ sequence: z.number().int().min(1).max(99999) }),
  { ...creator, statuses: ['DRAFT'], ready: hasItems, hint: 'primary' },
  (ctx, i) => {
    const year = cairoYear(new Date(ctx.now));
    ctx.state.number = `PR-${year}-${String(i.sequence).padStart(5, '0')}`;
    ctx.state.status = 'AWAITING_MANAGER';
    ctx.emit('SUBMITTED', {});
  },
);
export const editBeforeApproval = action(
  command(edits),
  { ...creator, statuses: ['AWAITING_MANAGER', 'RETURNED'] },
  (ctx, i, v) => editRequest(ctx, i, v!),
);
export const editQuantities = action(
  command({ lines: z.array(z.strictObject({ itemId: id, quantity })).min(1) }),
  {
    key: 'requests.editQuantities',
    statuses: ['AWAITING_MANAGER'],
    ready: hasItems,
  },
  (ctx, i, v) => {
    editRequest(
      ctx,
      {
        change: i.lines.map((l) => ({
          itemId: l.itemId,
          fields: { quantity: l.quantity },
        })),
      },
      v!,
    );
  },
);
export const approve = action(
  none,
  {
    key: 'requests.approve',
    statuses: ['AWAITING_MANAGER'],
    hint: 'primary',
  },
  (ctx) => {
    ctx.state.approvedById = ctx.actorId;
    ctx.state.status = 'AT_PURCHASING';
    ctx.emit('MANAGER_APPROVED', {});
  },
);
export const reject = action(
  withReason,
  { key: 'requests.reject', statuses: ['AWAITING_MANAGER'], hint: 'danger' },
  (ctx, i) => {
    ctx.state.status = 'REJECTED';
    ctx.emit('MANAGER_REJECTED', { reason: i.reason });
  },
);
export const returnForEdit = action(
  withReason,
  { key: 'requests.returnForEdit', statuses: ['AWAITING_MANAGER'] },
  (ctx, i) => {
    ctx.state.status = 'RETURNED';
    ctx.emit('RETURNED_FOR_EDIT', { reason: i.reason });
  },
);
export const resubmit = action(
  none,
  { ...creator, statuses: ['RETURNED'], hint: 'primary' },
  (ctx) => {
    ctx.state.status = 'AWAITING_MANAGER';
    ctx.state.isModified = true;
    ctx.emit('RESUBMITTED', {});
  },
);
export const raiseUrgency = action(
  command({ urgency: z.enum(urgencies) }),
  {
    key: 'requests.raiseUrgency',
    statuses: openStatuses,
    ready: (s) => (s.urgency === 'VERY_URGENT' ? 'MUST_RAISE' : undefined),
  },
  (ctx, i) => {
    const from = ctx.state.urgency;
    if (urgencies.indexOf(i.urgency) <= urgencies.indexOf(from))
      refuse('MUST_RAISE');
    ctx.state.urgency = i.urgency;
    ctx.state.urgencyLocked = true;
    ctx.emit('URGENCY_CHANGED', { from, to: i.urgency, locked: true });
  },
);
function pauseFor(
  key: 'requests.pause' | 'purchasing.returnForEdit',
  event: 'PAUSED' | 'PURCHASING_RETURNED',
) {
  return action(withReason, { key, statuses: ['AT_PURCHASING'] }, (ctx, i) => {
    Object.assign(ctx.state, {
      status: 'PAUSED',
      pausedById: ctx.actorId,
      pausedAt: ctx.now,
      pauseReason: i.reason,
    });
    ctx.emit(event, { reason: i.reason });
  });
}
export const pause = pauseFor('requests.pause', 'PAUSED');
export const purchasingReturnForEdit = pauseFor(
  'purchasing.returnForEdit',
  'PURCHASING_RETURNED',
);
export const editWhilePaused = action(
  command(edits),
  { key: 'requests.editWhilePaused', statuses: ['PAUSED'] },
  (ctx, i, v) => {
    editRequest(ctx, i, v!);
    finish(ctx);
  },
);
export const resume = action(
  none,
  {
    key: 'requests.pause',
    statuses: ['PAUSED'],
    hint: 'primary',
  },
  (ctx) => {
    ctx.state.status = 'AT_PURCHASING';
    ctx.emit('RESUMED', {});
  },
);
export const cancel = action(
  withReason,
  {
    key: 'requests.cancelAnyStage',
    statuses: openStatuses.filter((s) => s !== 'DRAFT'),
    hint: 'danger',
  },
  (ctx, i) => {
    for (const item of ctx.state.items)
      if (!isClosed(item)) item.state = 'CANCELLED';
    ctx.state.status = 'CANCELLED';
    ctx.emit('CANCELLED', { reason: i.reason });
  },
);
export const autoComplete = action(
  none,
  {
    key: 'system',
    statuses: ['AT_PURCHASING', 'PAUSED', 'FULFILMENT'],
    ready: (s) => (autoOutcome(s) ? undefined : 'NOT_CLOSED'),
  },
  (ctx) => finish(ctx),
);
export const editDeliveryFee = action(
  command({ deliveryFee: amount.nullable() }),
  { key: 'purchasing.price', statuses: openStatuses },
  (ctx, i) => {
    const before = ctx.state.deliveryFee,
      after = i.deliveryFee;
    if (sameDecimal(after, before)) refuse('NO_CHANGES');
    ctx.state.deliveryFee = after;
    ctx.emit('DELIVERY_FEE_CHANGED', { before, after });
  },
);

// The caller allocates IDs and supplies an authoritative current catalog lookup for each selected line.
export function copyableItems(
  state: RequestState,
  itemIds?: number[],
  roundNo?: number,
) {
  if (itemIds) unique(itemIds);
  const round =
    roundNo === undefined
      ? undefined
      : state.rounds.find(
          (r) => r.number === roundNo && r.status === 'REJECTED',
        );
  if (roundNo !== undefined && !round) refuse('INVALID_INPUT');
  const selected = state.items.filter(
    (item) =>
      item.state !== 'REMOVED' &&
      (!round || round.lines.some((line) => line.itemId === item.id)) &&
      (!itemIds || (itemIds.includes(item.id) && item.state === 'REJECTED')),
  );
  if (itemIds && (!itemIds.length || selected.length !== itemIds.length))
    refuse('INVALID_INPUT');
  return selected;
}

export const copyRequest = action(
  command({
    newId: id,
    siteId: id.optional(),
    roundNo: id.optional(),
    itemIds: z.array(id).optional(),
    lines: z.array(
      z.strictObject({
        sourceItemId: id,
        newItemId: id,
        current: z
          .strictObject({
            active: z.boolean(),
            nodeId: id,
            unitId: id,
            snapshot,
          })
          .nullable(),
      }),
    ),
  }),
  { key: 'requests.create', statuses: requestStatuses },
  (ctx, i, v) => {
    const s = ctx.state;
    const siteId = i.siteId ?? s.siteId;
    if (!inSite(v!, siteId)) refuse('OUT_OF_SCOPE');
    if (i.newId === s.id) refuse('DUPLICATE');
    const selected = copyableItems(s, i.itemIds, i.roundNo);
    unique(i.lines.map((l) => l.sourceItemId));
    unique(i.lines.map((l) => l.newItemId));
    if (i.lines.length !== selected.length) refuse('INVALID_INPUT');
    const next = draftState({
      id: i.newId,
      siteId,
      categoryId: s.categoryId,
      createdById: v!.userId,
    });
    next.unitOrClient = s.unitOrClient;
    next.copiedFromId = s.id;
    next.version = 1;
    selected.forEach((l, index) => {
      const entry =
        i.lines.find((e) => e.sourceItemId === l.id) ?? refuse('INVALID_INPUT');
      const current = entry.current;
      const catalog = current?.active && l.catalogItemId !== null;
      next.items.push(
        openItem(
          {
            id: entry.newItemId,
            catalogItemId: catalog ? l.catalogItemId : null,
            nodeId: catalog ? current.nodeId : l.nodeId,
            snapshot: catalog ? current.snapshot : l.snapshot,
            quantity: l.quantity,
            specs: l.specs,
            unitId: catalog ? current.unitId : l.unitId,
            otherName: catalog ? null : (l.otherName ?? l.snapshot.name),
          },
          index + 1,
        ),
      );
    });
    ctx.result.copiedDraft = next;
    ctx.emit('COPIED_TO', { requestId: next.id, number: next.number });
    ctx.result.events.push({
      type: 'COPIED_FROM',
      actorId: ctx.actorId,
      requestId: next.id,
      at: ctx.now,
      itemIds: [],
      stageAfter: 'DRAFT',
      payload: { requestId: s.id, number: s.number },
    });
  },
);

export function catalogConversionItem(state: RequestState, itemId: number) {
  const item =
    state.items.find((line) => line.id === itemId) ?? refuse('ITEM_NOT_FOUND');
  if (
    item.state === 'REMOVED' ||
    item.catalogItemId !== null ||
    item.otherName === null
  )
    refuse('WRONG_ITEM_STATE');
  return item;
}

export const addToCatalog = action(
  command({ itemId: id, catalogItemId: id, code: z.string().min(1) }),
  {
    key: 'catalog.create',
    statuses: requestStatuses,
    ready: (s) =>
      s.items.some(
        (i) =>
          i.state !== 'REMOVED' &&
          i.catalogItemId === null &&
          i.otherName !== null,
      )
        ? undefined
        : 'WRONG_ITEM_STATE',
  },
  (ctx, input) => {
    const item = catalogConversionItem(ctx.state, input.itemId);
    item.catalogItemId = input.catalogItemId;
    item.otherName = null;
    ctx.emit('ADDED_TO_CATALOG', { lineNo: item.lineNo, code: input.code }, [
      item.id,
    ]);
  },
);
