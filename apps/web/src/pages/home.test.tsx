import {
  defaultSettings,
  recordDestinations,
  reportDestinations,
} from '@purchasing-plus/shared';
import {
  admin,
  ar,
  reportsUi,
  requestUi,
  uiPreview,
} from '@purchasing-plus/shared/i18n/ar';
import {
  itemStates,
  openItem,
  statusMap,
} from '@purchasing-plus/shared/lifecycle';
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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { createQueryClient } from '../app/query.js';
import { AppProviders, routes } from '../app/routes.js';
import { useCan, useCanOnSite } from '../app/session.js';
import { Button } from '../components/ui/button.js';
import type { SessionProfile } from '../lib/api/auth.js';
import type { RequestDto } from '../lib/api/requests.js';

const profile: SessionProfile = {
  user: { id: 1, name: 'حسن', username: 'hassan' },
  roleName: 'حساب تجربة',
  roleId: 1,
  isSuperadmin: false,
  siteScope: 'ASSIGNED',
  sites: [{ id: 1, name: uiPreview.exampleA, isActive: true }],
  permissions: ['users.view'],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const json = (data: unknown, status = 200) => Response.json(data, { status });
function setup(
  url: string,
  handler: (
    path: string,
    request: RequestInit | undefined,
  ) => Response | Promise<Response>,
) {
  const fetch = vi.fn((path: string, request?: RequestInit) =>
    Promise.resolve(handler(path, request)),
  );
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, fetch };
}
function loginForm() {
  fireEvent.change(screen.getByLabelText(ar.auth.username), {
    target: { value: 'hassan' },
  });
  fireEvent.change(screen.getByLabelText(ar.auth.password), {
    target: { value: 'test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: ar.auth.login }));
}

describe('reports hub', () => {
  it.each(reportDestinations)(
    'shows the %s tile only to a holder of its key',
    async (id, key) => {
      setup('/reports', (path) =>
        path.endsWith('/me')
          ? json({ ...profile, permissions: ['requests.view', key] })
          : json({ items: [] }),
      );
      await screen.findByRole('heading', { name: reportsUi.title });
      const tiles = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/reports/'));
      expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual([
        '/reports/' + id,
      ]);
      expect(tiles[0]?.textContent).toContain(reportsUi.destinations[id].title);
    },
  );

  it('shows all three logs to a holder of records.view and hides the report tiles', async () => {
    setup('/reports', (path) =>
      path.endsWith('/me')
        ? json({ ...profile, permissions: ['requests.view', 'records.view'] })
        : json({ items: [] }),
    );
    await screen.findByRole('heading', { name: reportsUi.records });
    const tiles = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/reports/'));
    expect(tiles.map((tile) => tile.getAttribute('href'))).toEqual(
      recordDestinations.map(([id]) => '/reports/records/' + id),
    );
  });

  it('does not expose the hub or allow access to a different report through a direct link', async () => {
    const { router } = setup('/', () => json(profile));
    await screen.findByRole('heading', { name: ar.navigation.modules });
    expect(
      screen.queryByRole('link', { name: new RegExp(reportsUi.title) }),
    ).toBeNull();
    await router.navigate('/reports/price-history');
    await screen.findByRole('heading', { name: ar.errors.denied });
  });

  it('applies record filters, resets paging, and keeps the Excel action permission gated', async () => {
    const { fetch } = setup('/reports/records/requests', (path) => {
      if (path.endsWith('/me'))
        return json({
          ...profile,
          permissions: ['requests.view', 'records.view'],
        });
      if (path.endsWith('/reports/options'))
        return json({
          sites: [{ id: 1, name: 'المعادي' }],
          categories: [],
          creators: [],
        });
      if (path.includes('/records/requests?')) {
        const params = new URL(path, 'http://localhost').searchParams;
        return json({
          total: params.has('q') ? 0 : 60,
          page: Number(params.get('page')),
          pageSize: 30,
          period: null,
          main: { title: reportsUi.logs.requests.title, columns: [], rows: [] },
        });
      }
      return json({ items: [] });
    });
    fireEvent.click(
      await screen.findByRole('button', { name: reportsUi.next }),
    );
    await waitFor(() =>
      expect(fetch.mock.calls.some(([path]) => path.includes('page=2'))).toBe(
        true,
      ),
    );
    fireEvent.change(screen.getByLabelText(reportsUi.searchNumber), {
      target: { value: '2026-001' },
    });
    fireEvent.click(screen.getByRole('button', { name: reportsUi.apply }));
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([path]) => path.includes('q=2026-001') && path.includes('page=1'),
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole('button', { name: reportsUi.export })).toBeNull();
    expect(screen.getByLabelText(reportsUi.site).textContent).not.toContain(
      reportsUi.allSites,
    );
  });
});

describe('session and protected routes', () => {
  it('redirects a signed-out visitor and resumes the full requested URL after login', async () => {
    let loggedIn = false;
    const returnTo = '/admin/users?page=2#results';
    const { router, fetch } = setup(returnTo, (path, req) => {
      if (path === '/api/v1/auth/login') {
        expect(req?.credentials).toBe('include');
        expect(JSON.parse(String(req?.body))).toEqual({
          username: 'hassan',
          password: 'test-password',
        });
        loggedIn = true;
        return new Response(null, { status: 204 });
      }
      return loggedIn ? json(profile) : json({}, 401);
    });
    await screen.findByRole('heading', { name: ar.auth.title });
    expect(
      new URLSearchParams(router.state.location.search).get('returnTo'),
    ).toBe(returnTo);
    loginForm();
    expect(
      await screen.findByRole('heading', { name: 'المستخدمون' }),
    ).toBeTruthy();
    expect(router.state.location).toMatchObject({
      pathname: '/admin/users',
      search: '?page=2',
      hash: '#results',
    });
    expect(
      fetch.mock.calls.filter(([path]) => path.endsWith('/me')),
    ).toHaveLength(2);
  });
  it('shows Access denied with both exits without the route content', async () => {
    setup('/admin/roles', () => json(profile));
    expect(
      await screen.findByRole('heading', { name: ar.errors.denied }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: ar.errors.returnHome }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: ar.common.back })).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'الأدوار والصلاحيات' }),
    ).toBeNull();
  });
  it('shows Not found for an unknown URL', async () => {
    setup('/absent', () => json(profile));
    expect(
      await screen.findByRole('heading', { name: ar.errors.notFound }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: ar.errors.returnHome }),
    ).toBeTruthy();
  });
  it('only renders permitted home modules without disabled permission controls', async () => {
    setup('/', () => json(profile));
    expect(
      await screen.findByRole('heading', { name: ar.appName }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /المستخدمون/ })).toBeTruthy();
    expect(screen.queryByText('الأدوار والصلاحيات')).toBeNull();
    expect(screen.queryByText('التكويدات')).toBeNull();
    expect(
      screen.queryByRole('button', { name: admin.siteManager.add }),
    ).toBeNull();
  });
  it('creates a site directly from home with the create permission', async () => {
    const { router, fetch } = setup('/', (path, request) => {
      if (path.endsWith('/me'))
        return json({ ...profile, permissions: ['sites.create'] });
      if (path === '/api/v1/sites' && request?.method === 'POST')
        return json(
          { id: 2, name: uiPreview.exampleB, address: '', isActive: true },
          201,
        );
      return json({ items: [] });
    });
    fireEvent.click(
      await screen.findByRole('button', { name: admin.siteManager.add }),
    );
    const form = within(
      screen.getByRole('dialog', { name: admin.siteManager.add }),
    );
    fireEvent.change(form.getByLabelText(admin.name), {
      target: { value: uiPreview.exampleB },
    });
    fireEvent.click(form.getByRole('button', { name: ar.common.save }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/sites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: uiPreview.exampleB, address: '' }),
      }),
    );
    expect(router.state.location.pathname).toBe('/');
  });
  it('uses both the permission and site assignment in conditional controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(json(profile))),
    );
    function Controls() {
      const users = useCan('users.view');
      const manage = useCan('users.manage');
      const local = useCanOnSite('users.view', 1);
      const elsewhere = useCanOnSite('users.view', 2);
      return (
        <>
          {users && <Button>{uiPreview.details}</Button>}
          {manage && <Button>{uiPreview.edit}</Button>}
          {local && <p>{uiPreview.exampleA}</p>}
          {elsewhere && <p>{uiPreview.exampleB}</p>}
        </>
      );
    }
    const router = createMemoryRouter([
      {
        element: <AppProviders />,
        children: [{ index: true, element: <Controls /> }],
      },
    ]);
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(
      (
        (await screen.findByRole('button', {
          name: uiPreview.details,
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.queryByRole('button', { name: uiPreview.edit })).toBeNull();
    expect(screen.getByText(uiPreview.exampleA)).toBeTruthy();
    expect(screen.queryByText(uiPreview.exampleB)).toBeNull();
  });
  it('refreshes permissions on navigation after the ten-second interval', async () => {
    const now = Date.now();
    let current = profile;
    const { router, fetch } = setup('/', (path) => {
      if (path.endsWith('/me')) return json(current);
      if (path.endsWith('/users/options'))
        return json({ roles: [], sites: [] });
      if (path.startsWith('/api/v1/users?'))
        return json({ items: [], total: 0, page: 1, pageSize: 25 });
      throw new Error('Unexpected request ' + path);
    });
    const profileRequests = () =>
      fetch.mock.calls.filter(([path]) => path.endsWith('/me'));
    await screen.findByRole('heading', { name: ar.appName });
    await router.navigate('/admin/users');
    await screen.findByRole('heading', { name: 'المستخدمون' });
    expect(profileRequests()).toHaveLength(1);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/users\?/),
        expect.anything(),
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/users/options',
      expect.anything(),
    );
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    current = { ...profile, permissions: [] };
    await router.navigate('/admin/users?page=2');
    expect(
      await screen.findByRole('heading', { name: ar.errors.denied }),
    ).toBeTruthy();
    expect(profileRequests()).toHaveLength(2);
  });
});

describe('login API errors', () => {
  it.each([
    {
      status: 401,
      error: 'INVALID_CREDENTIALS',
      message: 'اسم المستخدم أو كلمة المرور غير صحيحة',
      hint: ar.auth.lockout,
    },
    {
      status: 429,
      error: 'RATE_LIMIT',
      message: 'محاولات كثيرة، حاول لاحقًا',
      hint: ar.auth.rateLimit,
    },
    {
      status: 423,
      error: 'LOCKED',
      message: 'الحساب موقوف مؤقتًا',
      hint: ar.auth.lockout,
    },
  ])(
    'shows sign-in guidance for $error',
    async ({ status, error, message, hint }) => {
      const { fetch } = setup('/login', (path) =>
        path.endsWith('/me') ? json({}, 401) : json({ error, message }, status),
      );
      await screen.findByRole('heading', { name: ar.auth.title });
      loginForm();
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain(message);
      expect(alert.textContent).toContain(hint);
      await waitFor(() =>
        expect(
          fetch.mock.calls.filter(([path]) => path.endsWith('/auth/login')),
        ).toHaveLength(1),
      );
    },
  );
});

it.each([
  ['/login', ar.auth.title],
  ['/', ar.navigation.modules],
])('checks accessibility at %s', async (path, heading) => {
  setup(path!, (url) => {
    if (url.endsWith('/me'))
      return path === '/login' ? json({}, 401) : json(profile);
    return json({ queues: [], items: [], unread: 0 });
  });
  await screen.findByRole('heading', { name: heading });
  expect((await axe(document.body)).violations).toEqual([]);
});

// Regression for the stakeholder path verified in the browser: a site viewer without any
// workflow key reaches a freshly saved draft from Home and opens it read-only.
it('takes a view-only site stakeholder from Home to someone else’s saved draft, read-only', async () => {
  const site = { id: 1, name: uiPreview.exampleA };
  const category = { id: 3, name: 'كهربا' };
  const draft: RequestDto = {
    id: 7,
    number: null,
    version: 2,
    createdById: 40,
    siteId: site.id,
    categoryId: category.id,
    status: 'DRAFT',
    urgency: 'NORMAL',
    urgencyLocked: false,
    isModified: false,
    unitOrClient: null,
    note: null,
    site,
    category,
    creator: { id: 40, name: 'مهندس الموقع' },
    displayedStage: 'DRAFT',
    stageStartedAt: '2026-11-25T10:00:00.000Z',
    stateCounts: Object.fromEntries(
      itemStates.map((state) => [state, state === 'OPEN' ? 1 : 0]),
    ) as RequestDto['stateCounts'],
    items: [
      {
        ...openItem(
          {
            id: 70,
            catalogItemId: null,
            nodeId: category.id,
            unitId: 2,
            otherName: 'خرسانة جاهزة',
            specs: 'مواصفة الموقع',
            quantity: '3.00',
            snapshot: {
              name: 'خرسانة جاهزة',
              code: null,
              unitName: 'م³',
              attributes: {},
              nodePath: [category.name],
              coverImageKey: null,
            },
          },
          1,
        ),
        isOther: true,
      },
    ],
    availableActions: [],
  };
  const { router, fetch } = setup('/', (path) => {
    const url = new URL(path, 'http://localhost');
    if (url.pathname === '/api/v1/me')
      return json({ ...profile, permissions: ['requests.view'] });
    if (url.pathname === '/api/v1/settings') return json(defaultSettings);
    if (url.pathname === '/api/v1/requests/options')
      return json({ sites: [site], categories: [category], units: [] });
    if (url.pathname === '/api/v1/requests')
      return json({ items: [draft], total: 1, page: 1, pageSize: 25 });
    if (url.pathname === '/api/v1/requests/7') return json(draft);
    return json({ queues: [], items: [], unread: 0 });
  });
  fireEvent.click(
    await screen.findByRole('link', { name: new RegExp(requestUi.title) }),
  );
  await waitFor(() => expect(router.state.location.pathname).toBe('/requests'));
  const row = await screen.findByRole('link', {
    name: new RegExp(statusMap.DRAFT.label),
  });
  expect(row.getAttribute('href')).toBe('/requests/7');
  // The list asks for every state in scope: nothing filters drafts out on the client.
  const list = fetch.mock.calls
    .map(([path]) => new URL(path, 'http://localhost'))
    .find((url) => url.pathname === '/api/v1/requests')!;
  for (const key of ['status', 'stage', 'queue', 'createdById'])
    expect(list.searchParams.has(key)).toBe(false);
  fireEvent.click(row);
  expect(
    await screen.findByRole('heading', { name: 'خرسانة جاهزة' }),
  ).toBeTruthy();
  expect(screen.getByText('مهندس الموقع', { exact: false })).toBeTruthy();
  for (const name of [
    requestUi.continueDraft,
    requestUi.deleteDraft,
    requestUi.submit,
    requestUi.edit,
    requestUi.copy,
  ])
    expect(screen.queryByRole('button', { name })).toBeNull();
  expect(router.state.location.pathname).toBe('/requests/7');
  expect(
    fetch.mock.calls.some(([, init]) => (init?.method ?? 'GET') !== 'GET'),
  ).toBe(false);
});
