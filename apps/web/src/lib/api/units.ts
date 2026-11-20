import type { NamedRecord } from './catalog.js';
import { api } from './client.js';
import { allRecords } from './records.js';

export const unitsApi = {
  list: (signal: AbortSignal) => allRecords<NamedRecord>('/units', signal),
  create: (body: { name: string }) => api('/units', { method: 'POST', body }),
  edit: (id: number, body: { name: string } | { isActive: true }) =>
    api('/units/' + id, { method: 'PATCH', body }),
  deactivate: (id: number) =>
    api('/units/' + id + '/deactivate', { method: 'POST' }),
  remove: (id: number) => api('/units/' + id, { method: 'DELETE' }),
};
