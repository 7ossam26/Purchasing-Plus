import { admin, ar } from '@purchasing-plus/shared/i18n/ar';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type {
  EngineerOption,
  Site,
  SiteEngineer,
} from '../../lib/api/sites.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const copy = admin.siteManager;
const east: Site = { id: 5, name: 'شرق', address: 'التجمع', isActive: true };
const north: Site = { id: 6, name: 'شمال', address: '', isActive: false };
const options: EngineerOption[] = [
  {
    id: 31,
    name: 'أحمد',
    username: 'ahmed',
    sites: [{ id: 7, name: 'المعادي' }],
  },
  { id: 32, name: 'منى', username: 'mona', sites: [] },
];
const current: SiteEngineer[] = [
  { id: 21, name: 'كريم', username: 'karim', isActive: true, canManage: true },
  { id: 22, name: 'سامي', username: 'sami', isActive: true, canManage: false },
  { id: 23, name: 'هالة', username: 'hala', isActive: false, canManage: true },
];
const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 10,
  total: items.length,
});
const manage: PermissionKey[] = [
  'masterData.view',
  'sites.view',
  'sites.create',
  'sites.edit',
  'users.manage',
];

function setup(
  permissions: PermissionKey[] = manage,
  siteScope: 'ALL' | 'ASSIGNED' = 'ALL',
) {
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = init?.method ?? 'GET';
    if (path === '/me')
      return Response.json({
        user: { id: 9, name: 'حسن', username: 'hassan' },
        roleName: 'حساب تجربة',
        isSuperadmin: false,
        siteScope,
        sites: siteScope === 'ALL' ? [] : [east],
        permissions,
      });
    if (method === 'GET' && path === '/sites')
      return Response.json({ ...page([east, north]), pageSize: 25 });
    if (method === 'GET' && path === '/sites/engineers') {
      const search = url.searchParams.get('search') ?? '';
      return Response.json(
        page(
          options.filter(
            (option) =>
              option.name.includes(search) || option.username.includes(search),
          ),
        ),
      );
    }
    if (method === 'GET' && /^\/sites\/\d+\/engineers$/.test(path))
      return Response.json({
        items: path.startsWith('/sites/5/') ? current : [current[0]],
      });
    if (method === 'POST' && path === '/sites')
      return Response.json(
        { id: 40, isActive: true, ...JSON.parse(String(init?.body)) },
        { status: 201 },
      );
    if (method === 'PATCH' && path.startsWith('/sites/'))
      return Response.json({ ...east, ...JSON.parse(String(init?.body)) });
    throw new Error('Unexpected ' + method + ' ' + path);
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, {
    initialEntries: ['/master-data/sites'],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const body = (method: string) =>
    JSON.parse(
      String(
        fetch.mock.calls.find(([, init]) => init?.method === method)?.[1]?.body,
      ),
    ) as Record<string, unknown>;
  const engineerCalls = () =>
    fetch.mock.calls.filter(([input]) => String(input).includes('/engineers'));
  return { fetch, body, engineerCalls };
}
async function open(label: string) {
  fireEvent.click((await screen.findAllByRole('button', { name: label }))[0]!);
  return within(await screen.findByRole('dialog'));
}

it('creates a site with engineers picked through search', async () => {
  const { body } = setup();
  const dialog = await open(copy.add);
  fireEvent.change(dialog.getByLabelText(admin.name), {
    target: { value: 'الجنوب' },
  });
  expect(dialog.getByRole('heading', { name: copy.engineers })).toBeTruthy();
  expect(dialog.getByText(copy.noEngineers)).toBeTruthy();
  expect(await dialog.findByRole('button', { name: /منى/ })).toBeTruthy();
  fireEvent.change(dialog.getByLabelText(copy.searchEngineers), {
    target: { value: 'أحمد' },
  });
  await waitFor(() =>
    expect(dialog.queryByRole('button', { name: /منى/ })).toBeNull(),
  );
  const ahmed = await dialog.findByRole('button', { name: /أحمد/ });
  // Existing assignments elsewhere are shown, so it is clear they are kept.
  expect(ahmed.textContent).toContain(copy.alsoAt('المعادي'));
  expect(ahmed.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(ahmed);
  expect(ahmed.getAttribute('aria-pressed')).toBe('true');
  expect(
    dialog.getByRole('button', { name: copy.unassign('أحمد') }),
  ).toBeTruthy();
  fireEvent.change(dialog.getByLabelText(copy.searchEngineers), {
    target: { value: '' },
  });
  fireEvent.click(await dialog.findByRole('button', { name: /منى/ }));
  fireEvent.click(dialog.getByRole('button', { name: copy.unassign('منى') }));
  expect(
    dialog.getByRole('button', { name: /منى/ }).getAttribute('aria-pressed'),
  ).toBe('false');
  expect((await axe(document.body)).violations).toEqual([]);
  fireEvent.click(dialog.getByRole('button', { name: ar.common.save }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(body('POST')).toEqual({
    name: 'الجنوب',
    address: '',
    engineerIds: [31],
  });
});

it('shows current assignments and saves only the additions and removals', async () => {
  const { body } = setup();
  const dialog = await open(admin.edit);
  expect(await dialog.findByText('كريم')).toBeTruthy();
  // An engineer outside the viewer's grant is listed without a remove control.
  expect(dialog.getByText('سامي').parentElement?.textContent).toContain(
    copy.outOfReach,
  );
  expect(
    dialog.queryByRole('button', { name: copy.unassign('سامي') }),
  ).toBeNull();
  expect(dialog.getByText('هالة').parentElement?.textContent).toContain(
    admin.inactive,
  );
  fireEvent.click(dialog.getByRole('button', { name: copy.unassign('كريم') }));
  expect(dialog.queryByText('كريم')).toBeNull();
  fireEvent.click(await dialog.findByRole('button', { name: /أحمد/ }));
  fireEvent.click(dialog.getByRole('button', { name: admin.saveChanges }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(body('PATCH')).toEqual({
    name: east.name,
    address: east.address,
    engineers: { add: [31], remove: [21] },
  });
});

it('keeps removals but not additions on an inactive site', async () => {
  const { engineerCalls } = setup();
  fireEvent.click(
    (await screen.findAllByRole('button', { name: admin.edit }))[1]!,
  );
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.click(
    await dialog.findByRole('button', { name: copy.unassign('كريم') }),
  );
  expect(dialog.getByText(copy.noEngineers)).toBeTruthy();
  expect(dialog.getByText(copy.inactiveSite)).toBeTruthy();
  expect(dialog.queryByLabelText(copy.searchEngineers)).toBeNull();
  expect(
    engineerCalls().some(([input]) =>
      String(input).includes('/sites/engineers'),
    ),
  ).toBe(false);
});

it('hides engineer assignment without users.manage or a reachable new site', async () => {
  const { body, engineerCalls } = setup(
    manage.filter((key) => key !== 'users.manage'),
  );
  let dialog = await open(copy.add);
  expect(dialog.queryByRole('heading', { name: copy.engineers })).toBeNull();
  fireEvent.change(dialog.getByLabelText(admin.name), {
    target: { value: 'بدون مهندسين' },
  });
  fireEvent.click(dialog.getByRole('button', { name: ar.common.save }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(body('POST')).toEqual({ name: 'بدون مهندسين', address: '' });
  fireEvent.click(screen.getAllByRole('button', { name: admin.edit })[0]!);
  dialog = within(await screen.findByRole('dialog'));
  expect(dialog.queryByRole('heading', { name: copy.engineers })).toBeNull();
  expect(engineerCalls()).toHaveLength(0);
  cleanup();
  // An assigned-scope viewer cannot reach a new site, but can manage its own sites.
  setup(manage, 'ASSIGNED');
  dialog = await open(copy.add);
  expect(dialog.queryByRole('heading', { name: copy.engineers })).toBeNull();
  cleanup();
  setup(manage, 'ASSIGNED');
  dialog = await open(admin.edit);
  expect(
    await dialog.findByRole('heading', { name: copy.engineers }),
  ).toBeTruthy();
});
