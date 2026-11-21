import { formatNumber } from '@purchasing-plus/shared';
import { requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { addQuantities, quantity } from '@purchasing-plus/shared/lifecycle';
import { useQuery } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';

import { useCan } from '../../app/session.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { Field, Input, Textarea } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { Skeleton } from '../../components/ui/states.js';
import type { CatalogItem, NamedRecord } from '../../lib/api/catalog.js';
import { requestApi } from '../../lib/api/requests.js';
import { Carousel } from '../catalog/Carousel.js';
import { Explorer } from '../catalog/Explorer.js';
import { attributeLabel, SampleCover } from '../catalog/presentation.js';

import { QuantityField, UnitSelect } from './forms.js';
import {
  hasAction,
  pickerHref,
  requestHref,
  reviewHref,
  useOptions,
  useRequest,
  type BasketLine,
} from './workspace.js';

type Selection = { item: CatalogItem } | { nodeId: number };

function RecentItems({
  categoryId,
  onPick,
}: {
  categoryId: number;
  onPick: (item: CatalogItem) => void;
}) {
  const recent = useQuery({
    queryKey: ['requests', 'recent', categoryId],
    queryFn: ({ signal }) => requestApi.recent(categoryId, signal),
  });
  if (recent.isPending) return <Skeleton className="h-16 w-full" />;
  if (recent.error)
    return (
      <InlineError error={recent.error} retry={() => void recent.refetch()} />
    );
  if (!recent.data?.items.length) return null;
  return (
    <section className="min-w-0" aria-label={copy.recent}>
      <h2 className="mb-2 text-subtitle">{copy.recent}</h2>
      <ul className="chip-strip flex gap-2 overflow-x-auto pb-2">
        {recent.data.items.map((item) => (
          <li key={item.id} className="w-44 shrink-0">
            <button
              className="flex min-h-target w-full items-center gap-2 rounded-control border border-seam bg-paper p-2 text-start hover:border-ppr"
              onClick={() => onPick(item)}
            >
              <span className="w-10 shrink-0">
                <SampleCover item={item} />
              </span>
              <bdi className="line-clamp-2 break-words text-small font-semibold">
                {item.name}
              </bdi>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemForm({
  selection,
  units,
  existing,
  onAdd,
}: {
  selection: Selection;
  units: NamedRecord[];
  existing: BasketLine[];
  onAdd: (line: BasketLine, replace?: string) => void;
}) {
  const item = 'item' in selection ? selection.item : undefined;
  const nodeId =
    'nodeId' in selection ? selection.nodeId : selection.item.nodeId;
  const attributes =
    item?.attributeValues.filter(({ attribute }) => attribute.isActive) ?? [];
  const [name, setName] = useState(item?.name ?? '');
  const [specs, setSpecs] = useState(attributes.map(attributeLabel).join('، '));
  const [value, setValue] = useState('1');
  const [unitId, setUnitId] = useState(
    item?.unitId ?? (units.length === 1 ? units[0]!.id : 0),
  );
  const [duplicate, setDuplicate] = useState<BasketLine>();
  const valid = name.trim() && unitId > 0 && quantity.safeParse(value).success;
  function add(replace?: BasketLine) {
    if (!valid) return;
    const total = replace ? addQuantities(replace.quantity, value) : value;
    if (!quantity.safeParse(total).success) return;
    onAdd(
      {
        key: crypto.getRandomValues(new Uint32Array(2)).join('-'),
        catalogItemId: item?.id ?? null,
        nodeId,
        unitId,
        unitName:
          units.find((unit) => unit.id === unitId)?.name ??
          item?.unit.name ??
          '',
        name: name.trim(),
        otherName: item ? null : name.trim(),
        specs: specs.trim(),
        quantity: total,
      },
      replace?.key,
    );
  }
  const canIncrease =
    duplicate &&
    quantity.safeParse(addQuantities(duplicate.quantity, value)).success;
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || duplicate) return;
        const match =
          item &&
          existing.find(
            (line) =>
              line.catalogItemId === item.id &&
              line.unitId === unitId &&
              line.specs === specs.trim() &&
              quantity.safeParse(line.quantity).success,
          );
        if (match) setDuplicate(match);
        else add();
      }}
    >
      {item?.images?.length ? (
        <Carousel images={item.images} name={item.name} compact />
      ) : null}
      {!item && (
        <Field label={copy.itemName}>
          {(props) => (
            <Input
              {...props}
              data-initial-focus
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          )}
        </Field>
      )}
      {!!attributes.length && (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {attributes.map((value) => (
            <div key={value.attributeId} className="flex gap-1">
              <dt className="text-concrete">{value.attribute.name}</dt>
              <dd>
                <bdi>{attributeLabel(value)}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
        <QuantityField
          label={copy.quantity}
          stepper
          value={value}
          onChange={(next) => {
            setValue(next);
            setDuplicate(undefined);
          }}
        />
        <UnitSelect
          unitId={unitId}
          unitName={item?.unit.name}
          units={units}
          onChange={(next) => {
            setUnitId(next);
            setDuplicate(undefined);
          }}
        />
      </div>
      <Field label={copy.specs}>
        {(props) => (
          <Textarea
            {...props}
            rows={1}
            value={specs}
            maxLength={4000}
            onChange={(event) => {
              setSpecs(event.currentTarget.value);
              setDuplicate(undefined);
            }}
          />
        )}
      </Field>
      <div className="sticky bottom-0 grid gap-2 border-t border-seam bg-paper pt-3">
        {duplicate ? (
          <>
            <p className="text-small text-concrete">{copy.duplicate}</p>
            <Button onClick={() => add(duplicate)} disabled={!canIncrease}>
              {copy.increaseExisting}
            </Button>
            <Button variant="secondary" onClick={() => add()}>
              {copy.addSeparate}
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={!valid}>
            {copy.addItem}
          </Button>
        )}
      </div>
    </form>
  );
}

export function RequestPickerPage() {
  const { request, draft, revision, setRevision } = useRequest();
  const nodeId = Number(useParams().nodeId);
  const [selection, setSelection] = useState<Selection>();
  const options = useOptions();
  const canCreate = useCan('requests.create');
  if (!hasAction(request, 'saveDraft') && !revision)
    return <Navigate to={requestHref(request.id)} replace />;
  const form = revision?.form ?? draft.form;
  const pick = (item: CatalogItem) => setSelection({ item });
  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <Explorer
        mode="pick"
        nodeHref={(id) => pickerHref(request.id, id)}
        onPickItem={pick}
        onAddOther={(id) => setSelection({ nodeId: id })}
        beforeContents={
          nodeId === request.categoryId && canCreate ? (
            <RecentItems categoryId={request.categoryId} onPick={pick} />
          ) : undefined
        }
      />
      <div className="sticky bottom-0 z-20 flex items-center justify-between gap-2 rounded-control border border-seam bg-paper p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <p className="flex items-center gap-2 font-bold" aria-live="polite">
          <ShoppingBasket aria-hidden="true" size={20} />
          {copy.basket(formatNumber(form.items.length))}
        </p>
        <Link
          className={buttonClass('primary')}
          to={revision ? requestHref(request.id) : reviewHref(request.id)}
        >
          {copy.review}
        </Link>
      </div>
      <InlineError error={draft.error} retry={() => void draft.saveNow()} />
      {selection && (
        <Modal
          open
          title={'item' in selection ? selection.item.name : copy.addOther}
          onClose={() => setSelection(undefined)}
        >
          <LoadRecord query={options}>
            {({ units }) => (
              <ItemForm
                key={
                  'item' in selection ? selection.item.id : -selection.nodeId
                }
                selection={selection}
                units={units}
                existing={form.items}
                onAdd={(line, replace) => {
                  const items = replace
                    ? form.items.map((row) =>
                        row.key === replace
                          ? { ...row, quantity: line.quantity }
                          : row,
                      )
                    : [...form.items, line];
                  if (revision)
                    setRevision({ ...revision, form: { ...form, items } });
                  else draft.set({ ...form, items });
                  setSelection(undefined);
                }}
              />
            )}
          </LoadRecord>
        </Modal>
      )}
    </div>
  );
}
