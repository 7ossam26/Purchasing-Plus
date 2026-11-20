import type { createUser, editUser } from '@purchasing-plus/shared';

import { api } from './client.js';
import { recordPath, type RecordPage } from './records.js';
import type { RoleSummary } from './roles.js';
import type { SiteOption } from './sites.js';

export interface User {
  id: number;
  name: string;
  username: string;
  isActive: boolean;
  isSuperadmin: boolean;
  roleId: number | null;
  role: Omit<RoleSummary, 'id'> | null;
  sites: (Omit<SiteOption, 'id'> & { siteId: number })[];
  canManage: boolean;
}
export interface UserOptions {
  roles: (RoleSummary & { assignable: boolean })[];
  sites: SiteOption[];
}
export interface UserFilters {
  search: string;
  roleId: string;
  siteId: string;
  active: string;
}
export const userApi = {
  list: (page: number, filters: UserFilters, signal: AbortSignal) =>
    api<RecordPage<User>>(recordPath('/users', { ...filters, page }), {
      signal,
    }),
  options: (signal: AbortSignal) =>
    api<UserOptions>('/users/options', { signal }),
  create: (body: ReturnType<typeof createUser.parse>) =>
    api<void>('/users', { method: 'POST', body }),
  update: (id: number, body: ReturnType<typeof editUser.parse>) =>
    api<void>('/users/' + id, { method: 'PATCH', body }),
  reset: (id: number, password: string) =>
    api<void>('/users/' + id + '/reset-password', {
      method: 'POST',
      body: { password },
    }),
};
