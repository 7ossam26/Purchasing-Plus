import { Decimal } from 'decimal.js';
import { z } from 'zod';

import { id } from '../access.js';
import type { PermissionKey } from '../permissions/registry.js';

export const requestStatuses = [
  'DRAFT',
  'AWAITING_MANAGER',
  'RETURNED',
  'AT_PURCHASING',
  'PAUSED',
  'FULFILMENT',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export const itemStates = [
  'OPEN',
  'UNAVAILABLE',
  'AWAITING_APPROVAL',
  'AWAITING_RECEIPT',
  'REMAINING',
  'RECEIVED',
  'RESOLVED_EXTERNALLY',
  'REJECTED',
  'CANCELLED',
  'REMOVED',
] as const;
export const urgencies = ['NORMAL', 'URGENT', 'VERY_URGENT'] as const;
export type RequestStatus = (typeof requestStatuses)[number];
export type ItemState = (typeof itemStates)[number];
export type Urgency = (typeof urgencies)[number];
export const displayedStages = [
  'DRAFT',
  'AWAITING_MANAGER',
  'RETURNED',
  'AT_PURCHASING',
  'PAUSED',
  'AWAITING_APPROVAL',
  'AWAITING_RECEIPT',
  'REMAINING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;
export type DisplayedStage = (typeof displayedStages)[number];

export interface Viewer {
  userId: number;
  isSuperadmin: boolean;
  permissions: ReadonlySet<PermissionKey>;
  siteScope: 'ALL' | 'ASSIGNED';
  siteIds: readonly number[];
}
export function inSite(viewer: Viewer, siteId: number) {
  return (
    viewer.isSuperadmin ||
    viewer.siteScope === 'ALL' ||
    viewer.siteIds.includes(siteId)
  );
}
export function holds(viewer: Viewer, key: PermissionKey) {
  return viewer.isSuperadmin || viewer.permissions.has(key);
}

export const amount = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
export const quantity = amount.refine((value) => /[1-9]/.test(value));
export function addQuantities(a: string, b: string) {
  return new Decimal(a).plus(b).toFixed(2);
}
export function sumAmounts(amounts: Iterable<string>) {
  let total = new Decimal(0);
  for (const amount of amounts) total = total.plus(amount);
  return total.toFixed(2);
}
export const editableRequestFields = z.strictObject({
  urgency: z.enum(urgencies),
  unitOrClient: z.string().nullable(),
  note: z.string().nullable(),
  siteId: id,
});
export const snapshot = z.strictObject({
  name: z.string().trim().min(1),
  code: z.string().nullable(),
  unitName: z.string(),
  attributes: z.record(z.string(), z.string()),
  nodePath: z.array(z.string()),
  coverImageKey: z.string().nullable(),
});
export const lineData = z.strictObject({
  id,
  catalogItemId: id.nullable(),
  nodeId: id,
  snapshot,
  specs: z.string(),
  quantity,
  unitId: id,
  otherName: z.string().trim().min(1).nullable(),
});
export type LineData = z.infer<typeof lineData>;
export interface RequestItem extends LineData {
  lineNo: number;
  state: ItemState;
  receivedQty: string;
  supplierId: number | null;
  lineTotal: string | null;
  pricedQuantity: string | null;
  unavailableNote: string | null;
  needsRepricing: boolean;
  modifiedAfterSend: boolean;
}
export interface RoundLine {
  itemId: number;
  lineNo: number;
  catalogItemId: number | null;
  supplierId: number;
  lineTotal: string;
  quantity: string;
}
export interface PricingRound {
  number: number;
  lines: RoundLine[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedById: number | null;
  decidedAt: string | null;
}
export interface SupplyOrder {
  number: number;
  supplierId: number;
  lines: RoundLine[];
  sent: boolean;
}
export interface Batch {
  id: number;
  itemIds: number[];
  supplierIds: number[];
  sentTo: number[];
}
export interface RequestState {
  id: number;
  siteId: number;
  categoryId: number;
  createdById: number;
  status: RequestStatus;
  number: string | null;
  version: number;
  deleted: boolean;
  urgency: Urgency;
  urgencyLocked: boolean;
  isModified: boolean;
  unitOrClient: string | null;
  note: string | null;
  deliveryFee: string | null;
  pausedById: number | null;
  pausedAt: string | null;
  pauseReason: string | null;
  approvedById: number | null;
  copiedFromId: number | null;
  items: RequestItem[];
  rounds: PricingRound[];
  batches: Batch[];
  supplyOrders: SupplyOrder[];
}
export function draftState(
  identity: Pick<RequestState, 'id' | 'siteId' | 'categoryId' | 'createdById'>,
): RequestState {
  return {
    ...identity,
    status: 'DRAFT',
    number: null,
    version: 0,
    deleted: false,
    urgency: 'NORMAL',
    urgencyLocked: false,
    isModified: false,
    unitOrClient: null,
    note: null,
    deliveryFee: null,
    pausedById: null,
    pausedAt: null,
    pauseReason: null,
    approvedById: null,
    copiedFromId: null,
    items: [],
    rounds: [],
    batches: [],
    supplyOrders: [],
  };
}
export function openItem(data: LineData, lineNo: number): RequestItem {
  return {
    ...data,
    lineNo,
    state: 'OPEN',
    receivedQty: '0.00',
    supplierId: null,
    lineTotal: null,
    pricedQuantity: null,
    unavailableNote: null,
    needsRepricing: false,
    modifiedAfterSend: false,
  };
}
export function outstanding(
  item: Pick<RequestItem, 'quantity' | 'receivedQty'>,
) {
  return new Decimal(item.quantity).minus(item.receivedQty).toFixed(2);
}
export function validReceiptQuantity(value: string, remaining: string) {
  return quantity.safeParse(value).success && new Decimal(value).lte(remaining);
}
export function sameDecimal(a: string | null, b: string | null) {
  return a === b || (a !== null && b !== null && new Decimal(a).eq(b));
}
export function unitPrice(lineTotal: string, units: string) {
  return new Decimal(lineTotal).div(units).toFixed(2, Decimal.ROUND_HALF_UP);
}
export function priceChange(current: string, previous: string) {
  const difference = new Decimal(current).minus(previous);
  return {
    amount: difference.toFixed(2),
    percent: new Decimal(previous).isZero()
      ? null
      : difference.times(100).div(previous).toFixed(2, Decimal.ROUND_HALF_UP),
  };
}
const closedStates = new Set<ItemState>([
  'RECEIVED',
  'RESOLVED_EXTERNALLY',
  'REJECTED',
  'CANCELLED',
  'REMOVED',
]);
export const isClosed = (item: Pick<RequestItem, 'state'>) =>
  closedStates.has(item.state);
export const isFinal = (status: RequestStatus | DisplayedStage) =>
  status === 'COMPLETED' || status === 'REJECTED' || status === 'CANCELLED';
