import type { createSite } from '@purchasing-plus/shared';

import { api } from './client.js';
import { recordPath, type RecordPage } from './records.js';

export interface SiteOption {
  id: number;
  name: string;
  isActive: boolean;
}
export interface Site extends SiteOption {
  address: string;
}
export const siteApi = {
  list: (page: number, search: string, active: string, signal: AbortSignal) =>
    api<RecordPage<Site>>(recordPath('/sites', { page, search, active }), {
      signal,
    }),
  save: (body: ReturnType<typeof createSite.parse>, id?: number) =>
    api<Site>(id ? '/sites/' + id : '/sites', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  deactivate: (id: number) => api<Site>('/sites/' + id, { method: 'DELETE' }),
};
