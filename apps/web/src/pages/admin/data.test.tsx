import { type DataPreview } from '@purchasing-plus/shared';
import { dataUi as copy } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';

const valid: DataPreview = { create: 2, update: 1, errors: [] };
const invalid: DataPreview = {
  create: 0,
  update: 0,
  errors: [
    {
      row: 4,
      column: 'whatsappNumber',
      message: 'رقم غير صالح.',
      fix: 'اكتب رقم موبايل مصري.',
    },
  ],
};

function setup(
  keys: PermissionKey[],
  transfer: (path: string, options?: RequestInit) => Response,
) {
  const fetch = vi.fn(async (path: string, options?: RequestInit) =>
    path === '/api/v1/me'
      ? Response.json({
          user: { id: 1, name: 'حسن', username: 'hassan' },
          roleName: 'حساب تجربة',
          roleId: 1,
          isSuperadmin: false,
          siteScope: 'ALL',
          sites: [],
          permissions: keys,
        })
      : transfer(path, options),
  );
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, {
    initialEntries: ['/admin/data'],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fetch;
}

function drop(filename: string) {
  fireEvent.drop(screen.getByRole('button', { name: copy.selectFile }), {
    dataTransfer: { files: [new File(['contents'], filename)] },
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('previews the selected entity, shows the repair, and commits only the replacement file', async () => {
  const checks: string[] = [];
  const commits: string[] = [];
  setup(['data.import', 'data.export'], (path, options) => {
    const file = (options?.body as FormData).get('file') as File;
    expect(new Headers(options?.headers).has('Content-Type')).toBe(false);
    if (path.endsWith('suppliers/preview')) {
      checks.push(file.name);
      return Response.json(file.name === 'bad.csv' ? invalid : valid);
    }
    expect(path).toBe('/api/v1/data/import/suppliers/commit');
    commits.push(file.name);
    return Response.json(valid);
  });
  await screen.findByRole('heading', { name: copy.how });
  expect(
    within(screen.getByRole('list')).getAllByRole('listitem'),
  ).toHaveLength(3);
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  fireEvent.click(screen.getByRole('tab', { name: copy.entities.suppliers }));
  drop('bad.csv');
  const errors = await screen.findByRole('region', { name: copy.errors });
  expect(within(errors).getByText('4')).toBeTruthy();
  expect(within(errors).getByText(copy.columns.whatsappNumber)).toBeTruthy();
  expect(within(errors).getByText('اكتب رقم موبايل مصري.')).toBeTruthy();
  const importButton = screen.getByRole<HTMLButtonElement>('button', {
    name: copy.import,
  });
  expect(importButton.disabled).toBe(true);
  fireEvent.click(importButton);
  expect(commits).toEqual([]);

  drop('fixed.xlsx');
  await screen.findByText(copy.ready);
  expect(screen.queryByRole('region', { name: copy.errors })).toBeNull();
  expect(screen.getByText('2')).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: copy.import })
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: copy.import }));
  await screen.findByText(copy.success);
  expect(checks).toEqual(['bad.csv', 'fixed.xlsx']);
  expect(commits).toEqual(['fixed.xlsx']);
});

it('hides import actions for export-only viewers and downloads the active tab', async () => {
  const fetch = setup(['data.export'], () => new Response('xlsx'));
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    }),
  );
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  await screen.findByRole('heading', { name: copy.title });
  expect(screen.queryByRole('button', { name: copy.selectFile })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.template })).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: copy.entities.sites }));
  fireEvent.click(screen.getByRole('button', { name: copy.export }));
  await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/v1/data/export/sites');
  expect(click.mock.instances[0]).toHaveProperty('download', 'sites.xlsx');
});
