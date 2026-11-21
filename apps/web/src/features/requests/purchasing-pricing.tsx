import { formatMoney, formatNumber } from '@purchasing-plus/shared';
import { ar, purchasingUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  amount,
  isClosed,
  quantity,
  sameDecimal,
  unitPrice,
} from '@purchasing-plus/shared/lifecycle';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import { Pagination } from '../../components/shared/pagination.js';
import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { StatusChip } from '../../components/ui/chip.js';
import { ToggleRow } from '../../components/ui/choice.js';
import { usePrompt } from '../../components/ui/dialogs.js';
import { Field, Input, NumberInput } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import {
  purchasingApi,
  purchasingKey,
  type PurchasingLine,
  type PurchasingView,
  type SupplierContact,
} from '../../lib/api/purchasing.js';

import {
  usePurchaseAutosave,
  type ReportSave,
  type SaveStatus,
} from './purchasing-autosave.js';
import { SupplierPhone } from './purchasing-rfq.js';
import type { PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

export function PurchaseLineTitle({ line }: { line: PurchasingLine }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="numeric text-micro text-concrete">
          {formatNumber(line.lineNo)}
        </span>
        <bdi className="wrap-anywhere text-subtitle">{line.snapshot.name}</bdi>
      </span>
      {line.specs && (
        <bdi className="block whitespace-pre-wrap wrap-anywhere text-small text-concrete">
          {line.specs}
        </bdi>
      )}
      <span className="text-small text-concrete">
        <bdi className="numeric">{formatNumber(line.quantity)}</bdi>{' '}
        <bdi>{line.snapshot.unitName}</bdi>
      </span>
    </span>
  );
}
export function PurchaseLineFlags({ line }: { line: PurchasingLine }) {
  return (
    <>
      {line.needsRepricing && (
        <StatusMessage>{copy.needsRepricing}</StatusMessage>
      )}
      {line.modifiedAfterSend && (
        <StatusMessage>{copy.modifiedAfterSend}</StatusMessage>
      )}
      {line.state === 'UNAVAILABLE' && <StatusChip status="UNAVAILABLE" />}
    </>
  );
}
function StatusMessage({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-distinct-bg px-2 py-1 text-micro font-bold text-distinct-fg">
      {children}
    </span>
  );
}

function SupplierPicker({
  id,
  category,
  onPick,
  onClose,
}: {
  id: number;
  category: SupplierContact[];
  onPick: (supplier: SupplierContact) => void;
  onClose: () => void;
}) {
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search.trim());
  const suppliers = useQuery({
    queryKey: [...purchasingKey(id), 'supplier-directory', page, q],
    enabled: all,
    queryFn: ({ signal }) => purchasingApi.suppliers(id, page, q, signal),
  });
  function rows(options: SupplierContact[]) {
    return options.length ? (
      <ul className="divide-y divide-seam">
        {options.map((supplier) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 py-1"
            key={supplier.id}
          >
            <Button
              variant="ghost"
              className="min-w-0 justify-start whitespace-normal text-start"
              onClick={() => onPick(supplier)}
            >
              <bdi className="wrap-anywhere">{supplier.name}</bdi>
            </Button>
            <SupplierPhone supplier={supplier} />
          </li>
        ))}
      </ul>
    ) : (
      <EmptyState
        title={q ? copy.supplierNotFound : copy.noSuppliers}
        action={
          q ? (
            <Button
              variant="secondary"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
            >
              {ar.common.resetFilters}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <Modal open title={copy.supplier} onClose={onClose}>
      <div className="grid gap-3">
        <ToggleRow
          label={copy.allSuppliers}
          checked={all}
          onChange={(value) => {
            setAll(value);
            setPage(1);
          }}
        />
        <Field label={copy.searchSupplier}>
          {(props) => (
            <Input
              {...props}
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
            />
          )}
        </Field>
        {all ? (
          <LoadRecord query={suppliers}>
            {(result) => (
              <>
                {rows(result.items)}
                {result.total > result.pageSize && (
                  <Pagination {...result} onPageChange={setPage} />
                )}
              </>
            )}
          </LoadRecord>
        ) : (
          rows(
            category.filter(
              (supplier) =>
                !q ||
                supplier.name
                  .toLocaleLowerCase()
                  .includes(q.toLocaleLowerCase()) ||
                supplier.whatsappNumber.includes(q),
            ),
          )
        )}
      </div>
    </Modal>
  );
}
function SaveMessage({
  status,
  error,
  retry,
  always = false,
}: {
  status: SaveStatus | null;
  error: Error | null;
  retry: () => void;
  always?: boolean;
}) {
  return (
    <>
      {(always || status) && (
        <span role="status" className="text-micro text-concrete">
          {status === 'saving'
            ? copy.pricePending
            : status
              ? copy.priceUnsaved
              : copy.priceSaved}
        </span>
      )}
      <InlineError error={error} retry={retry} />
    </>
  );
}

type PriceInput = {
  supplierId: number | null;
  total: string;
  name?: string | null;
};
const cleared: PriceInput = { supplierId: null, total: '' };
function PricingLine({
  data,
  line,
  write,
  report,
}: {
  data: PurchasingView;
  line: PurchasingLine;
  write: PurchaseWrite;
  report: ReportSave;
}) {
  const [picker, setPicker] = useState(false);
  const prompt = usePrompt();
  const isUnavailable = line.state === 'UNAVAILABLE';
  const canPrice = isUnavailable
    ? hasAction(data, 'priceUnavailable')
    : line.state === 'OPEN' && hasAction(data, 'savePricingDraft');
  const canMark = line.state === 'OPEN' && hasAction(data, 'markUnavailable');
  const canRestore = isUnavailable && hasAction(data, 'markAvailable');
  const availability = useMutation({
    mutationFn: ({
      unavailable,
      note,
    }: {
      unavailable: boolean;
      note?: string;
    }) =>
      write((version) =>
        purchasingApi.availability(
          data.id,
          line.id,
          version,
          unavailable,
          note,
        ),
      ),
    onSuccess: () => toast.success(copy.availabilitySaved),
  });
  const saved = {
    supplierId: line.supplierId ?? null,
    total: line.lineTotal ?? '',
    name: line.supplierName,
  };
  const field = usePurchaseAutosave<PriceInput>({
    key: 'price-' + line.id,
    saved,
    report,
    valid: (input) =>
      input.supplierId === null
        ? input.total === ''
        : quantity.safeParse(input.total).success,
    equal: (a, b) =>
      a.supplierId === b.supplierId && amountEqual(a.total, b.total),
    deliver: (input) =>
      write((version) =>
        purchasingApi.savePrice(
          data.id,
          line.id,
          input.supplierId === null
            ? { version, supplierId: null, lineTotal: null }
            : { version, supplierId: input.supplierId, lineTotal: input.total },
        ),
      ),
  });
  const total = field.value.total;
  const chosen =
    field.value.name ??
    data.suppliers?.find((supplier) => supplier.id === field.value.supplierId)
      ?.name;
  const validTotal = quantity.safeParse(total).success;
  const missingSupplier = validTotal && field.value.supplierId === null;
  async function toggle(unavailable: boolean) {
    if (availability.isPending) return;
    const note = unavailable
      ? await prompt({
          title: copy.unavailable,
          label: copy.unavailableNote,
          confirmLabel: copy.unavailable,
        })
      : undefined;
    if (note === null) return;
    field.reset();
    availability.mutate({ unavailable, note });
  }
  return (
    <li className="grid min-w-0 gap-2 p-3 sm:p-4">
      <PurchaseLineTitle line={line} />
      <div className="flex flex-wrap gap-1.5">
        <PurchaseLineFlags line={line} />
      </div>
      {canMark || canRestore ? (
        <ToggleRow
          label={copy.unavailable}
          description={line.unavailableNote ?? undefined}
          checked={isUnavailable}
          disabled={availability.isPending}
          onChange={(value) => void toggle(value)}
        />
      ) : (
        line.unavailableNote && (
          <p className="whitespace-pre-wrap wrap-anywhere text-small text-concrete">
            {line.unavailableNote}
          </p>
        )
      )}
      <InlineError error={availability.error} />
      {canPrice ? (
        <>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2 sm:items-start">
            <div className="grid min-w-0 gap-1">
              <span className="text-small font-semibold">{copy.supplier}</span>
              <Button
                variant="secondary"
                className="min-w-0 justify-between whitespace-normal text-start"
                aria-label={
                  copy.supplierFor(line.snapshot.name) +
                  (chosen ? ' · ' + chosen : '')
                }
                onClick={() => setPicker(true)}
              >
                <bdi className="wrap-anywhere">
                  {chosen ?? ar.common.choose}
                </bdi>
                <ChevronDown
                  size={16}
                  className="shrink-0"
                  aria-hidden="true"
                />
              </Button>
            </div>
            <Field
              label={copy.priceLine}
              error={total && !validTotal ? copy.positiveTotal : undefined}
            >
              {(props) => (
                <NumberInput
                  {...props}
                  aria-label={copy.priceFor(line.snapshot.name)}
                  value={total}
                  onValueChange={(total) =>
                    field.set({ ...field.value, total })
                  }
                />
              )}
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            {validTotal && (
              <span className="numeric text-small text-concrete">
                {copy.unitPrice(unitPrice(total, line.quantity))}
              </span>
            )}
            <SaveMessage
              status={field.status}
              error={null}
              retry={field.retry}
              always={saved.supplierId !== null}
            />
          </div>
          {missingSupplier && (
            <p className="text-small text-concrete">
              {copy.choosePriceSupplier}
            </p>
          )}
          {(field.value.supplierId !== null ||
            total ||
            saved.supplierId !== null) && (
            <Button
              className="justify-self-start"
              variant="ghost"
              onClick={() => field.set(cleared)}
            >
              {copy.clearQuote}
            </Button>
          )}
          <InlineError error={field.error} retry={field.retry} />
        </>
      ) : (
        line.lineTotal && (
          <div className="flex flex-wrap gap-2 text-small">
            {line.supplierName && <bdi>{line.supplierName}</bdi>}
            <bdi>{formatMoney(line.lineTotal)}</bdi>
          </div>
        )
      )}
      {picker && canPrice && (
        <SupplierPicker
          id={data.id}
          category={data.suppliers ?? []}
          onClose={() => setPicker(false)}
          onPick={(supplier) => {
            field.set({
              ...field.value,
              supplierId: supplier.id,
              name: supplier.name,
            });
            setPicker(false);
          }}
        />
      )}
    </li>
  );
}

function amountEqual(a: string, b: string) {
  return (
    a === b ||
    (amount.safeParse(a).success &&
      amount.safeParse(b).success &&
      sameDecimal(a, b))
  );
}

function DeliveryFee({
  data,
  write,
  report,
}: {
  data: PurchasingView;
  write: PurchaseWrite;
  report: ReportSave;
}) {
  const field = usePurchaseAutosave({
    key: 'deliveryFee',
    saved: data.deliveryFee ?? '',
    report,
    valid: (value) => value === '' || amount.safeParse(value).success,
    equal: amountEqual,
    deliver: (value) =>
      write((version) => purchasingApi.fee(data.id, version, value || null)),
  });
  return (
    <div className="grid min-w-0 gap-1">
      <Field
        label={copy.deliveryFee}
        hint={copy.separateFee}
        error={
          field.value && !amount.safeParse(field.value).success
            ? copy.validFee
            : undefined
        }
      >
        {(props) => (
          <NumberInput
            {...props}
            value={field.value}
            onValueChange={field.set}
          />
        )}
      </Field>
      <SaveMessage
        status={field.status}
        error={field.error}
        retry={field.retry}
      />
    </div>
  );
}

export function PricingMode({
  data,
  write,
  report,
  saveStatus,
}: {
  data: PurchasingView;
  write: PurchaseWrite;
  report: ReportSave;
  saveStatus: SaveStatus[];
}) {
  const [review, setReview] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      write((version) => purchasingApi.submit(data.id, version)),
    onSuccess: () => {
      setReview(false);
      toast.success(copy.submitted);
    },
  });
  const price = data.pricing;
  if (!price) return null;
  const blocker = price.submitBlocker;
  const allowed = hasAction(data, 'submitPricing');
  const displaySubmit =
    allowed || blocker === 'NEEDS_REPRICING' || blocker === 'NO_PRICED_ITEMS';
  const reason =
    saveStatus.includes('dirty') || saveStatus.includes('saving')
      ? copy.pending
      : saveStatus.includes('failed') || saveStatus.includes('incomplete')
        ? copy.fixSave
        : blocker === 'NEEDS_REPRICING'
          ? copy.unresolved
          : blocker === 'NO_PRICED_ITEMS'
            ? copy.noPrice
            : undefined;
  const open = data.items.filter((line) => !isClosed(line));
  return (
    <div className="grid min-w-0 gap-3">
      {open.length ? (
        <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
          {open.map((line) => (
            <PricingLine
              key={line.id}
              data={data}
              line={line}
              write={write}
              report={report}
            />
          ))}
        </ul>
      ) : (
        <EmptyState title={copy.noItems} />
      )}
      <section className="grid min-w-0 gap-3 rounded-panel border border-seam bg-paper p-3">
        <dl className="flex flex-wrap items-baseline justify-between gap-x-2">
          <dt className="font-bold">{copy.total}</dt>
          <dd className="numeric text-section">
            <bdi>{formatMoney(price.total)}</bdi>
          </dd>
        </dl>
        {hasAction(data, 'editDeliveryFee') ? (
          <DeliveryFee data={data} write={write} report={report} />
        ) : (
          data.deliveryFee !== null &&
          data.deliveryFee !== undefined && (
            <p className="text-small">
              {copy.deliveryFee} · {copy.separateFee}{' '}
              <bdi>{formatMoney(data.deliveryFee)}</bdi>
            </p>
          )
        )}
      </section>
      {displaySubmit && (
        <div className="sticky bottom-0 z-20 grid gap-1 border-t border-seam bg-paper p-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:rounded-control sm:border">
          <Button
            disabled={!allowed || !!reason}
            onClick={() => setReview(true)}
          >
            {copy.submit}
          </Button>
          {reason && <p className="text-small text-concrete">{reason}</p>}
        </div>
      )}
      {review && (
        <Modal
          open
          title={copy.submitQuestion}
          dismissible={!submit.isPending}
          onClose={() => setReview(false)}
        >
          <dl className="divide-y divide-seam">
            {[
              {
                label: copy.pricedCount,
                value: formatNumber(price.pricedCount),
              },
              {
                label: copy.unavailableCount,
                value: formatNumber(price.unavailableCount),
              },
              {
                label: copy.roundTotal,
                value: formatMoney(price.pendingTotal),
              },
              {
                label: copy.deliveryFee,
                value: formatMoney(data.deliveryFee ?? '0.00'),
                hint: copy.separateFee,
              },
            ].map(({ label, value, hint }) => (
              <div
                key={label}
                className="flex flex-wrap justify-between gap-x-2 py-2"
              >
                <dt>
                  {label}
                  {hint && (
                    <span className="block text-micro text-concrete">
                      {hint}
                    </span>
                  )}
                </dt>
                <dd className="numeric font-bold">
                  <bdi>{value}</bdi>
                </dd>
              </div>
            ))}
          </dl>
          <InlineError error={submit.error} />
          <Button
            className="mt-3 w-full"
            loading={submit.isPending}
            disabled={!allowed || !!reason}
            onClick={() => submit.mutate()}
          >
            {copy.submit}
          </Button>
        </Modal>
      )}
    </div>
  );
}
