import { ar } from '@purchasing-plus/shared/i18n/ar';
import { useId, type ComponentProps, type ReactNode } from 'react';

interface FieldControl {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (control: FieldControl) => ReactNode;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? inputId + '-hint' : undefined;
  const errorId = error ? inputId + '-error' : undefined;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline gap-2">
        <label className="text-small font-semibold" htmlFor={inputId}>
          {label}
        </label>
        {required && (
          <span aria-hidden="true" className="text-micro text-concrete">
            {ar.common.required}
          </span>
        )}
      </div>
      {children({
        id: inputId,
        'aria-describedby':
          [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {hint && (
        <p id={hintId} className="text-small text-concrete">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-small text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
const control =
  'w-full min-w-0 min-h-target rounded-control border border-concrete bg-paper px-3 py-2 text-body text-ink transition-[border-color] focus-visible:border-ppr aria-invalid:border-danger-fg disabled:bg-plaster';
export function Input({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={control + ' ' + className} />;
}
export function Textarea({
  className = '',
  rows = 3,
  ...props
}: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      rows={rows}
      className={control + ' resize-y ' + className}
    />
  );
}
export function Select({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={control + ' ' + className} />;
}
function westernDigits(value: string) {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 15))
    .replaceAll('٫', '.')
    .replaceAll(',', '.');
}
export function NumberInput({
  value,
  onValueChange,
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  'onChange' | 'type' | 'value' | 'inputMode'
> & { value: string; onValueChange: (value: string) => void }) {
  // Keep the value a decimal string, including while editing a trailing separator.
  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      dir="ltr"
      className={`numeric text-end ${props.className ?? ''}`}
      value={value}
      onChange={(event) => {
        const next = westernDigits(event.currentTarget.value);
        if (/^-?\d*(?:\.\d*)?$/.test(next)) onValueChange(next);
      }}
    />
  );
}
