import { requestUi as copy, ar } from '@purchasing-plus/shared/i18n/ar';
import {
  addQuantities,
  quantity,
  statusMap,
  urgencies,
  type Urgency,
} from '@purchasing-plus/shared/lifecycle';
import { ChevronDown, Minus, Plus, Trash2 } from 'lucide-react';

import { Button } from '../../components/ui/button.js';
import { ChipSelect } from '../../components/ui/choice.js';
import {
  Field,
  Input,
  NumberInput,
  Select,
  Textarea,
} from '../../components/ui/field.js';
import { EmptyState } from '../../components/ui/states.js';
import type { NamedRecord } from '../../lib/api/catalog.js';

import type { DraftForm } from './workspace.js';

export function UrgencyChoices({
  value,
  onChange,
  choices = urgencies,
}: {
  value?: Urgency;
  onChange: (value: Urgency) => void;
  choices?: readonly Urgency[];
}) {
  return (
    <ChipSelect
      label={copy.urgency}
      value={value ? [value] : []}
      options={choices.map((level) => ({
        value: level,
        label: statusMap[level].label,
      }))}
      onChange={(levels) => {
        const next = levels.at(-1);
        if (next) onChange(next as Urgency);
      }}
    />
  );
}
export function QuantityField({
  label = copy.quantity,
  accessibleLabel,
  value,
  onChange,
  stepper = false,
}: {
  label?: string;
  accessibleLabel?: string;
  value: string;
  onChange: (value: string) => void;
  stepper?: boolean;
}) {
  const valid = quantity.safeParse(value).success;
  const next = (step: string) => {
    const result = addQuantities(valid ? value : '0', step);
    if (quantity.safeParse(result).success) onChange(result);
  };
  return (
    <Field
      label={label}
      error={!valid && value !== '' ? copy.invalidQuantity : undefined}
    >
      {(props) => (
        <div className="flex items-start gap-1.5">
          {stepper && (
            <Button
              iconOnly
              variant="secondary"
              aria-label={copy.increase}
              onClick={() => next('1')}
            >
              <Plus size={18} />
            </Button>
          )}
          <NumberInput
            {...props}
            aria-label={accessibleLabel}
            value={value}
            onValueChange={onChange}
          />
          {stepper && (
            <Button
              iconOnly
              variant="secondary"
              aria-label={copy.decrease}
              disabled={
                !valid ||
                !quantity.safeParse(addQuantities(valid ? value : '0', '-1'))
                  .success
              }
              onClick={() => next('-1')}
            >
              <Minus size={18} />
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
export function UnitSelect({
  unitId,
  unitName,
  units,
  accessibleLabel,
  onChange,
}: {
  unitId: number;
  unitName?: string;
  units: NamedRecord[];
  accessibleLabel?: string;
  onChange: (id: number) => void;
}) {
  return (
    <Field label={copy.unit}>
      {(props) => (
        <Select
          {...props}
          aria-label={accessibleLabel}
          value={unitId || ''}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
        >
          <option value="">{ar.common.choose}</option>
          {unitId > 0 && !units.some((unit) => unit.id === unitId) && (
            <option value={unitId}>{unitName}</option>
          )}
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function RequestFields({
  form,
  units,
  locked,
  onChange,
  expanded = false,
  hideUrgency = false,
}: {
  form: DraftForm;
  units: NamedRecord[];
  locked: boolean;
  onChange: (value: DraftForm) => void;
  expanded?: boolean;
  hideUrgency?: boolean;
}) {
  return (
    <div className="grid gap-4">
      <section
        aria-label={copy.items}
        className="overflow-hidden rounded-panel border border-seam bg-paper"
      >
        {form.items.length === 0 ? (
          <EmptyState title={copy.emptyItems} />
        ) : (
          <ol className="divide-y divide-seam">
            {form.items.map((line, index) => {
              const change = (patch: Partial<typeof line>) =>
                onChange({
                  ...form,
                  items: form.items.map((row) =>
                    row.key === line.key ? { ...row, ...patch } : row,
                  ),
                });
              return (
                <li key={line.key} className="grid gap-2.5 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 pt-1">
                      <h3 className="wrap-anywhere text-subtitle">
                        <bdi>{line.name}</bdi>
                      </h3>
                      {!expanded && line.specs && (
                        <p className="wrap-anywhere text-small text-concrete">
                          <bdi>{line.specs}</bdi>
                        </p>
                      )}
                    </div>
                    <Button
                      iconOnly
                      variant="ghost"
                      aria-label={ar.common.delete + ' ' + line.name}
                      onClick={() =>
                        onChange({
                          ...form,
                          items: form.items.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                  {expanded && (
                    <Field label={copy.specsFor(line.name)}>
                      {(props) => (
                        <Textarea
                          {...props}
                          rows={1}
                          maxLength={4000}
                          value={line.specs}
                          onChange={(event) =>
                            change({ specs: event.currentTarget.value })
                          }
                        />
                      )}
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <QuantityField
                      accessibleLabel={copy.quantityFor(line.name)}
                      value={line.quantity}
                      onChange={(quantity) => change({ quantity })}
                    />
                    <UnitSelect
                      accessibleLabel={copy.unitFor(line.name)}
                      unitId={line.unitId}
                      unitName={line.unitName}
                      units={units}
                      onChange={(unitId) =>
                        change({
                          unitId,
                          unitName: units.find((unit) => unit.id === unitId)
                            ?.name,
                        })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
      <section className="grid gap-3 rounded-panel border border-seam bg-paper p-4">
        {!hideUrgency && (
          <div className="grid gap-1">
            <h3 className="text-small font-semibold">{copy.urgency}</h3>
            {locked ? (
              <p className="text-small">
                {statusMap[form.urgency].label} · {copy.urgencyLocked}
              </p>
            ) : (
              <UrgencyChoices
                value={form.urgency}
                onChange={(urgency) => onChange({ ...form, urgency })}
              />
            )}
          </div>
        )}
        <Field label={copy.client}>
          {(props) => (
            <Input
              {...props}
              value={form.unitOrClient}
              maxLength={300}
              onChange={(event) =>
                onChange({ ...form, unitOrClient: event.currentTarget.value })
              }
            />
          )}
        </Field>
        <details className="group/note">
          <summary className="flex min-h-target cursor-pointer items-center gap-2 font-semibold text-ppr-deep">
            <ChevronDown
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className="shrink-0 transition-transform group-open/note:rotate-180"
            />
            {form.note ? copy.note : copy.addNote}
          </summary>
          <Textarea
            aria-label={copy.note}
            value={form.note}
            maxLength={4000}
            onChange={(event) =>
              onChange({ ...form, note: event.currentTarget.value })
            }
          />
        </details>
      </section>
    </div>
  );
}
