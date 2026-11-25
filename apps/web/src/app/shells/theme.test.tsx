import { ar } from '@purchasing-plus/shared/i18n/ar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SessionProfile } from '../../lib/api/auth.js';
import { initTheme, themeStorageKey } from '../../lib/theme.js';
import { createQueryClient } from '../query.js';
import { routes } from '../routes.js';

const profile: SessionProfile = {
  user: { id: 1, name: 'حسن', username: 'hassan' },
  roleName: 'حساب تجربة',
  roleId: 1,
  isSuperadmin: false,
  siteScope: 'ASSIGNED',
  sites: [],
  permissions: [],
};

/** A device whose colour-scheme preference can change while the app is open. */
function device(initial: 'light' | 'dark') {
  let dark = initial === 'dark';
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return query.includes('prefers-color-scheme: dark') && dark;
    },
    addEventListener: (_type: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  return {
    switchTo(next: 'light' | 'dark') {
      dark = next === 'dark';
      for (const listener of listeners) listener();
    },
  };
}

/** Starts the app the way main.tsx does: apply the theme, then render the routes. */
function open(url = '/') {
  initTheme();
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string) =>
      Promise.resolve(
        path.endsWith('/me')
          ? Response.json(profile)
          : Response.json({ items: [] }),
      ),
    ),
  );
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
/** Leaves the page and opens it again, as a browser reload would. */
function reload(url = '/') {
  cleanup();
  return open(url);
}
async function appearance() {
  fireEvent.click(
    await screen.findByRole('button', { name: ar.auth.userMenu }),
  );
  const menu = within(screen.getByRole('dialog', { name: ar.auth.userMenu }));
  return within(menu.getByRole('group', { name: ar.appearance.title }));
}
const shown = () => document.documentElement.dataset.theme;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = '';
});

describe('appearance', () => {
  it('follows the device on first use and says so in the account menu', async () => {
    device('dark');
    open();
    expect(shown()).toBe('dark');
    const choice = await appearance();
    const system = choice.getByRole('radio', { name: ar.appearance.system });
    expect((system as HTMLInputElement).checked).toBe(true);
    expect(
      choice.getByRole('radio', { name: ar.appearance.light }),
    ).toBeTruthy();
    expect(
      choice.getByRole('radio', { name: ar.appearance.dark }),
    ).toBeTruthy();
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
  });

  it('remembers an explicit choice across navigation and reloads, even when the device changes', async () => {
    const phone = device('dark');
    const router = open();
    fireEvent.click(
      (await appearance()).getByRole('radio', { name: ar.appearance.light }),
    );
    expect(shown()).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(localStorage.getItem(themeStorageKey)).toBe('light');

    await router.navigate('/absent');
    expect(
      await screen.findByRole('heading', { name: ar.errors.notFound }),
    ).toBeTruthy();
    expect(shown()).toBe('light');

    reload();
    expect(shown()).toBe('light');
    const choice = await appearance();
    expect(
      (
        choice.getByRole('radio', {
          name: ar.appearance.light,
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    // An explicit choice outranks the device until the user asks to follow it again.
    phone.switchTo('light');
    phone.switchTo('dark');
    expect(shown()).toBe('light');
  });

  it('goes back to following the device and keeps following its changes', async () => {
    localStorage.setItem(themeStorageKey, 'dark');
    const phone = device('light');
    open();
    expect(shown()).toBe('dark');
    fireEvent.click(
      (await appearance()).getByRole('radio', { name: ar.appearance.system }),
    );
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
    expect(shown()).toBe('light');

    phone.switchTo('dark');
    expect(shown()).toBe('dark');
    reload();
    expect(shown()).toBe('dark');
  });
});

/** The one-tap shortcut on the home screen, named for the theme it switches to. */
const toggle = (to: 'dark' | 'light') =>
  screen.findByRole('button', {
    name:
      to === 'dark' ? ar.appearance.switchToDark : ar.appearance.switchToLight,
  });
function closeMenu() {
  fireEvent.click(
    within(screen.getByRole('dialog', { name: ar.auth.userMenu })).getByRole(
      'button',
      { name: ar.common.close },
    ),
  );
}
const checked = async (name: string) =>
  ((await appearance()).getByRole('radio', { name }) as HTMLInputElement)
    .checked;

describe('home theme toggle', () => {
  it('switches the displayed theme in one tap, saves it, and the account menu agrees', async () => {
    device('light');
    open();
    fireEvent.click(await toggle('dark'));
    expect(shown()).toBe('dark');
    expect(localStorage.getItem(themeStorageKey)).toBe('dark');
    // The same button now offers the way back, with the sun icon's label.
    expect(await toggle('light')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: ar.appearance.switchToDark }),
    ).toBeNull();
    expect(await checked(ar.appearance.dark)).toBe(true);
    closeMenu();

    fireEvent.click(await toggle('light'));
    expect(shown()).toBe('light');
    expect(localStorage.getItem(themeStorageKey)).toBe('light');
    expect(await checked(ar.appearance.light)).toBe(true);
  });

  it('turns «حسب الجهاز» into the opposite explicit choice and follows the menu back to the device', async () => {
    const phone = device('dark');
    open();
    // Following a dark device: the shortcut offers light.
    fireEvent.click(await toggle('light'));
    expect(shown()).toBe('light');
    expect(localStorage.getItem(themeStorageKey)).toBe('light');
    expect(await checked(ar.appearance.light)).toBe(true);

    fireEvent.click(
      (await appearance()).getByRole('radio', { name: ar.appearance.system }),
    );
    closeMenu();
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
    expect(shown()).toBe('dark');
    expect(await toggle('light')).toBeTruthy();

    act(() => phone.switchTo('light'));
    expect(shown()).toBe('light');
    expect(await toggle('dark')).toBeTruthy();
  });

  it('stays in sync across navigation, reloads and other tabs', async () => {
    device('light');
    const router = open();
    fireEvent.click(await toggle('dark'));
    await router.navigate('/absent');
    await screen.findByRole('heading', { name: ar.errors.notFound });
    expect(shown()).toBe('dark');
    await router.navigate('/');
    expect(await toggle('light')).toBeTruthy();

    reload();
    expect(shown()).toBe('dark');
    expect(await toggle('light')).toBeTruthy();

    // Another tab picks light: this page and its shortcut follow.
    localStorage.setItem(themeStorageKey, 'light');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: themeStorageKey,
          newValue: 'light',
        }),
      );
    });
    expect(shown()).toBe('light');
    expect(await toggle('dark')).toBeTruthy();
  });
});
