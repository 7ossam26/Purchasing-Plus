import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  initTheme,
  resolveTheme,
  setThemePreference,
  themeStorageKey,
} from './theme.js';

function media({ dark = false, reduce = false }) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    matches: query.includes('dark') ? dark : query.includes('reduce') && reduce,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
const root = document.documentElement;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
  delete root.dataset.theme;
  delete root.dataset.themeSwitching;
});

describe('theme store', () => {
  it('resolves the device theme only when no explicit choice exists', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('cross-fades a switch briefly, and not at all under reduced motion', () => {
    vi.useFakeTimers();
    media({});
    initTheme();
    // First paint is never animated.
    expect(root.dataset.themeSwitching).toBeUndefined();
    setThemePreference('dark');
    expect(root.dataset.themeSwitching).toBe('');
    vi.advanceTimersByTime(200);
    expect(root.dataset.themeSwitching).toBeUndefined();

    media({ reduce: true });
    setThemePreference('light');
    expect(root.dataset.theme).toBe('light');
    expect(root.dataset.themeSwitching).toBeUndefined();
  });

  it('still applies a choice when storage is unavailable', () => {
    media({ dark: true });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    initTheme();
    expect(root.dataset.theme).toBe('dark');
    setThemePreference('light');
    expect(root.dataset.theme).toBe('light');
  });

  it('follows a choice made in another tab', () => {
    media({});
    initTheme();
    expect(root.dataset.theme).toBe('light');
    localStorage.setItem(themeStorageKey, 'dark');
    window.dispatchEvent(
      new StorageEvent('storage', { key: themeStorageKey, newValue: 'dark' }),
    );
    expect(root.dataset.theme).toBe('dark');
  });
});
