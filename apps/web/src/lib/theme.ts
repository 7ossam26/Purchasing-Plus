import { useSyncExternalStore } from 'react';

// Appearance follows the device until the user picks one explicitly; the explicit choice is
// remembered on this device. `public/theme-init.js` applies the same rule before first paint.
export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];
export type Theme = 'light' | 'dark';
export interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
}

export const themeStorageKey = 'purchasing-plus.theme';
const darkQuery = '(prefers-color-scheme: dark)';
const switchMs = 200;

function storedPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(themeStorageKey);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
function deviceTheme(): Theme {
  return window.matchMedia?.(darkQuery).matches ? 'dark' : 'light';
}
export function resolveTheme(
  preference: ThemePreference,
  device: Theme,
): Theme {
  return preference === 'system' ? device : preference;
}

let state: ThemeState | undefined;
const listeners = new Set<() => void>();
let media: MediaQueryList | undefined;
let switchTimer: ReturnType<typeof setTimeout> | undefined;

function read(): ThemeState {
  const preference = storedPreference();
  return { preference, theme: resolveTheme(preference, deviceTheme()) };
}
function current() {
  return (state ??= read());
}
function apply(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  // A short colour cross-fade so the switch reads as one change, not a flash.
  if (animate && !reduce && root.dataset.theme !== theme) {
    root.dataset.themeSwitching = '';
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      delete root.dataset.themeSwitching;
    }, switchMs);
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  // The browser chrome on phones matches the top bar surface.
  const surface = getComputedStyle(root).getPropertyValue('--color-paper');
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta && surface.trim()) meta.content = surface.trim();
}
function update(next: ThemeState, animate: boolean) {
  const changed =
    !state ||
    state.preference !== next.preference ||
    state.theme !== next.theme;
  state = next;
  apply(next.theme, animate);
  if (changed) for (const listener of listeners) listener();
}
function onDeviceChange() {
  const { preference } = current();
  if (preference === 'system')
    update({ preference, theme: deviceTheme() }, true);
}
function onStorage(event: StorageEvent) {
  // Another tab changed the choice: follow it so every open page agrees.
  if (event.key === themeStorageKey || event.key === null) update(read(), true);
}

/** Applies the remembered or device theme and starts following device changes. */
export function initTheme() {
  media?.removeEventListener('change', onDeviceChange);
  media = window.matchMedia?.(darkQuery);
  media?.addEventListener('change', onDeviceChange);
  window.removeEventListener('storage', onStorage);
  window.addEventListener('storage', onStorage);
  update(read(), false);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system')
      window.localStorage.removeItem(themeStorageKey);
    else window.localStorage.setItem(themeStorageKey, preference);
  } catch {
    // Storage can be unavailable (private mode); the choice still applies to this page.
  }
  update({ preference, theme: resolveTheme(preference, deviceTheme()) }, true);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useTheme(): ThemeState {
  return useSyncExternalStore(subscribe, current, current);
}
