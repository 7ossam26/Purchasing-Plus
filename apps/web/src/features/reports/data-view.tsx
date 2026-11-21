import {
  formatReportValue,
  type ReportColumn,
  type ReportRow,
  type ReportTable,
} from '@purchasing-plus/shared';
import { ar, reportsUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { type DisplayStatus } from '@purchasing-plus/shared/lifecycle';
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '../../components/ui/button.js';
import { StatusChip } from '../../components/ui/chip.js';
import { EmptyState, Skeleton } from '../../components/ui/states.js';
import { ApiError } from '../../lib/api/client.js';
import { reportsApi, type Filters } from '../../lib/api/reports.js';

export function ReportLoading() {
  return (
    <div
      role="status"
      aria-label={ar.common.loading}
      className="grid gap-3 p-4"
    >
      <Skeleton className="w-1/3" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function ReportError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div role="alert" className="rounded-panel border border-seam bg-paper">
      <EmptyState
        title={error.message}
        description={error instanceof ApiError ? error.fix : undefined}
        action={
          <Button variant="secondary" onClick={retry}>
            {ar.common.retry}
          </Button>
        }
      />
    </div>
  );
}

export function displayValue(
  value: ReportRow[string] | undefined,
  kind: ReportColumn['kind'],
) {
  if (typeof value === 'string' && (kind === 'stage' || kind === 'urgency'))
    return <StatusChip status={value as DisplayStatus} />;
  return formatReportValue(value, kind);
}

export function DataTable({
  table,
  empty = copy.noData,
  showTitle = true,
}: {
  table: ReportTable;
  empty?: string;
  showTitle?: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-panel border border-seam bg-paper">
      {showTitle && <h2 className="px-4 py-3 text-section">{table.title}</h2>}
      {table.rows.length ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={table.title}
          className="max-h-[32rem] overflow-auto"
        >
          <table className="w-full border-collapse text-start text-small">
            <thead className="sticky top-0 z-10 bg-plaster">
              <tr>
                {table.columns.map((column) => (
                  <th
                    scope="col"
                    key={column.key}
                    className="whitespace-nowrap border-b border-seam px-4 py-3 text-start"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr
                  key={index}
                  className="border-b border-seam last:border-b-0 hover:bg-neutral-bg"
                >
                  {table.columns.map(({ key, kind }) => (
                    <td
                      key={key}
                      className="whitespace-nowrap px-4 py-2 tabular-nums"
                    >
                      {key === 'number' && row.requestId ? (
                        <Link
                          to={'/requests/' + row.requestId}
                          className="inline-flex min-h-target items-center font-semibold text-ppr-deep underline underline-offset-4"
                        >
                          <bdi>{row.number ?? copy.openRequest}</bdi>
                        </Link>
                      ) : (
                        <bdi>{displayValue(row[key], kind)}</bdi>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={empty} description={copy.clearFilters} />
      )}
    </section>
  );
}

export function ExportButton({
  area,
  id,
  filters,
}: {
  area: Parameters<typeof reportsApi.export>[0];
  id: Parameters<typeof reportsApi.export>[1];
  filters: Filters;
}) {
  const exportFile = useMutation({
    mutationFn: () => reportsApi.export(area, id, filters),
    onSuccess: (file) => {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = id + '.xlsx';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    },
  });
  return (
    <div className="grid gap-1">
      <Button
        loading={exportFile.isPending}
        variant="secondary"
        onClick={() => exportFile.mutate()}
      >
        <Download size={20} aria-hidden="true" />
        {exportFile.isPending ? copy.exporting : copy.export}
      </Button>
      {exportFile.error && (
        <p role="alert" className="text-small text-danger-fg">
          {exportFile.error.message}{' '}
          {exportFile.error instanceof ApiError && exportFile.error.fix}
        </p>
      )}
    </div>
  );
}
