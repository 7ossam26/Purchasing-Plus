import { z } from 'zod';

import { id } from '../access.js';
import { formatNumber } from '../formatters.js';
import { ar, timelineUi } from '../i18n/ar.js';

import {
  amount,
  editableRequestFields,
  lineData,
  quantity,
  urgencies,
  type DisplayedStage,
} from './model.js';

const empty = z.strictObject({});
const reason = z.strictObject({ reason: z.string().trim().min(1) });
const note = z.string().nullable();
const itemNote = z.strictObject({ lineNo: id, note });
const pricedLine = z.strictObject({
  itemId: id,
  lineNo: id,
  catalogItemId: id.nullable(),
  supplierId: id,
  lineTotal: amount,
  quantity,
});
const fieldChange = z.strictObject({
  before: z.json(),
  after: z.json(),
});
const diffLine = lineData.extend({ lineNo: id });
export const editDiffSchema = z.strictObject({
  fields: z.array(fieldChange.extend({ field: editableRequestFields.keyof() })),
  added: z.array(diffLine),
  removed: z.array(diffLine),
  changed: z.array(
    z.strictObject({
      itemId: id,
      lineNo: id,
      fields: z.array(
        fieldChange.extend({ field: lineData.omit({ id: true }).keyof() }),
      ),
    }),
  ),
});
export type EditDiff = z.infer<typeof editDiffSchema>;
const link = z.strictObject({ requestId: id, number: z.string().nullable() });
export const eventPayloadSchemas = {
  CREATED: empty,
  SUBMITTED: empty,
  RESUBMITTED: empty,
  EDITED: editDiffSchema,
  URGENCY_CHANGED: z.strictObject({
    from: z.enum(urgencies),
    to: z.enum(urgencies),
    locked: z.boolean(),
  }),
  MANAGER_APPROVED: empty,
  MANAGER_REJECTED: reason,
  RETURNED_FOR_EDIT: reason,
  PAUSED: reason,
  RESUMED: empty,
  PURCHASING_RETURNED: reason,
  BATCH_CREATED: z.strictObject({
    batchId: id,
    lineNos: z.array(id).min(1),
    supplierIds: z.array(id).min(1),
  }),
  BATCH_SENT_MARKED: z.strictObject({ batchId: id, supplierId: id }),
  ITEM_UNAVAILABLE: itemNote,
  ITEM_AVAILABLE_AGAIN: itemNote,
  PRICING_SUBMITTED: z.strictObject({
    roundNo: id,
    items: z.array(pricedLine).min(1),
    roundTotal: z.string().regex(/^\d+\.\d{2}$/),
    deliveryFee: amount.nullable(),
  }),
  DELIVERY_FEE_CHANGED: z.strictObject({
    before: amount.nullable(),
    after: amount.nullable(),
  }),
  PRICING_APPROVED: z.strictObject({ roundNo: id }),
  PRICING_REJECTED: reason.extend({ roundNo: id }),
  SUPPLY_ORDER_SENT_MARKED: z.strictObject({
    orderNo: id,
    supplierId: id,
    lineNos: z.array(id).min(1),
  }),
  RECEIPT_RECORDED: z.strictObject({
    lines: z
      .array(
        z.strictObject({
          itemId: id,
          lineNo: id,
          quantity,
          outstanding: amount,
          note: z.string().optional(),
        }),
      )
      .min(1),
    note,
  }),
  ITEM_STILL_COMING: z.strictObject({ lineNo: id }),
  ITEM_REPRICED: pricedLine.extend({ previousSupplierId: id }),
  ITEM_RESOLVED_EXTERNALLY: itemNote,
  ADDED_TO_CATALOG: z.strictObject({ lineNo: id, code: z.string().min(1) }),
  COPIED_TO: link,
  COPIED_FROM: link,
  CANCELLED: reason,
  COMPLETED: empty,
  REJECTED_AUTO: empty,
} as const;
export type EventType = keyof typeof eventPayloadSchemas;
export type Payload<K extends EventType> = z.infer<
  (typeof eventPayloadSchemas)[K]
>;
export type EventDraft<K extends EventType = EventType> = {
  [T in K]: {
    requestId: number;
    type: T;
    at: string;
    actorId: number | null;
    stageAfter: DisplayedStage;
    itemIds: number[];
    payload: Payload<T>;
  };
}[K];
export function describeEvent(
  event: {
    type: EventType;
    payload: object;
    actorName?: string | null;
    actorRoleName?: string | null;
  },
  batchSupplierCount?: number,
): string {
  const { reason, note, lineNo } = event.payload as {
    reason?: string;
    note?: string | null;
    lineNo?: number;
  };
  const line = lineNo === undefined ? '' : formatNumber(lineNo);
  const batch =
    batchSupplierCount === undefined
      ? undefined
      : batchSupplierCount === 1
        ? timelineUi.batchRequestedOne
        : batchSupplierCount === 2
          ? timelineUi.batchRequestedTwo
          : timelineUi.batchRequested(formatNumber(batchSupplierCount));
  const verb =
    event.type === 'BATCH_CREATED' && batch
      ? batch
      : event.type === 'ITEM_UNAVAILABLE' && line
        ? timelineUi.unavailable(line)
        : event.type === 'ITEM_RESOLVED_EXTERNALLY'
          ? timelineUi.resolvedExternally(line)
          : ar.lifecycle.events[event.type];
  const by = event.actorName
    ? ` ${event.actorName}${event.actorRoleName ? ` (${event.actorRoleName})` : ''}`
    : '';
  const detail = reason ?? note;
  const space = verb.indexOf(' ');
  return `${verb.slice(0, space)}${by}${verb.slice(space)}${detail ? ` — ${detail}` : ''}.`;
}
