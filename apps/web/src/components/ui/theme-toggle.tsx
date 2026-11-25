import { ar } from '@purchasing-plus/shared/i18n/ar';
import { Moon, Sun } from 'lucide-react';

import { setThemePreference, useTheme } from '../../lib/theme.js';

import { Button } from './button.js';

// One-tap shortcut to the opposite of the theme on screen. It saves an explicit choice through the
// same store as «المظهر» in the account menu, so both controls always agree.
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? ar.appearance.switchToLight : ar.appearance.switchToDark;
  const Icon = dark ? Sun : Moon;
  return (
    <Button
      variant="secondary"
      iconOnly
      className={'shrink-0 ' + className}
      aria-label={label}
      title={label}
      onClick={() => setThemePreference(dark ? 'light' : 'dark')}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
    </Button>
  );
}
