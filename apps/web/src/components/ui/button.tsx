import { ar } from '@purchasing-plus/shared/i18n/ar';
import { LoaderCircle } from 'lucide-react';
import type { ComponentProps } from 'react';

export type ButtonVariant =
  'primary' | 'secondary' | 'danger-outline' | 'ghost';
const variants: Record<ButtonVariant, string> = {
  primary: 'border-ink bg-ink text-paper hover:bg-neutral-fg',
  secondary: 'border-seam bg-paper text-ink hover:bg-plaster',
  'danger-outline': 'border-danger-fg text-danger-fg hover:bg-danger-bg',
  ghost: 'border-transparent text-current hover:bg-ink/5',
};
export function buttonClass(
  variant: ButtonVariant = 'secondary',
  iconOnly = false,
) {
  return `inline-flex min-h-target min-w-target items-center justify-center gap-2 rounded-control border font-semibold disabled:cursor-not-allowed disabled:opacity-55 ${iconOnly ? 'p-2' : 'px-4 py-2'} ${variants[variant]}`;
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
