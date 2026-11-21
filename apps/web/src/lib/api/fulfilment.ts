import type { receiptInput } from '@purchasing-plus/shared';
import type { RequestItem } from '@purchasing-plus/shared/lifecycle';

import { api } from './client.js';
import type { RequestDto } from './requests.js';

type Named = { id: number; name: string };
export type ActorSnapshot = {
  id: number | null;
  name: string | null;
  roleName: string | null;
};
export type RoundSummary = {
  number: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedAt: string | null;
  decidedBy: ActorSnapshot | null;
  itemIds: number[];
  reason?: string;
  roundTotal?: string;
  deliveryFee?: string | null;
};
export type Round = RoundSummary & {
  version: number;
  items: (Pick<RequestItem, 'lineNo' | 'snapshot' | 'quantity' | 'specs'> & {
    itemId: number;
    supplier?: Named;
    lineTotal?: string;
    unitPrice?: string;
    lastPrice?: { unitPrice: string } | null;
    priceChange?: { amount: string; percent: string | null } | null;
  })[];
};
export type SupplyOrder = {
  id: number;
  number: number;
  supplier?: Named;
  sentAt: string | null;
  message?: string;
  waUrl?: string;
  tooLong?: boolean;
  items: { itemId: number; lineNo: number; quantity: string }[];
};
export type ReceiptInput = ReturnType<typeof receiptInput.parse>;
export type Receipt = {
  id: number;
  recordedAt: string;
  recordedBy: Named;
  note: string | null;
  lines: ReceiptInput['lines'];
};

const root = (id: number) => '/requests/' + id;
const round = (id: number, number: number) => root(id) + '/rounds/' + number;
const order = (id: number, number: number) =>
  root(id) + '/supply-orders/' + number;
function post<T extends { version: number }>(path: string, body: T) {
  return api<RequestDto>(path, { method: 'POST', body });
}

export const roundKey = (id: number) => ['requests', 'rounds', id] as const;
export const fulfilmentApi = {
  round: (id: number, number: number, signal: AbortSignal) =>
    api<Round>(round(id, number), { signal }),
  decide: (id: number, number: number, version: number, reason?: string) =>
    post(round(id, number) + (reason === undefined ? '/approve' : '/reject'), {
      version,
      reason,
    }),
  editMessage: (id: number, number: number, version: number, message: string) =>
    api<RequestDto>(order(id, number), {
      method: 'PATCH',
      body: { version, message },
    }),
  markSent: (id: number, number: number, version: number) =>
    post(order(id, number) + '/sent', { version }),
  receive: (id: number, body: ReceiptInput) =>
    post(root(id) + '/receipts', body),
  stillComing: (id: number, itemId: number, version: number) =>
    post(root(id) + '/items/' + itemId + '/still-coming', { version }),
  reprice: (
    id: number,
    itemId: number,
    body: { version: number; supplierId: number; lineTotal: string },
  ) => post(root(id) + '/items/' + itemId + '/reprice', body),
  resolve: (id: number, itemId: number, version: number, note?: string) =>
    post(root(id) + '/items/' + itemId + '/resolve-externally', {
      version,
      note,
    }),
};
