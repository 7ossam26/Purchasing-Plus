import type { createCategory, editCatalogNode } from '@purchasing-plus/shared';

import type { Attribute, Folder } from './catalog.js';
import { api } from './client.js';

const path = '/catalog-tree/nodes';
export const treeApi = {
  list: (parentId: number | null, signal: AbortSignal) =>
    api<Folder[]>(
      parentId === null
        ? '/catalog-tree/categories'
        : path + '/' + parentId + '/children',
      { signal },
    ),
  category: (body: ReturnType<typeof createCategory.parse>) =>
    api('/catalog-tree/categories', { method: 'POST', body }),
  group: (parentId: number, name: string) =>
    api(path, { method: 'POST', body: { name, parentId } }),
  edit: (id: number, body: ReturnType<typeof editCatalogNode.parse>) =>
    api(path + '/' + id, { method: 'PATCH', body }),
  reorder: (parentId: number | null, ids: number[]) =>
    api(path + '/order', { method: 'PUT', body: { parentId, ids } }),
  move: (id: number, parentId: number) =>
    api(path + '/' + id + '/move', { method: 'POST', body: { parentId } }),
  deactivate: (id: number) =>
    api(path + '/' + id + '/deactivate', { method: 'POST' }),
  remove: (id: number) => api(path + '/' + id, { method: 'DELETE' }),
  ownAttributes: (id: number, signal: AbortSignal) =>
    api<Attribute[]>('/nodes/' + id + '/attributes', { signal }),
  setAttributes: (id: number, attributeIds: number[]) =>
    api('/nodes/' + id + '/attributes', {
      method: 'PUT',
      body: { attributeIds },
    }),
};
