import { ar, uiPreview } from '@purchasing-plus/shared/i18n/ar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../app/query.js';
import { AppProviders, routes } from '../app/routes.js';
import { useCan, useCanOnSite } from '../app/session.js';
import { Button } from '../components/ui/button.js';
import type { SessionProfile } from '../lib/api/auth.js';

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
