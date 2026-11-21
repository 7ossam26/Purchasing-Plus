import type {
  RecordId,
  RecordResult,
  ReportId,
  ReportOptions,
  ReportResult,
} from '@purchasing-plus/shared';

import { api, download } from './client.js';

export type Filters = Record<string, string>;
const prefix = '/reports';
function path(endpoint: string, filters: Filters) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, value]) => value),
  );
  return endpoint + (query.size ? '?' + query.toString() : '');
}

export const reportsApi = {
  options: (signal?: AbortSignal) =>
    api<ReportOptions>(prefix + '/options', { signal }),
  items: (filters: Filters, signal?: AbortSignal) =>
    api<{ id: number; name: string; code: string }[]>(
      path(prefix + '/price-history/items', filters),
      { signal },
    ),
  report: (id: ReportId, filters: Filters, signal?: AbortSignal) =>
    api<ReportResult>(path(prefix + '/' + id, filters), { signal }),
  records: (id: RecordId, filters: Filters, signal?: AbortSignal) =>
    api<RecordResult>(path('/records/' + id, filters), { signal }),
  export: (
    area: 'reports' | 'records',
    id: ReportId | RecordId,
    filters: Filters,
  ) =>
    download(
      path('/' + area + '/' + id, { ...filters, format: 'xlsx' }),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ),
};
