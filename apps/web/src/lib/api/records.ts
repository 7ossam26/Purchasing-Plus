import { api } from './client.js';

export interface RecordPage<Row> {
  items: Row[];
  page: number;
  pageSize: number;
  total: number;
}

export function recordPath(
  path: string,
  filters: Record<string, string | number | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return path + '?' + query;
}

export async function allRecords<Row>(path: string, signal: AbortSignal) {
  const rows: Row[] = [];
  for (let page = 1; ; page++) {
    const result = await api<RecordPage<Row>>(
      recordPath(path, { page, pageSize: 100 }),
      { signal },
    );
    rows.push(...result.items);
    if (page * result.pageSize >= result.total) return rows;
  }
}
