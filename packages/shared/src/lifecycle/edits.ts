import { z } from 'zod';

import { id } from '../access.js';

import { refuse, unique, type Context } from './engine.js';
import type { EditDiff } from './events.js';
import {
  editableRequestFields,
  inSite,
  lineData,
  openItem,
  sameDecimal,
  type LineData,
  type RequestItem,
  type RequestState,
  type Viewer,
} from './model.js';

const editable = lineData.omit({ id: true });
const itemFields = editable.keyof().options;
const header = editableRequestFields.partial();
export const edits = {
  fields: header.optional(),
  add: z.array(lineData).optional(),
  remove: z.array(id).optional(),
  order: z.array(id).optional(),
  change: z
    .array(z.strictObject({ itemId: id, fields: editable.partial() }))
    .optional(),
};
type EditInput = z.infer<z.ZodObject<typeof edits>>;

function definedFields(fields: object) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
}

function equal(a: z.core.util.JSONType, b: z.core.util.JSONType): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const entries = Object.entries(a);
  return (
    entries.length === Object.keys(b).length &&
    entries.every(
      ([k, v]) =>
        Object.hasOwn(b, k) &&
        equal(v, (b as Record<string, z.core.util.JSONType>)[k]!),
    )
  );
}
const diffLine = z.object({ ...lineData.shape, lineNo: id });
const lineSnapshot = (i: RequestItem) => diffLine.parse(i);
export function diffRequest(
  before: RequestState,
  after: RequestState,
): EditDiff {
  const diff: EditDiff = { fields: [], added: [], removed: [], changed: [] };
  for (const field of header.keyof().options) {
    if (before[field] !== after[field])
      diff.fields.push({ field, before: before[field], after: after[field] });
  }
  const live = (s: RequestState) =>
    new Map(s.items.filter((i) => i.state !== 'REMOVED').map((i) => [i.id, i]));
  const old = live(before),
    current = live(after);
  for (const [id, item] of old)
    if (!current.has(id)) diff.removed.push(lineSnapshot(item));
  for (const [id, item] of current) {
    const prev = old.get(id);
    if (!prev) {
      diff.added.push(lineSnapshot(item));
      continue;
    }
    const fields = itemFields
      .filter((k) =>
        k === 'quantity'
          ? !sameDecimal(prev.quantity, item.quantity)
          : !equal(prev[k], item[k]),
      )
      .map((field) => ({ field, before: prev[field], after: item[field] }));
    if (fields.length)
      diff.changed.push({ itemId: id, lineNo: item.lineNo, fields });
  }
  return diff;
}
function checkLine(data: LineData) {
  if ((data.catalogItemId === null) !== (data.otherName !== null))
    refuse('INVALID_INPUT');
}
export function editRequest(ctx: Context, input: EditInput, viewer: Viewer) {
  const s = ctx.state,
    before = structuredClone(s);
  const { fields = {}, add = [], remove = [], change = [], order } = input;
  unique([...add.map((i) => i.id), ...remove, ...change.map((i) => i.itemId)]);
  if (fields.siteId !== undefined && fields.siteId !== s.siteId) {
    if (s.status !== 'DRAFT') refuse('INVALID_INPUT');
    if (!inSite(viewer, fields.siteId)) refuse('OUT_OF_SCOPE');
  }
  if (fields.urgency && fields.urgency !== s.urgency) {
    if (s.urgencyLocked) refuse('URGENCY_LOCKED');
    if (s.status === 'PAUSED') refuse('INVALID_INPUT');
  }
  Object.assign(s, definedFields(fields));
  const getLive = (id: number) => {
    const item = s.items.find((i) => i.id === id) ?? refuse('ITEM_NOT_FOUND');
    if (
      item.state !== 'OPEN' &&
      !(s.status === 'PAUSED' && item.state === 'UNAVAILABLE')
    )
      refuse('WRONG_ITEM_STATE');
    return item;
  };
  for (const id of remove) getLive(id).state = 'REMOVED';
  for (const { itemId, fields: patch } of change) {
    const item = getLive(itemId);
    const updated = definedFields(patch);
    if (
      patch.quantity !== undefined &&
      sameDecimal(item.quantity, patch.quantity)
    )
      updated.quantity = item.quantity;
    Object.assign(item, updated);
    checkLine(item);
  }
  let lastLine = s.items.reduce((last, item) => Math.max(last, item.lineNo), 0);
  for (const data of add) {
    if (s.items.some((i) => i.id === data.id)) refuse('DUPLICATE');
    checkLine(data);
    s.items.push(openItem(data, ++lastLine));
  }
  if (s.status === 'DRAFT') {
    s.items = s.items.filter((i) => i.state !== 'REMOVED');
    if (order) {
      unique(order);
      const byId = new Map(s.items.map((item) => [item.id, item]));
      if (order.length !== byId.size) refuse('INVALID_INPUT');
      s.items = order.map((id) => byId.get(id) ?? refuse('ITEM_NOT_FOUND'));
    }
    s.items.forEach((i, n) => {
      i.lineNo = n + 1;
    });
  } else if (order) refuse('INVALID_INPUT');
  const diff = diffRequest(before, s);
  const changed =
    diff.fields.length +
    diff.added.length +
    diff.removed.length +
    diff.changed.length +
    Number(s.items.some((item, index) => item.id !== before.items[index]?.id));
  if (!changed && (s.status !== 'DRAFT' || s.version > 0)) refuse('NO_CHANGES');
  if (s.status === 'DRAFT') return;
  for (const { itemId } of diff.changed) {
    const item = getLive(itemId);
    if (
      s.status === 'PAUSED' &&
      (item.supplierId !== null || item.lineTotal !== null)
    ) {
      item.supplierId = null;
      item.lineTotal = null;
      item.pricedQuantity = null;
      item.needsRepricing = true;
    }
    if (s.batches.some((b) => b.sentTo.length && b.itemIds.includes(itemId)))
      item.modifiedAfterSend = true;
  }
  s.isModified = true;
  ctx.emit('EDITED', diff, [
    ...diff.changed.map((i) => i.itemId),
    ...diff.added.map((i) => i.id),
    ...diff.removed.map((i) => i.id),
  ]);
  if (before.urgency !== s.urgency)
    ctx.emit('URGENCY_CHANGED', {
      from: before.urgency,
      to: s.urgency,
      locked: false,
    });
}
