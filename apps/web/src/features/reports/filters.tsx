import {
  reportPresets,
  type RecordId,
  type ReportOptions,
} from '@purchasing-plus/shared';
import { reportsUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  activeStages,
  requestStatuses,
  statusMap,
  urgencies,
} from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Button } from '../../components/ui/button.js';
import { Field, Input, Select } from '../../components/ui/field.js';
import { reportsApi, type Filters } from '../../lib/api/reports.js';

import { ReportError, ReportLoading } from './data-view.js';

const statusChoices = (values: readonly (keyof typeof statusMap)[]) =>
  values.map((id) => ({ id, name: statusMap[id].label }));
const searchLabels = {
  requests: copy.searchNumber,
  receipts: copy.searchReceipt,
  approvals: copy.searchApproval,
};

type Choice = { id: number | string; name: string };
function ChoiceField({
  field,
  label,
  options,
  empty,
  value,
  change,
}: {
  field: string;
  label: string;
  options: readonly Choice[];
  empty?: string;
  value?: string;
  change: (field: string, value: string) => void;
}) {
  return (
    <Field label={label}>
      {(control) => (
        <Select
          {...control}
          value={value ?? ''}
          onChange={(event) => change(field, event.currentTarget.value)}
        >
          {empty && <option value="">{empty}</option>}
          {options.map(({ id, name }) => (
            <option value={id} key={id}>
              {name}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function FilterForm({
  options,
  allSites,
  initial,
  record,
  apply,
}: {
  options: ReportOptions;
  allSites: boolean;
  initial: Filters;
  record?: RecordId;
  apply: (filters: Filters) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const custom = draft.preset === 'custom';
  function change(field: string, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function select(
    label: string,
    field: string,
    options: readonly Choice[],
    empty?: string,
  ) {
    return (
      <ChoiceField
        {...{ label, field, options, empty, change }}
        value={draft[field] ?? initial[field]}
      />
    );
  }
  function date(
    label: string,
    field: string,
    bound: { min?: string; max?: string },
  ) {
    return (
      <div className="col-span-2 sm:col-span-1">
        <Field label={label} required>
          {(control) => (
            <Input
              {...control}
              {...bound}
              type="date"
              dir="ltr"
              value={draft[field] ?? ''}
              onChange={(event) => change(field, event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    );
  }

  return (
    <form
      className="grid min-w-0 gap-3 rounded-panel border border-seam bg-paper p-3 sm:p-4"
      aria-label={copy.filters}
      onSubmit={(event) => {
        event.preventDefault();
        apply({
          ...initial,
          ...draft,
          ...(custom ? {} : { from: '', to: '' }),
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {record && (
          <div className="col-span-2 lg:col-span-1">
            <Field label={searchLabels[record]}>
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  maxLength={100}
                  value={draft.q ?? ''}
                  onChange={(event) => change('q', event.currentTarget.value)}
                />
              )}
            </Field>
          </div>
        )}
        {select(
          copy.period,
          'preset',
          reportPresets.map((id) => ({ id, name: copy.presets[id] })),
          record ? copy.anyPeriod : undefined,
        )}
        {select(
          copy.site,
          'siteId',
          options.sites,
          allSites ? copy.allSites : undefined,
        )}
        {select(
          copy.category,
          'categoryId',
          options.categories,
          copy.allCategories,
        )}
        {custom && date(copy.from, 'from', { max: draft.to || undefined })}
        {custom && date(copy.to, 'to', { min: draft.from || undefined })}
        {record === 'requests' && (
          <>
            {select(
              copy.status,
              'status',
              statusChoices(requestStatuses),
              copy.allValues,
            )}
            {select(
              copy.stage,
              'stage',
              statusChoices(activeStages),
              copy.allValues,
            )}
            {select(
              copy.urgency,
              'urgency',
              statusChoices(urgencies),
              copy.allValues,
            )}
            {select(
              copy.creator,
              'creatorId',
              options.creators,
              copy.allValues,
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{copy.apply}</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setDraft(initial);
            apply(initial);
          }}
        >
          {copy.reset}
        </Button>
      </div>
    </form>
  );
}

export function ItemPicker({
  filters,
  select,
}: {
  filters: Filters;
  select: (itemId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [currentChoice, setCurrentChoice] = useState<Choice>();
  const search = {
    siteId: filters.siteId ?? '',
    categoryId: filters.categoryId ?? '',
    q: q.trim(),
  };
  const items = useQuery({
    queryKey: ['reports', 'catalog', search],
    queryFn: ({ signal }) => reportsApi.items(search, signal),
  });
  const choices: Choice[] =
    items.data?.map((item) => ({
      id: item.id,
      name: item.name + ' (' + item.code + ')',
    })) ?? [];
  if (currentChoice && !choices.some(({ id }) => id === currentChoice.id))
    choices.unshift(currentChoice);
  return (
    <section className="grid gap-2 rounded-panel border border-seam bg-paper p-4">
      <Field label={copy.searchItem}>
        {(control) => (
          <Input
            {...control}
            type="search"
            maxLength={100}
            value={q}
            onChange={(event) => setQ(event.currentTarget.value)}
          />
        )}
      </Field>
      {items.isPending && <ReportLoading />}
      {items.error && (
        <ReportError error={items.error} retry={() => void items.refetch()} />
      )}
      {items.data && (
        <ChoiceField
          label={copy.item}
          field="itemId"
          empty={items.data.length ? copy.select : copy.noItems}
          options={choices}
          value={filters.itemId}
          change={(_, itemId) => {
            setCurrentChoice(choices.find(({ id }) => String(id) === itemId));
            select(itemId);
          }}
        />
      )}
    </section>
  );
}
