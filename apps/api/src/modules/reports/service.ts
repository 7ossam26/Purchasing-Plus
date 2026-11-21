import {
  cairoReportPeriod,
  type RecordId,
  type RecordResult,
  type ReportId,
  type ReportResult,
} from '@purchasing-plus/shared';
import { reportsUi as ar } from '@purchasing-plus/shared/i18n/ar';

import { allowed } from '../../middleware/access.js';
import type { Context } from '../access/endpoint.js';

import * as purchasing from './purchasing-repo.js';
import { readRecords } from './records-repo.js';
import * as repo from './repo.js';
import type { RecordFilters, ReportFilters } from './schemas.js';
import { column as c, metric, plot, toTable } from './tables.js';

const request = c('number', 'number');
const site = c('site', 'site');
const category = c('category', 'category');
const stage = c('stage', 'stage', 'stage');
const urgency = c('urgency', 'urgency', 'urgency');
const date = c('date', 'date', 'date');
const item = c('item', 'item');
const supplier = c('supplier', 'supplier');
const actorRole = c('role', 'role', 'text', 'requests.viewTimeline');
const amount = c('amount', 'spending', 'money');
const fee = c('fee', 'deliveryFee', 'money');
const count = c('count', 'count', 'number');
const average = c('average', 'average', 'duration');
const median = c('median', 'median', 'duration');
const unavailable = c('unavailable', 'unavailable', 'number');
const resolved = c('resolved', 'resolved', 'number');
const empty = { metrics: [], breakdowns: [], chart: null };

export async function getReport(
  ctx: Context,
  id: ReportId,
  filters: ReportFilters,
): Promise<ReportResult> {
  const { viewer, tx, now } = ctx;
  const period = cairoReportPeriod(filters, now);
  const base = { period, measures: ar.destinations[id].measures };
  const table = toTable.bind(null, viewer);
  const read = repo.fromScope(tx, viewer, filters);
  const names = allowed(viewer, 'requests.viewSupplierNames');
  const prices = allowed(viewer, 'requests.viewPrices');

  switch (id) {
    case 'requests-overview': {
      const [[kpis], stages, groups, aging] = await repo.overview(
        read,
        period,
        now,
        await repo.agingDays(tx),
      );
      const bySite = table(
        ar.bySite,
        [c('label', 'site'), count],
        groups.filter((r) => r.dimension === 'site'),
      );
      const activity = [
        c('submitted', 'submitted', 'number'),
        c('completed', 'completed', 'number'),
        c('rejected', 'rejectedRequests', 'number'),
        c('cancelled', 'cancelled', 'number'),
      ].flatMap((col) => metric(col, kpis));
      return {
        ...base,
        metrics: [
          ...activity,
          ...metric(c('open', 'open', 'number'), kpis, 'current'),
        ],
        chart: activity.some(({ value }) => Number(value) > 0)
          ? plot(
              table(
                ar.requestActivity,
                [c('label', 'event'), count],
                activity.map(({ label, value }) => ({ label, count: value })),
              ),
              'label',
              ['count'],
            )
          : null,
        breakdowns: [
          bySite,
          table(
            ar.byCategory,
            [c('label', 'category'), count],
            groups.filter((r) => r.dimension === 'category'),
          ),
          table(
            ar.byUrgency,
            [c('label', 'urgency', 'urgency'), count],
            groups.filter((r) => r.dimension === 'urgency'),
          ),
          table(ar.openStages, [stage, count], stages),
        ],
        main: table(
          ar.aging,
          [
            request,
            site,
            category,
            stage,
            urgency,
            c('stageAt', 'stageAt', 'date'),
          ],
          aging,
        ),
      };
    }
    case 'stage-times': {
      const [stages, slowest, overall, [kpis]] = await repo.stageTimes(
        read,
        period,
        now,
      );
      return {
        ...base,
        metrics: [
          c('count', 'requestCount', 'number'),
          average,
          median,
        ].flatMap((col) => metric(col, kpis)),
        chart: plot(
          table(ar.stage, [stage, average, median], overall),
          'stage',
          ['average', 'median'],
        ),
        breakdowns: [
          table(
            ar.stageBreakdown,
            [site, stage, average, median, count],
            stages,
          ),
        ],
        main: table(
          ar.slowest,
          [
            request,
            site,
            c('stage', 'longestStage', 'stage'),
            c('duration', 'duration', 'duration'),
            c('total', 'total', 'duration'),
          ],
          slowest,
        ),
      };
    }
    case 'spending': {
      const month = c('month', 'month');
      const summary = table(
        ar.spending,
        [month, site, category, supplier, amount, fee],
        [],
      );
      if (!prices) return { ...base, ...empty, main: summary };
      const [rows, [kpis, ...months]] = await purchasing.spending(
        read,
        period,
        names,
      );
      return {
        ...base,
        metrics: [amount, fee].flatMap((col) => metric(col, kpis)),
        main: table(
          ar.spending,
          summary.columns,
          rows.map((row) => ({
            ...row,
            supplier: row.supplier ?? ar.supplierUnallocated,
          })),
        ),
        breakdowns: [],
        chart: plot(table(ar.month, [month, amount, fee], months), 'month', [
          'amount',
          'fee',
        ]),
      };
    }
    case 'suppliers': {
      const asked = c('asked', 'asked', 'number'),
        won = c('won', 'won', 'number');
      const rate = c('winRate', 'winRate', 'percent'),
        orders = c('orders', 'ordersSent', 'number');
      const [kpis, ...rows] = await purchasing.suppliers(read, period, names);
      const main = table(
        ar.destinations.suppliers.title,
        [supplier, asked, won, rate, amount, orders],
        names ? rows : kpis ? [kpis] : [],
      );
      return {
        ...base,
        ...empty,
        main,
        metrics: kpis
          ? [asked, won, rate, orders, ...(prices ? [amount] : [])].flatMap(
              (col) => metric(col, kpis),
            )
          : [],
        chart: names
          ? plot(main, 'supplier', ['asked', 'won'])
          : plot(
              table(
                ar.total,
                [c('label', 'total'), asked, won],
                kpis ? [{ ...kpis, label: ar.total }] : [],
              ),
              'label',
              ['asked', 'won'],
            ),
      };
    }
    case 'price-history': {
      const rows = prices
        ? await purchasing.priceHistory(read, period, filters.itemId)
        : [];
      const main = table(
        ar.priceRecords,
        [date, item, c('price', 'price', 'money'), supplier, request],
        rows,
      );
      return {
        ...base,
        ...empty,
        main,
        metrics: prices
          ? metric(c('count', 'priceRecords', 'number'), { count: rows.length })
          : [],
        chart: plot(main, 'date', ['price'], 'line'),
      };
    }
    case 'unavailable': {
      const [rows, [kpis, ...groups]] = await purchasing.unavailable(
        read,
        period,
      );
      const columns = [unavailable, resolved];
      return {
        ...base,
        metrics: columns.flatMap((col) => metric(col, kpis)),
        chart: plot(
          table(
            ar.bySite,
            [site, ...columns],
            groups.filter((r) => r.category === null),
          ),
          'site',
          ['unavailable', 'resolved'],
        ),
        breakdowns: [
          table(
            ar.byCategory,
            [site, category, ...columns],
            groups.filter((r) => r.category !== null),
          ),
        ],
        main: table(
          ar.destinations.unavailable.title,
          [
            date,
            request,
            item,
            site,
            category,
            c('event', 'event', 'event'),
            c('resolver', 'resolver', 'text', 'requests.viewTimeline'),
            actorRole,
          ],
          rows,
        ),
      };
    }
    case 'user-activity': {
      const columns = [
        c('created', 'created', 'number'),
        c('edited', 'edited', 'number'),
        c('managerDecisions', 'managerDecisions', 'number'),
        c('pricingSubmitted', 'pricingSubmitted', 'number'),
        c('pricingDecisions', 'pricingDecisions', 'number'),
        c('received', 'received', 'number'),
      ];
      const [kpis, ...rows] = await purchasing.userActivity(read, period);
      const main = table(
        ar.destinations[id].title,
        [c('actor', 'actor'), ...columns],
        rows,
      );
      return {
        ...base,
        ...empty,
        main,
        metrics: kpis ? columns.flatMap((col) => metric(col, kpis)) : [],
        chart: plot(main, 'actor', ['created', 'received']),
      };
    }
  }
}

export async function getRecords(
  ctx: Context,
  id: RecordId,
  filters: RecordFilters,
): Promise<RecordResult> {
  const period =
    filters.preset || filters.from ? cairoReportPeriod(filters, ctx.now) : null;
  const { rows, total } = await readRecords(
    repo.fromScope(ctx.tx, ctx.viewer, filters),
    id,
    filters,
    period,
    allowed(ctx.viewer, 'requests.viewPrices'),
    allowed(ctx.viewer, 'requests.viewTimeline'),
  );
  const columns = {
    requests: [
      request,
      site,
      category,
      c('creator', 'creator'),
      urgency,
      stage,
      c('createdAt', 'createdAt', 'date'),
      c('submittedAt', 'submittedAt', 'date'),
      c('total', 'total', 'money'),
      fee,
    ],
    receipts: [
      date,
      request,
      item,
      c('quantity', 'quantity', 'number'),
      c('recorder', 'recorder'),
      site,
      category,
    ],
    approvals: [
      date,
      request,
      c('round', 'round', 'number'),
      c('decision', 'decision', 'decision'),
      c('decisionActor', 'decisionActor'),
      actorRole,
      c('total', 'roundTotal', 'money'),
      fee,
      site,
      category,
    ],
  };
  return {
    period,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    main: toTable(ctx.viewer, ar.logs[id].title, columns[id], rows),
  };
}

export function getOptions({ tx, viewer }: Context) {
  return repo.options(tx, viewer);
}

export function findItems(
  { tx, viewer }: Context,
  filters: repo.ReportScope & { q: string; itemId?: number },
) {
  return repo.matchingItems(tx, viewer, filters, filters.q, filters.itemId);
}
