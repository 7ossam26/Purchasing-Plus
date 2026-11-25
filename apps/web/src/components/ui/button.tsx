import { ar } from '@purchasing-plus/shared/i18n/ar';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'danger-outline' | 'ghost';
// "Black acts": the primary is the one solid ink control on a surface. Secondary outlines are
// strong enough (about 3:1) to read as buttons in daylight, not as plain panels.
// (`not-disabled:` also matches links that borrow these classes.)
const variants: Record<ButtonVariant, string> = {
  primary:
    'border-ink bg-ink font-bold text-paper not-disabled:hover:bg-neutral-fg',
  secondary:
    'border-concrete/70 bg-paper font-semibold text-ink not-disabled:hover:border-concrete not-disabled:hover:bg-plaster',
  'danger-outline':
    'border-danger-fg bg-paper font-semibold text-danger-fg not-disabled:hover:bg-danger-bg',
  ghost:
    'border-transparent font-semibold text-current not-disabled:hover:bg-current/8',
};
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  iconOnly = false,
) {
  return `inline-flex min-h-target min-w-target items-center justify-center gap-2 rounded-control border transition-[background-color,border-color,color,scale] select-none not-disabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${iconOnly ? 'p-2' : 'px-4 py-2'} ${variants[variant]}`;
}
export function Button({
  variant = 'primary',
  loading = false,
  iconOnly = false,
  children,
  disabled,
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & {
  variant?: ButtonVariant;
  loading?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      className={buttonClass(variant, iconOnly) + ' ' + className}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
    >
      {loading && (
        <LoaderCircle
          size={20}
          strokeWidth={1.75}
          aria-label={ar.common.loading}
          className="motion-safe:animate-spin"
        />
      )}
      {children}
    </button>
  );
}
