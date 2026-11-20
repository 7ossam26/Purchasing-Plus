import type { createRole } from '@purchasing-plus/shared';

import { api } from './client.js';
import { allRecords, recordPath, type RecordPage } from './records.js';

export type RoleInput = ReturnType<typeof createRole.parse>;
export type SiteScope = RoleInput['siteScope'];
export interface RoleSummary {
  id: number;
  name: string;
  siteScope: SiteScope;
}
export interface Role extends RoleSummary {
  description: string;
  keys: string[];
  keyCount: number;
  userCount: number;
  canEdit: boolean;
}
export const roleApi = {
  list: (page: number, signal: AbortSignal) =>
    api<RecordPage<Role>>(recordPath('/roles', { page }), { signal }),
  all: (signal: AbortSignal) => allRecords<Role>('/roles', signal),
  get: (id: number, signal: AbortSignal) =>
    api<Role>('/roles/' + id, { signal }),
  save: (body: RoleInput, id?: number) =>
    api<Role>(id ? '/roles/' + id : '/roles', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  delete: (id: number) => api<void>('/roles/' + id, { method: 'DELETE' }),
};
