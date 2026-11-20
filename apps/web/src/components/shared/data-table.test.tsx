import { ar, uiPreview } from '@purchasing-plus/shared/i18n/ar';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { DataTable } from './data-table.js';

afterEach(cleanup);
it('renders loading, populated, empty, filtered and error rows with recovery', () => {
  const rows = [{ id: 1, name: uiPreview.exampleA }];
  const props = {
    caption: uiPreview.table,
    columns: [
      {
        id: 'name',
        header: uiPreview.name,
        cell: (row: (typeof rows)[number]) => row.name,
      },
    ],
    rowKey: (row: (typeof rows)[number]) => row.id,
    emptyMessage: uiPreview.noRows,
    filteredMessage: uiPreview.filtered,
  };
  const { rerender } = render(<DataTable {...props} rows={[]} loading />);
  expect(screen.getByRole('status').textContent).toContain(ar.common.loading);
  expect(screen.queryByText(uiPreview.noRows)).toBeNull();
  rerender(<DataTable {...props} rows={rows} />);
  expect(screen.getByRole('cell', { name: uiPreview.exampleA })).toBeTruthy();
  rerender(<DataTable {...props} rows={[]} />);
  expect(screen.getByText(uiPreview.noRows)).toBeTruthy();
  const onReset = vi.fn();
  rerender(<DataTable {...props} rows={[]} filtered onReset={onReset} />);
  expect(screen.getByText(uiPreview.filtered)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ar.common.resetFilters }));
  expect(onReset).toHaveBeenCalledOnce();
  const onRetry = vi.fn();
  rerender(
    <DataTable
      {...props}
      rows={rows}
      error={{ message: uiPreview.error, fix: ar.common.networkFix }}
      onRetry={onRetry}
    />,
  );
  expect(screen.getByRole('alert').textContent).toContain(ar.common.networkFix);
  expect(screen.getByRole('cell', { name: uiPreview.exampleA })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ar.common.retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});
