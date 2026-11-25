import {
  actions,
  draftState,
  openItem,
  type ActionInput,
  type ActionName,
  type ItemState,
  type LineData,
  type RequestState,
  type RequestStatus,
  type Viewer,
} from '../../src/lifecycle/index.js';
import { registry, type PermissionKey } from '../../src/permissions/index.js';

export const now = new Date('2026-12-31T22:05:00Z');
export const viewer: Viewer = {
  userId: 7,
  siteIds: [2],
  siteScope: 'ASSIGNED',
  permissions: new Set(registry.map((p) => p.key)),
  isSuperadmin: false,
};
export const only = (...keys: PermissionKey[]): Viewer => ({
  ...viewer,
  permissions: new Set(keys),
});
export function data(id = 11): LineData {
  return {
    id,
    catalogItemId: 100 + id,
    nodeId: 4,
    snapshot: {
      code: 'T01',
      name: 'بلاط',
      unitName: 'متر',
      attributes: { لون: 'أبيض' },
      nodePath: ['تشطيبات'],
      coverImageKey: null,
    },
    otherName: null,
    specs: 'أبيض',
    quantity: '4.00',
    unitId: 6,
  };
}
export function fixture(
  status: RequestStatus = 'DRAFT',
  state: ItemState = 'OPEN',
): RequestState {
  const s = draftState({
    id: 1,
    siteId: 2,
    categoryId: 3,
    createdById: viewer.userId,
  });
  s.items = [openItem(data(), 1)];
  s.status = status;
  s.items[0]!.state = state;
  s.version = 1;
  return s;
}
export const roundLine = {
  itemId: 11,
  catalogItemId: 111,
  lineNo: 1,
  supplierId: 8,
  lineTotal: '13.50',
  quantity: '4.00',
};
const allOpen = [
  'DRAFT',
  'AWAITING_MANAGER',
  'RETURNED',
  'AT_PURCHASING',
  'PAUSED',
  'FULFILMENT',
] as const;
const active = allOpen.filter((s) => s !== 'DRAFT');
const pricing = ['AT_PURCHASING', 'FULFILMENT'] as const;
const all = [...allOpen, 'REJECTED', 'COMPLETED', 'CANCELLED'] as const;
type Case<A extends ActionName> = {
  key: PermissionKey | 'system';
  statuses: readonly RequestStatus[];
  input: ActionInput<A>;
  item?: ItemState;
};
const base = { version: 1 };
const change = {
  ...base,
  change: [{ itemId: 11, fields: { quantity: '3.50' } }],
};
const reason = { ...base, reason: 'تعديل مطلوب' };
const line = { ...base, itemId: 11 };
const priced = { ...line, supplierId: 8, lineTotal: '13.50' };
export const cases = {
  saveDraft: { key: 'requests.create', statuses: ['DRAFT'], input: change },
  deleteDraft: {
    key: 'requests.create',
    statuses: ['DRAFT'],
    input: { ...base, confirm: true },
  },
  submit: {
    key: 'requests.create',
    statuses: ['DRAFT'],
    input: { ...base, sequence: 2 },
  },
  editBeforeApproval: {
    key: 'requests.create',
    statuses: ['AWAITING_MANAGER', 'RETURNED'],
    input: change,
  },
  editQuantities: {
    key: 'requests.editQuantities',
    statuses: ['AWAITING_MANAGER'],
    input: { ...base, lines: [{ itemId: 11, quantity: '2' }] },
  },
  approve: {
    key: 'requests.approve',
    statuses: ['AWAITING_MANAGER'],
    input: base,
  },
  reject: {
    key: 'requests.reject',
    statuses: ['AWAITING_MANAGER'],
    input: reason,
  },
  returnForEdit: {
    key: 'requests.returnForEdit',
    statuses: ['AWAITING_MANAGER'],
    input: reason,
  },
  resubmit: { key: 'requests.create', statuses: ['RETURNED'], input: base },
  raiseUrgency: {
    key: 'requests.raiseUrgency',
    statuses: allOpen,
    input: { ...base, urgency: 'URGENT' },
  },
  pause: { key: 'requests.pause', statuses: ['AT_PURCHASING'], input: reason },
  purchasingReturnForEdit: {
    key: 'purchasing.returnForEdit',
    statuses: ['AT_PURCHASING'],
    input: reason,
  },
  editWhilePaused: {
    key: 'requests.editWhilePaused',
    statuses: ['PAUSED'],
    input: change,
  },
  resume: { key: 'requests.pause', statuses: ['PAUSED'], input: base },
  createBatch: {
    key: 'purchasing.sendRfq',
    statuses: ['AT_PURCHASING'],
    input: { ...base, batchId: 4, itemIds: [11], supplierIds: [8] },
  },
  markBatchSent: {
    key: 'purchasing.sendRfq',
    statuses: ['AT_PURCHASING'],
    input: { ...base, batchId: 3, supplierId: 8 },
  },
  editBatchMessage: {
    key: 'purchasing.sendRfq',
    statuses: ['AT_PURCHASING'],
    input: { ...base, batchId: 3, supplierId: 8, message: 'تأكيد المواصفات' },
  },
  savePricingDraft: {
    key: 'purchasing.price',
    statuses: pricing,
    input: priced,
  },
  markUnavailable: { key: 'purchasing.price', statuses: pricing, input: line },
  markAvailable: {
    key: 'purchasing.price',
    statuses: ['AT_PURCHASING'],
    input: line,
    item: 'UNAVAILABLE',
  },
  submitPricing: { key: 'purchasing.price', statuses: pricing, input: base },
  releasePendingPricing: {
    key: 'system',
    statuses: ['FULFILMENT'],
    input: base,
    item: 'AWAITING_APPROVAL',
  },
  priceUnavailable: {
    key: 'purchasing.price',
    statuses: ['FULFILMENT'],
    input: priced,
    item: 'UNAVAILABLE',
  },
  markSupplyOrderSent: {
    key: 'purchasing.sendSupplyOrder',
    statuses: ['FULFILMENT'],
    input: { ...base, orderNo: 1 },
    item: 'AWAITING_RECEIPT',
  },
  editSupplyOrderMessage: {
    key: 'purchasing.sendSupplyOrder',
    statuses: ['FULFILMENT'],
    input: { ...base, orderNo: 1, message: 'تعديل' },
    item: 'AWAITING_RECEIPT',
  },
  recordReceipt: {
    key: 'receipt.record',
    statuses: ['FULFILMENT'],
    input: { ...base, lines: [{ itemId: 11, quantity: '1' }] },
    item: 'AWAITING_RECEIPT',
  },
  stillComing: {
    key: 'purchasing.handleRemaining',
    statuses: ['FULFILMENT'],
    input: line,
    item: 'REMAINING',
  },
  repriceRemaining: {
    key: 'purchasing.handleRemaining',
    statuses: ['FULFILMENT'],
    input: priced,
    item: 'REMAINING',
  },
  resolveExternally: {
    key: 'items.resolveExternally',
    statuses: pricing,
    input: line,
    item: 'UNAVAILABLE',
  },
  cancel: { key: 'requests.cancelAnyStage', statuses: active, input: reason },
  autoComplete: {
    key: 'system',
    statuses: ['AT_PURCHASING', 'PAUSED', 'FULFILMENT'],
    input: base,
    item: 'RECEIVED',
  },
  editDeliveryFee: {
    key: 'purchasing.price',
    statuses: allOpen,
    input: { ...base, deliveryFee: '25.00' },
  },
  copyRequest: {
    key: 'requests.create',
    statuses: all,
    input: {
      ...base,
      newId: 2,
      siteId: 2,
      lines: [{ sourceItemId: 11, newItemId: 22, current: null }],
    },
  },
  addToCatalog: {
    key: 'catalog.create',
    statuses: all,
    input: { version: 1, itemId: 11, catalogItemId: 500, code: 'T-0001' },
  },
} satisfies { [A in ActionName]: Case<A> };
export const names = Object.keys(cases) as ActionName[];
export function sample(name: ActionName) {
  const c: Case<ActionName> = cases[name];
  const s = fixture(c.statuses[0]!, c.item);
  const item = s.items[0]!;
  if (name === 'addToCatalog') {
    item.catalogItemId = null;
    item.otherName = item.snapshot.name;
  }
  Object.assign(item, {
    supplierId: 8,
    lineTotal: '13.50',
    pricedQuantity: '4.00',
  });
  if (name === 'markBatchSent' || name === 'editBatchMessage')
    s.batches.push({ id: 3, itemIds: [11], supplierIds: [8], sentTo: [] });
  if (name === 'releasePendingPricing')
    s.rounds.push({
      number: 1,
      status: 'PENDING',
      decidedById: null,
      decidedAt: null,
      lines: [roundLine],
    });
  if (name === 'markSupplyOrderSent' || name === 'editSupplyOrderMessage')
    s.supplyOrders.push({
      number: 1,
      supplierId: 8,
      sent: false,
      lines: [roundLine],
    });
  return {
    state: s,
    who: c.key === 'system' ? null : only(c.key),
    input: c.input,
    statuses: c.statuses,
    key: c.key,
  };
}
// The mapped cases above typecheck each command against its own input schema.
export const guard = (
  name: ActionName,
  s: RequestState,
  v: Viewer | null,
  input: unknown,
) => actions[name].can(s, v, input as never);
export const apply = (
  name: ActionName,
  s: RequestState,
  v: Viewer | null,
  input: unknown,
) => actions[name].apply(s, v, input as never, now);
