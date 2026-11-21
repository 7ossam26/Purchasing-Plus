import type {
  createRfqInput,
  editPausedRequestInput,
  priceRequestItemInput,
} from '@purchasing-plus/shared';
import type { RefusalCode } from '@purchasing-plus/shared/lifecycle';

import { api } from './client.js';
import { recordPath, type RecordPage } from './records.js';
import type { RequestDto, RequestLine } from './requests.js';

export type SupplierContact = {
  id: number;
  name: string;
  whatsappNumber: string;
  whatsappDisplay: string;
};
export type PurchasingSupplier = SupplierContact & {
  alreadyReceivedCount: number;
};
export type BatchSupplier = {
  supplierId: number;
  supplier: SupplierContact;
  sentAt: string | null;
  sentById: number | null;
  message?: string;
  waUrl?: string;
  tooLong?: boolean;
};
export type RfqBatch = {
  id: number;
  createdAt: string;
  itemIds: number[];
  message?: string;
  suppliers?: BatchSupplier[];
};
export type SentDelivery = {
  batchId: number;
  supplierId: number;
  supplierName: string;
  sentAt: string;
};
export type PurchasingLine = RequestLine & {
  sentTo?: SentDelivery[];
  sentSupplierCount?: number;
};
export type PurchasingView = Omit<RequestDto, 'items'> & {
  items: PurchasingLine[];
  batches: RfqBatch[];
  suppliers?: PurchasingSupplier[];
  pricing?: {
    pricedCount: number;
    unavailableCount: number;
    total: string;
    pendingTotal: string;
    needsRepricingItemIds: number[];
    submitBlocker: RefusalCode | null;
  };
};
export type BatchResult = { version: number; batch: RfqBatch };
export type PauseEdit = ReturnType<typeof editPausedRequestInput.parse>;
const root = (id: number) => '/requests/' + id;
const path = (id: number) => root(id) + '/purchasing';
const recipientPath = (id: number, batchId: number, supplierId: number) =>
  path(id) + '/batches/' + batchId + '/suppliers/' + supplierId;
export const purchasingKey = (id: number) => ['purchasing', id] as const;
export const purchasingApi = {
  get: (id: number, signal: AbortSignal, itemIds?: readonly number[]) =>
    api<PurchasingView>(recordPath(path(id), { itemIds: itemIds?.join(',') }), {
      signal,
    }),
  suppliers: (id: number, page: number, q: string, signal: AbortSignal) =>
    api<RecordPage<SupplierContact>>(
      recordPath(path(id) + '/suppliers', { page, q }),
      { signal },
    ),
  createBatch: (id: number, body: ReturnType<typeof createRfqInput.parse>) =>
    api<BatchResult>(path(id) + '/batches', { method: 'POST', body }),
  editMessage: (
    id: number,
    batchId: number,
    supplierId: number,
    version: number,
    message: string,
  ) =>
    api<BatchResult>(recipientPath(id, batchId, supplierId), {
      method: 'PATCH',
      body: { version, message },
    }),
  markSent: (
    id: number,
    batchId: number,
    supplierId: number,
    version: number,
  ) =>
    api<BatchResult>(recipientPath(id, batchId, supplierId) + '/sent', {
      method: 'POST',
      body: { version },
    }),
  savePrice: (
    id: number,
    itemId: number,
    body: ReturnType<typeof priceRequestItemInput.parse>,
  ) =>
    api<RequestDto>(path(id) + '/items/' + itemId + '/pricing', {
      method: 'PATCH',
      body,
    }),
  availability: (
    id: number,
    itemId: number,
    version: number,
    unavailable: boolean,
    note?: string,
  ) =>
    api<RequestDto>(path(id) + '/items/' + itemId + '/unavailable', {
      method: unavailable ? 'POST' : 'DELETE',
      body: { version, note },
    }),
  fee: (id: number, version: number, deliveryFee: string | null) =>
    api<RequestDto>(path(id) + '/delivery-fee', {
      method: 'PUT',
      body: { version, deliveryFee },
    }),
  submit: (id: number, version: number) =>
    api<RequestDto>(path(id) + '/submit-pricing', {
      method: 'POST',
      body: { version },
    }),
  pauseEdit: (id: number, body: PauseEdit) =>
    api<RequestDto>(root(id) + '/paused-edit', { method: 'PATCH', body }),
};
