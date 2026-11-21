import {
  formatReportValue,
  type ColumnKind,
  type ReportChart,
  type ReportColumn,
  type ReportMetric,
  type ReportRow,
  type ReportTable,
} from '@purchasing-plus/shared';
import { reportsUi as ar } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';

import { allowed, type Viewer } from '../../middleware/access.js';

type Label = {
  [K in keyof typeof ar]: (typeof ar)[K] extends string ? K : never;
}[keyof typeof ar];
export function column(
  key: string,
  label: Label,
  kind: ColumnKind = 'text',
  visibility?: PermissionKey,
): ReportColumn {
  const permission =
    kind === 'money'
      ? 'requests.viewPrices'
      : key === 'supplier'
        ? 'requests.viewSupplierNames'
        : undefined;
  return { key, kind, label: ar[label], permission: visibility ?? permission };
}

export function toTable(
  viewer: Viewer,
  title: string,
  columns: ReportColumn[],
  rows: ReportRow[],
): ReportTable {
  const visible = columns.filter(
    ({ permission }) => !permission || allowed(viewer, permission),
  );
  return {
    title,
    columns: visible,
    rows: rows.map((row) =>
      Object.fromEntries([
        ...visible.map(({ key }) => [key, row[key] ?? null]),
        ...(row.requestId ? [['requestId', row.requestId]] : []),
      ]),
    ),
  };
}

export function plot(
  table: ReportTable,
  category: string,
  keys: string[],
  type: ReportChart['type'] = 'bar',
): ReportChart | null {
  const columns = table.columns.filter(({ key }) => keys.includes(key));
  const label = table.columns.find(({ key }) => key === category);
  if (!table.rows.length || !columns.length || !label) return null;
  return {
    type,
    table,
    labels: table.rows.map((row) =>
      formatReportValue(row[category], label.kind),
    ),
    series: columns.map((col) => ({
      label: col.label,
      kind: col.kind,
      values: table.rows.map((row) => row[col.key] ?? null),
    })),
  };
}

export function metric(
  col: ReportColumn,
  row: ReportRow | undefined,
  domain: ReportMetric['domain'] = 'period',
): ReportMetric[] {
  const value = row?.[col.key];
  return value === null || value === undefined
    ? []
    : [{ label: col.label, value, kind: col.kind, domain }];
}

export function excelValue(
  value: ReportRow[string] | undefined,
  kind: ColumnKind,
) {
  if (value === null || value === undefined) return null;
  if (kind === 'money' || kind === 'number') return Number(value);
  if (kind === 'percent') return Number(value) / 100;
  return formatReportValue(value, kind);
}
