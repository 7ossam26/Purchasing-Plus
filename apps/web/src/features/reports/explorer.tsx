import {
  formatDate,
  formatNumber,
  type RecordId,
  type ReportId,
  type ReportOptions,
  type ReportPeriod,
} from '@purchasing-plus/shared';
import { reportsUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { useCan, useSession } from '../../app/session.js';
import { RecordManager } from '../../components/shared/record-manager.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { EmptyState } from '../../components/ui/states.js';
import { reportsApi, type Filters } from '../../lib/api/reports.js';

import { ReportPlot } from './chart.js';
import {
  DataTable,
  displayValue,
  ExportButton,
  ReportError,
  ReportLoading,
} from './data-view.js';
import { FilterForm, ItemPicker } from './filters.js';

function periodLabel(period: ReportPeriod | null) {
  return period
    ? copy.dates(
        formatDate(period.start),
        formatDate(Date.parse(period.endExclusive) - 1),
      )
    : copy.anyPeriod;
}

function exportFilters(filters: Filters, period: ReportPeriod | null): Filters {
  return period
    ? { ...filters, preset: 'custom', from: period.from, to: period.to }
    : filters;
}

function WithOptions({
  children,
}: {
  children: (
    options: ReportOptions,
    allSites: boolean,
    site: string,
  ) => ReactNode;
}) {
  const { profile } = useSession();
  const options = useQuery({
    queryKey: [
      'reports',
      'options',
      profile?.user.id,
      profile?.siteScope,
      profile?.sites.map((site) => site.id),
    ],
    queryFn: ({ signal }) => reportsApi.options(signal),
  });
  const allSites = profile?.isSuperadmin || profile?.siteScope === 'ALL';
  if (options.error)
    return (
      <ReportError error={options.error} retry={() => void options.refetch()} />
    );
  if (!options.data) return <ReportLoading />;
  const site = allSites ? '' : String(options.data.sites[0]?.id ?? '');
  if (!allSites && !site) return <EmptyState title={copy.noSites} />;
  return children(options.data, allSites, site);
}

function filterScope(options: ReportOptions, allSites: boolean) {
  return allSites ? 'all' : options.sites.map(({ id }) => id).join(',');
}

export function ReportExplorer({ id }: { id: ReportId }) {
  return (
    <WithOptions>
      {(options, allSites, site) => (
        <ReportContent
          key={id + ':' + filterScope(options, allSites)}
          {...{ id, options, allSites, site }}
        />
      )}
    </WithOptions>
  );
}

function ReportContent({
  id,
  options,
  allSites,
  site,
}: {
  id: ReportId;
  options: ReportOptions;
  allSites: boolean;
  site: string;
}) {
  const initial = { preset: 'thisMonth', siteId: site };
  const [filters, setFilters] = useState<Filters>(initial);
  const canExport = useCan('reports.export');
  const prices = useCan('requests.viewPrices');
  const suppliers = useCan('requests.viewSupplierNames');
  const timeline = useCan('requests.viewTimeline');
  const priceHistory = id === 'price-history';
  const permitted = prices || (id !== 'spending' && !priceHistory);
  const report = useQuery({
    queryKey: [
      'reports',
      id,
      filters,
      prices,
      suppliers,
      timeline,
      filterScope(options, allSites),
    ],
    queryFn: ({ signal }) => reportsApi.report(id, filters, signal),
    enabled: permitted && (!priceHistory || !!filters.itemId),
  });
  const data = report.data;
  const { title, measures } = copy.destinations[id];

  return (
    <section className="grid min-w-0 gap-4">
      <header className="grid gap-2">
        <Link
          to="/reports"
          className={buttonClass('ghost') + ' justify-self-start'}
        >
          <ChevronRight size={20} aria-hidden="true" />
          {copy.back}
        </Link>
        <h1 className="text-title sm:text-title-wide">{title}</h1>
        <p className="max-w-prose text-small text-concrete">
          {data?.measures ?? measures}
        </p>
        {data && (
          <p className="text-small font-semibold tabular-nums">
            {periodLabel(data.period)}
          </p>
        )}
      </header>
      <FilterForm
        {...{ options, allSites, initial }}
        apply={(next) =>
          setFilters((current) => ({
            ...next,
            itemId:
              current.siteId === next.siteId &&
              current.categoryId === next.categoryId
                ? (current.itemId ?? '')
                : '',
          }))
        }
      />
      {priceHistory && prices && (
        <ItemPicker
          key={filters.siteId + ':' + filters.categoryId}
          filters={filters}
          select={(itemId) => setFilters((current) => ({ ...current, itemId }))}
        />
      )}
      {!permitted && <EmptyState title={copy.pricesHidden} />}
      {priceHistory && prices && !filters.itemId && (
        <EmptyState title={copy.selectItem} />
      )}
      {report.isLoading && <ReportLoading />}
      {report.error && (
        <ReportError error={report.error} retry={() => void report.refetch()} />
      )}
      {data && !report.error && (
        <>
          {data.metrics.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {data.metrics.map(({ label, value, kind, domain }) => (
                <div
                  key={label}
                  className="grid content-start gap-1 rounded-panel border border-seam bg-paper p-3"
                >
                  <dt className="text-small font-semibold">{label}</dt>
                  <dd className="text-section tabular-nums">
                    <bdi>{displayValue(value, kind)}</bdi>
                  </dd>
                  <dd className="text-micro text-concrete">
                    {domain === 'current' ? copy.current : copy.during}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {canExport && (
            <div className="justify-self-start">
              <ExportButton
                area="reports"
                id={id}
                filters={exportFilters(filters, data.period)}
              />
            </div>
          )}
          {data.chart && (
            <>
              <ReportPlot chart={data.chart} />
              {data.chart.table.title !== data.main.title && (
                <DataTable table={data.chart.table} />
              )}
            </>
          )}
          {data.breakdowns
            .filter(
              (table) =>
                table.rows.length && table.title !== data.chart?.table.title,
            )
            .map((table) => (
              <DataTable key={table.title} table={table} />
            ))}
          {id === 'requests-overview' && !data.chart && (
            <EmptyState title={copy.noData} />
          )}
          <DataTable
            table={data.main}
            empty={id === 'requests-overview' ? copy.noOverdue : copy.noData}
          />
        </>
      )}
    </section>
  );
}

export function RecordExplorer({ id }: { id: RecordId }) {
  return (
    <WithOptions>
      {(options, allSites, site) => (
        <RecordContent
          key={id + ':' + filterScope(options, allSites)}
          {...{ id, options, allSites, site }}
        />
      )}
    </WithOptions>
  );
}

function RecordContent({
  id,
  options,
  allSites,
  site,
}: {
  id: RecordId;
  options: ReportOptions;
  allSites: boolean;
  site: string;
}) {
  const { title, description } = copy.logs[id];
  const initial = { siteId: site };
  const [filters, setFilters] = useState<Filters>(initial);
  const [page, setPage] = useState(1);
  const canExport = useCan('reports.export');
  const prices = useCan('requests.viewPrices');
  const timeline = useCan('requests.viewTimeline');
  const records = useQuery({
    queryKey: [
      'reports',
      'records',
      id,
      filters,
      page,
      prices,
      timeline,
      filterScope(options, allSites),
    ],
    queryFn: ({ signal }) =>
      reportsApi.records(id, { ...filters, page: String(page) }, signal),
  });
  const data = records.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <RecordManager title={title} parent="/reports">
      <p className="text-small text-concrete">{description}</p>
      <FilterForm
        record={id}
        {...{ options, allSites, initial }}
        apply={(next) => {
          setFilters(next);
          setPage(1);
        }}
      />
      {records.isLoading && <ReportLoading />}
      {records.error && (
        <ReportError
          error={records.error}
          retry={() => void records.refetch()}
        />
      )}
      {data && !records.error && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small font-semibold tabular-nums">
              {periodLabel(data.period)}
            </p>
            {canExport && (
              <ExportButton
                area="records"
                id={id}
                filters={exportFilters(filters, data.period)}
              />
            )}
          </div>
          <DataTable
            table={data.main}
            empty={copy.noRecords}
            showTitle={false}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-small">
            <p aria-live="polite" className="tabular-nums">
              {copy.pageSummary(
                formatNumber(page),
                formatNumber(pages),
                formatNumber(data.total),
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                {copy.previous}
              </Button>
              <Button
                variant="secondary"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                {copy.next}
              </Button>
            </div>
          </div>
        </>
      )}
    </RecordManager>
  );
}
