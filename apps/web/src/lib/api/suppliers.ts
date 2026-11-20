import type { createSupplier, editSupplier } from '@purchasing-plus/shared';

import type { NamedRecord } from './catalog.js';
import { api } from './client.js';
import { allRecords } from './records.js';

export interface Supplier extends NamedRecord {
  contactPerson: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  categoryIds: number[];
  notes: string;
}
export const suppliersApi = {
  list: (signal: AbortSignal) => allRecords<Supplier>('/suppliers', signal),
  categories: (signal: AbortSignal) =>
    api<NamedRecord[]>('/suppliers/category-choices', { signal }),
  create: (body: ReturnType<typeof createSupplier.parse>) =>
    api('/suppliers', { method: 'POST', body }),
  edit: (id: number, body: ReturnType<typeof editSupplier.parse>) =>
    api('/suppliers/' + id, { method: 'PATCH', body }),
  deactivate: (id: number) =>
    api('/suppliers/' + id + '/deactivate', { method: 'POST' }),
  remove: (id: number) => api('/suppliers/' + id, { method: 'DELETE' }),
};
