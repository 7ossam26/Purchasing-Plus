import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
}
export function ChipSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChoiceOption[];
  value: readonly string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div
      aria-label={label}
      role="group"
      className="chip-strip flex gap-2 overflow-x-auto p-1"
    >
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() =>
              onChange(
                selected
                  ? value.filter((v) => v !== option.value)
                  : [...value, option.value],
              )
            }
            className="inline-flex min-h-target min-w-target shrink-0 items-center gap-1 rounded-full border border-concrete bg-paper px-3 text-small font-semibold text-ink transition-colors hover:bg-plaster aria-pressed:border-ppr aria-pressed:bg-ppr-wash aria-pressed:text-ppr-deep"
          >
            {selected && (
              <Check size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
/** One-of-few choice shown as equal segments; native radios keep arrow-key selection. */
export function SegmentedChoice({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const name = useId();
  const hintId = name + '-hint';
  return (
    <fieldset
      className="grid min-w-0 gap-2"
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="mb-2 text-small font-semibold">{label}</legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-seam bg-plaster p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-target min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border border-transparent px-1 py-1.5 text-center text-small font-semibold text-concrete transition-colors sm:flex-row sm:gap-1.5 sm:px-2 hover:text-ink has-checked:border-ppr has-checked:bg-ppr-wash has-checked:font-bold has-checked:text-ppr-deep has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ppr"
          >
            <input
              className="sr-only"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.icon}
            <span className="leading-tight">{option.label}</span>
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="text-micro text-concrete">
          {hint}
        </p>
      )}
    </fieldset>
  );
}
export function SelectableCard({
  name,
  option,
  selected,
  onSelect,
}: {
  name: string;
  option: ChoiceOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <label className="relative flex min-h-target cursor-pointer items-start gap-3 rounded-panel border border-seam bg-paper p-4 transition-colors has-checked:border-ppr has-checked:bg-ppr-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ppr">
      <input
        className="mt-1.5 size-4 shrink-0 accent-ppr"
        type="radio"
        name={name}
        value={option.value}
        checked={selected}
        onChange={() => onSelect(option.value)}
      />
      <span>
        <span className="flex items-center gap-2 text-subtitle">
          {option.icon}
          {option.label}
        </span>
        {option.description && (
          <span className="block text-small text-concrete">
            {option.description}
          </span>
        )}
      </span>
    </label>
  );
}
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-target cursor-pointer items-center justify-between gap-3 rounded-control border border-seam bg-paper p-3">
      <span>
        <span className="block text-subtitle">{label}</span>
        {description && (
          <span className="block text-small text-concrete">{description}</span>
        )}
      </span>
      <span className="relative shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span
          aria-hidden="true"
          className="flex h-6 w-11 items-center rounded-full bg-switch-off p-1 transition-colors peer-checked:justify-end peer-checked:bg-ppr peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ppr"
        >
          <span className="size-4 rounded-full bg-switch-knob" />
        </span>
      </span>
    </label>
  );
}
