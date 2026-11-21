import { z } from 'zod';

import {
  cairoDateBoundary,
  cairoDay,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
} from './formatters.js';
import { reportsUi } from './i18n/ar.js';
import {
  displayedStages,
  requestStatuses,
  urgencies,
} from './lifecycle/model.js';
import { statusMap } from './lifecycle/statuses.js';
import type { PermissionKey } from './permissions/registry.js';

export const reportDestinations = [
  ['requests-overview', 'reports.requestsOverview', 'ClipboardList'],
  ['stage-times', 'reports.stageTimes', 'Clock'],
  ['spending', 'reports.spending', 'Receipt'],
  ['suppliers', 'reports.suppliers', 'ShoppingCart'],
  ['price-history', 'reports.priceHistory', 'Package'],
  ['unavailable', 'reports.unavailable', 'PackageX'],
  ['user-activity', 'reports.userActivity', 'Users'],
] as const satisfies readonly (readonly [string, PermissionKey, string])[];

export const recordDestinations = [
  ['requests', 'ClipboardList'],
  ['receipts', 'PackageCheck'],
  ['approvals', 'ClipboardCheck'],
] as const;

export type ReportId = (typeof reportDestinations)[number][0];
export type RecordId = (typeof recordDestinations)[number][0];
export const reportKeys = reportDestinations.map(([, key]) => key);
export const reportHubKeys: PermissionKey[] = [...reportKeys, 'records.view'];
export const reportPresets = [
  'today',
  'last7',
  'thisMonth',
  'lastMonth',
  'custom',
] as const;

const positiveId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().min(1).max(2147483647));
const day = z.iso
  .date()
  .refine((value) => value >= '0001-01-01' && value < '9999-12-31');
const filters = {
  preset: z.enum(reportPresets).optional(),
  from: day.optional(),
  to: day.optional(),
  siteId: positiveId.optional(),
  categoryId: positiveId.optional(),
  format: z.literal('xlsx').optional(),
};
export const reportItemSearch = z.strictObject({
  q: z.string().trim().max(100).default(''),
  itemId: positiveId.optional(),
  siteId: positiveId.optional(),
  categoryId: positiveId.optional(),
});
function validateRange(
  query: { preset?: string; from?: string; to?: string },
  ctx: z.RefinementCtx,
) {
  if (query.preset === 'custom' || query.from || query.to) {
    if (
      !query.from ||
      !query.to ||
      query.from > query.to ||
      (query.preset && query.preset !== 'custom')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['from'],
        message: reportsUi.invalidPeriod,
      });
    }
  }
}

export function reportQuerySchema(report: ReportId) {
  return z
    .strictObject({
      ...filters,
      itemId:
        report === 'price-history'
          ? positiveId.optional()
          : z.never().optional(),
    })
    .superRefine(validateRange);
}

export function recordQuerySchema(record: RecordId) {
  return z
    .strictObject({
      ...filters,
      page: positiveId.default(1),
      pageSize: positiveId.pipe(z.number().max(100)).default(30),
      q: z.string().trim().max(100).optional(),
      status: (record === 'requests'
        ? z.enum(requestStatuses)
        : z.never()
      ).optional(),
      stage: (record === 'requests'
        ? z.enum(displayedStages)
        : z.never()
      ).optional(),
      urgency: (record === 'requests'
        ? z.enum(urgencies)
        : z.never()
      ).optional(),
      creatorId: (record === 'requests' ? positiveId : z.never()).optional(),
    })
    .superRefine(validateRange);
}

type PeriodFilter = {
  preset?: (typeof reportPresets)[number];
  from?: string;
  to?: string;
};
export interface ReportPeriod {
  from: string;
  to: string;
  start: string;
  endExclusive: string;
}

export function cairoReportPeriod(
  filter: PeriodFilter,
  now: Date,
): ReportPeriod {
  const dayMs = 86_400_000;
  const today = cairoDay(now);
  const local = new Date(today * dayMs);
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
  const month = (offset: number, date: number) =>
    iso(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, date));
  let from: string;
  let to: string;
  switch (filter.preset ?? (filter.from ? 'custom' : 'thisMonth')) {
    case 'custom':
      if (!filter.from || !filter.to || filter.from > filter.to)
        throw new RangeError(reportsUi.invalidPeriod);
      ({ from, to } = filter);
      break;
    case 'today':
      from = to = iso(today * dayMs);
      break;
    case 'last7':
      from = iso((today - 6) * dayMs);
      to = iso(today * dayMs);
      break;
    case 'lastMonth':
      from = month(-1, 1);
      to = month(0, 0);
      break;
    case 'thisMonth':
      from = month(0, 1);
      to = month(1, 0);
      break;
  }
  return {
    from,
    to,
    start: cairoDateBoundary(from).toISOString(),
    endExclusive: cairoDateBoundary(to, true).toISOString(),
  };
}

export type ColumnKind =
  | 'text'
  | 'number'
  | 'money'
  | 'date'
  | 'duration'
  | 'percent'
  | 'stage'
  | 'urgency'
  | 'event'
  | 'decision';
export interface ReportColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  permission?: PermissionKey;
}
export type ReportRow = Record<string, string | number | null>;
export function formatReportValue(
  value: ReportRow[string] | undefined,
  kind: ColumnKind,
): string {
  if (value === null || value === undefined) return reportsUi.emptyValue;
  switch (kind) {
    case 'stage':
    case 'urgency':
      return statusMap[value as keyof typeof statusMap]?.label ?? String(value);
    case 'date':
      return formatDateTime(value);
    case 'duration':
      return formatDuration(Number(value));
    case 'money':
      return formatMoney(String(value));
    case 'percent':
      return formatNumber(value) + '%';
    case 'number':
      return formatNumber(value);
    case 'event':
      return value === 'ITEM_UNAVAILABLE'
        ? reportsUi.unavailable
        : reportsUi.resolved;
    case 'decision':
      return value === 'APPROVED' ? reportsUi.approved : reportsUi.rejected;
    default:
      return String(value);
  }
}
export interface ReportTable {
  columns: ReportColumn[];
  rows: ReportRow[];
  title: string;
}
export interface ReportMetric {
  label: string;
  value: string | number;
  kind: ColumnKind;
  domain: 'current' | 'period';
}
export interface ReportChart {
  table: ReportTable;
  labels: string[];
  series: {
    label: string;
    kind: ColumnKind;
    values: (string | number | null)[];
  }[];
  type: 'bar' | 'line';
}
export interface ReportResult {
  period: ReportPeriod;
  measures: string;
  main: ReportTable;
  breakdowns: ReportTable[];
  metrics: ReportMetric[];
  chart: ReportChart | null;
}
export interface RecordResult {
  period: ReportPeriod | null;
  main: ReportTable;
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportOptions {
  sites: { id: number; name: string }[];
  categories: { id: number; name: string }[];
  creators: { id: number; name: string }[];
}
