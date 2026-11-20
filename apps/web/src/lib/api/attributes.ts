import type { createAttribute, editAttribute } from '@purchasing-plus/shared';

import type { Attribute, AttributeOption } from './catalog.js';
import { api } from './client.js';
import { allRecords } from './records.js';

const path = '/attributes';
const optionsPath = (id: number) => path + '/' + id + '/options';
export const attributesApi = {
  list: (signal: AbortSignal) => allRecords<Attribute>(path, signal),
  get: (id: number, signal: AbortSignal) =>
    api<Attribute>(path + '/' + id, { signal }),
  create: (body: ReturnType<typeof createAttribute.parse>) =>
    api<Attribute>(path, { method: 'POST', body }),
  edit: (id: number, body: ReturnType<typeof editAttribute.parse>) =>
    api<Attribute>(path + '/' + id, { method: 'PATCH', body }),
  deactivate: (id: number) =>
    api(path + '/' + id + '/deactivate', { method: 'POST' }),
  remove: (id: number) => api(path + '/' + id, { method: 'DELETE' }),
  addOption: (id: number, label: string) =>
    api<AttributeOption>(optionsPath(id), { method: 'POST', body: { label } }),
  editOption: (
    id: number,
    option: number,
    body: { label: string } | { isActive: true },
  ) => api(optionsPath(id) + '/' + option, { method: 'PATCH', body }),
  deactivateOption: (id: number, option: number) =>
    api(optionsPath(id) + '/' + option + '/deactivate', { method: 'POST' }),
  removeOption: (id: number, option: number) =>
    api(optionsPath(id) + '/' + option, { method: 'DELETE' }),
  reorderOptions: (id: number, ids: number[]) =>
    api(optionsPath(id) + '/order', { method: 'PUT', body: { ids } }),
};
