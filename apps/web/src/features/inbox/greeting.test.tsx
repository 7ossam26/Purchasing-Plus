import { ar, liveUi as copy, requestUi } from '@purchasing-plus/shared/i18n/ar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type { SessionProfile } from '../../lib/api/auth.js';

function account(username: string, name: string): SessionProfile {
  return {
    user: { id: username.length + name.length, name, username },
    roleName: 'حساب تجربة',
    roleId: 1,
    isSuperadmin: false,
    siteScope: 'ASSIGNED',
    sites: [],
    permissions: ['requests.create'],
  };
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
function open(
  url: string,
  me: () => SessionProfile | null | Promise<SessionProfile | null>,
  extra?: (path: string, init?: RequestInit) => Response | undefined,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const handled = extra?.(path, init);
      if (handled) return handled;
      if (path === '/api/v1/me') {
        const profile = await me();
        return profile ? json(profile) : json({}, 401);
      }
      return json({ items: [] });
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const greeting = (name: string) =>
  screen.findByRole('heading', { level: 2, name });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('home greeting', () => {
  it('greets the signed-in account by its username in place of «محتاج مني»', async () => {
    open('/', () => account('superadmin', 'مدير الدعم'));
    expect(await greeting('Welcome superadmin')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: copy.inbox })).toBeNull();
    // The inbox region keeps its name for assistive technology.
    expect(screen.getByRole('region', { name: copy.inbox })).toBeTruthy();
  });

  it('falls back to the display name, then to a plain greeting', async () => {
    open('/', () => account('  ', 'هبة منصور'));
    expect(await greeting('Welcome هبة منصور')).toBeTruthy();
    cleanup();
    open('/', () => account('', ' '));
    expect(await greeting(copy.welcomeFallback)).toBeTruthy();
  });

  it('keeps long Latin and Arabic labels whole and isolated left-to-right', async () => {
    const long = 'procurement.coordinator.new-cairo';
    open('/', () => account(long, 'هبة'));
    const heading = await greeting('Welcome ' + long);
    const isolated = heading.querySelector('bdi[dir="ltr"]');
    expect(isolated?.textContent).toBe('Welcome ' + long);
    expect(isolated?.querySelector('bdi')?.textContent).toBe(long);
    cleanup();
    const arabic = 'م. عبد الرحمن محمد إبراهيم الشناوي';
    open('/', () => account('', arabic));
    const named = await greeting('Welcome ' + arabic);
    expect(named.querySelector('bdi[dir="ltr"] bdi')?.textContent).toBe(arabic);
  });

  it('orders the row «طلب جديد», toggle, greeting from left to right (RTL source order reversed)', async () => {
    open('/', () => account('eng', 'م. أحمد'));
    const heading = await greeting('Welcome eng');
    const toggle = screen.getByRole('button', {
      name: ar.appearance.switchToDark,
    });
    const create = screen.getByRole('button', { name: requestUi.newRequest });
    const header = heading.closest('header')!;
    expect(header.contains(toggle) && header.contains(create)).toBe(true);
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(heading, toggle)).toBe(true);
    expect(follows(toggle, create)).toBe(true);
  });

  it('never shows the previous account after signing out and in as someone else', async () => {
    const profiles = {
      'site.lead': account('site.lead', 'هبة'),
      superadmin: account('superadmin', 'مدير الدعم'),
    };
    let current: keyof typeof profiles | null = 'site.lead';
    let release: (() => void) | undefined;
    open(
      '/',
      async () => {
        if (current === 'superadmin' && release === undefined)
          await new Promise<void>((resolve) => (release = resolve));
        return current ? profiles[current] : null;
      },
      (path, init) => {
        if (path === '/api/v1/auth/logout') {
          current = null;
          return new Response(null, { status: 204 });
        }
        if (path === '/api/v1/auth/login') {
          current = JSON.parse(String(init?.body)).username;
          return new Response(null, { status: 204 });
        }
      },
    );
    expect(await greeting('Welcome site.lead')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: ar.auth.userMenu }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: ar.auth.userMenu })).getByRole(
        'button',
        { name: ar.auth.logout },
      ),
    );
    fireEvent.click(
      within(
        await screen.findByRole('dialog', { name: ar.auth.logoutTitle }),
      ).getByRole('button', { name: ar.auth.logout }),
    );
    await screen.findByRole('heading', { name: ar.auth.title });

    fireEvent.change(screen.getByLabelText(ar.auth.username), {
      target: { value: 'superadmin' },
    });
    fireEvent.change(screen.getByLabelText(ar.auth.password), {
      target: { value: 'test-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: ar.auth.login }));
    // While the new session loads, nothing names the previous account.
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(screen.queryByText(/site\.lead/)).toBeNull();
    release!();
    expect(await greeting('Welcome superadmin')).toBeTruthy();
    expect(screen.queryByText(/site\.lead/)).toBeNull();
  });
});
