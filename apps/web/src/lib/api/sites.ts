import type { createSite } from '@purchasing-plus/shared';
import type { QueryClient } from '@tanstack/react-query';

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
// An engineer assigned to the site. Only engineers the viewer can manage may be removed.
export interface SiteEngineer {
  id: number;
  name: string;
  username: string;
  isActive: boolean;
  canManage: boolean;
}
// An active engineer the viewer can assign, with the sites they already hold.
export interface EngineerOption {
  id: number;
  name: string;
  username: string;
  sites: { id: number; name: string }[];
}
// Creation sends the chosen engineers; edits send only the assignment changes.
export type SiteSave = ReturnType<typeof createSite.parse> & {
  engineerIds?: number[];
  engineers?: { add: number[]; remove: number[] };
};
export const engineerPageSize = 10;
export const siteApi = {
  list: (page: number, search: string, active: string, signal: AbortSignal) =>
    api<RecordPage<Site>>(recordPath('/sites', { page, search, active }), {
      signal,
    }),
  save: (body: SiteSave, id?: number) =>
    api<Site>(id ? '/sites/' + id : '/sites', {
      method: id ? 'PATCH' : 'POST',
      body,
    }),
  deactivate: (id: number) => api<Site>('/sites/' + id, { method: 'DELETE' }),
  engineers: (id: number, signal: AbortSignal) =>
    api<{ items: SiteEngineer[] }>('/sites/' + id + '/engineers', { signal }),
  engineerOptions: (search: string, page: number, signal: AbortSignal) =>
    api<RecordPage<EngineerOption>>(
      recordPath('/sites/engineers', {
        search,
        page,
        pageSize: engineerPageSize,
      }),
      { signal },
    ),
};

export function invalidateSiteQueries(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['sites'] }),
    client.invalidateQueries({ queryKey: ['users'] }),
    client.invalidateQueries({ queryKey: ['requests', 'options'] }),
    client.invalidateQueries({ queryKey: ['reports', 'options'] }),
  ]);
}
