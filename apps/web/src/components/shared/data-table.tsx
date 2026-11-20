import { ar } from '@purchasing-plus/shared/i18n/ar';
import type { Key, ReactNode } from 'react';

import { Button } from '../ui/button.js';
import { EmptyState, Skeleton } from '../ui/states.js';
export interface TableColumn<Row> {
  id: string;
  header: string;
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}
export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  actions,
  loading,
  filtered,
  dense,
  emptyMessage,
  filteredMessage,
  error,
  onReset,
  onRetry,
}: {
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => Key;
  actions?: (row: Row) => ReactNode;
  loading?: boolean;
  filtered?: boolean;
  dense?: boolean;
  emptyMessage: string;
  filteredMessage?: string;
  error?: { message: string; fix?: string };
  onReset?: () => void;
  onRetry?: () => void;
}) {
  const span = columns.length + Number(Boolean(actions));
  const padding = dense ? 'px-2 py-1' : 'px-4 py-3';
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="max-h-[60dvh] overflow-auto rounded-panel border border-seam bg-paper"
    >
      <table
        className={`w-full border-separate border-spacing-0 text-start ${dense ? 'text-small' : 'min-w-[28rem]'}`}
        aria-busy={loading || undefined}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-plaster text-small">
          <tr>
            {columns.map((column) => (
              <th
                scope="col"
                key={column.id}
                className={`border-b border-seam ${padding} ${column.numeric ? 'text-end' : 'text-start'}`}
              >
                {column.header}
              </th>
            ))}
            {actions && (
              <th
                scope="col"
                className={`border-b border-seam text-end ${padding}`}
              >
                {ar.common.actions}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {error && (
            <tr>
              <td colSpan={span} className="border-b border-seam p-4">
                <div role="alert">
                  <p className="font-semibold text-danger-fg">
                    {error.message}
                  </p>
                  {error.fix && (
                    <p className="text-small text-concrete">{error.fix}</p>
                  )}
                </div>
                {onRetry && (
                  <Button
                    className="mt-2"
                    variant="secondary"
                    onClick={onRetry}
                  >
                    {ar.common.retry}
                  </Button>
                )}
              </td>
            </tr>
          )}
          {loading && (
            <tr>
              <td colSpan={span} className="p-4">
                <div
                  role="status"
                  className="grid gap-2 text-small text-concrete"
                >
                  <span>{ar.common.loading}</span>
                  <Skeleton className="w-3/4" />
                </div>
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-plaster">
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={`border-b border-seam ${padding} ${column.numeric ? 'numeric text-end' : 'text-start'}`}
                >
                  {column.cell(row)}
                </td>
              ))}
              {actions && (
                <td className={`border-b border-seam text-end ${padding}`}>
                  {actions(row)}
                </td>
              )}
            </tr>
          ))}
          {!rows.length && !loading && !error && (
            <tr>
              <td colSpan={span}>
                <EmptyState
                  title={
                    filtered ? (filteredMessage ?? emptyMessage) : emptyMessage
                  }
                  action={
                    filtered &&
                    onReset && (
                      <Button variant="secondary" onClick={onReset}>
                        {ar.common.resetFilters}
                      </Button>
                    )
                  }
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
