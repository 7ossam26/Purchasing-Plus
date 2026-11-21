import {
  formatDateTime,
  formatNumber,
  receiptInput,
} from '@purchasing-plus/shared';
import {
  fulfilmentUi as copy,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import {
  outstanding,
  sameDecimal,
  validReceiptQuantity,
} from '@purchasing-plus/shared/lifecycle';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ActionBar } from '../../components/shared/action-bar.js';
import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { StatusChip } from '../../components/ui/chip.js';
import { Field, NumberInput, Textarea } from '../../components/ui/field.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import { fulfilmentApi, type ReceiptInput } from '../../lib/api/fulfilment.js';
import type { RequestDto } from '../../lib/api/requests.js';

import { PurchaseLineTitle } from './purchasing-pricing.js';
import type { PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

type Entry = { quantity: string; note: string };
const blank: Entry = { quantity: '', note: '' };

export function ReceiptTab({
  request,
  write,
}: {
  request: RequestDto;
  write: PurchaseWrite;
}) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const eligible = hasAction(request, 'recordReceipt')
    ? request.items.filter((line) => line.state === 'AWAITING_RECEIPT')
    : [];
  const rows = eligible.map((line) => {
    const entry = entries[line.id] ?? blank;
    const remaining = line.outstanding ?? outstanding(line);
    const entered = !!(entry.quantity || entry.note.trim());
    return {
      line,
      entry,
      remaining,
      entered,
      invalid: entered && !validReceiptQuantity(entry.quantity, remaining),
    };
  });
  const selected = rows.filter((row) => row.entered);
  const partial = selected.some(
    ({ entry, remaining, invalid }) =>
      !invalid && !sameDecimal(entry.quantity, remaining),
  );
  const lines = selected.map(({ line, entry }) => ({
    itemId: line.id,
    quantity: entry.quantity,
    note: entry.note.trim() || undefined,
  }));
  const reason = !selected.length
    ? copy.selectReceipt
    : selected.some((row) => row.invalid)
      ? copy.badQuantity
      : undefined;
  const save = useMutation({
    mutationFn: (lines: ReceiptInput['lines']) =>
      write((version) =>
        fulfilmentApi.receive(
          request.id,
          receiptInput.parse({ version, lines }),
        ),
      ),
    onSuccess: () => {
      setEntries({});
      toast.success(copy.recorded);
    },
  });
  function change(id: number, field: keyof Entry, value: string) {
    setEntries((current) => ({
      ...current,
      [id]: { ...(current[id] ?? blank), [field]: value },
    }));
  }
  return (
    <div className="grid min-w-0 gap-3">
      {rows.length ? (
        <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
          {rows.map(({ line, entry, remaining, invalid }) => (
            <li key={line.id} className="p-3">
              <fieldset
                disabled={save.isPending}
                className="grid min-w-0 gap-2"
              >
                <legend className="sr-only">{line.snapshot.name}</legend>
                <PurchaseLineTitle line={line} />
                <div className="flex flex-wrap items-center gap-2 text-small">
                  <StatusChip status={line.state} />
                  <span>
                    {copy.outstanding}{' '}
                    <bdi className="font-bold">
                      {formatNumber(remaining)} {line.snapshot.unitName}
                    </bdi>
                  </span>
                </div>
                <Button
                  variant="secondary"
                  className="justify-self-start"
                  aria-pressed={
                    !invalid &&
                    entry.quantity !== '' &&
                    sameDecimal(entry.quantity, remaining)
                  }
                  onClick={() => change(line.id, 'quantity', remaining)}
                >
                  {copy.receiveAll}
                </Button>
                <Field
                  label={copy.receiptQuantity}
                  error={invalid ? copy.badQuantity : undefined}
                >
                  {(props) => (
                    <NumberInput
                      {...props}
                      value={entry.quantity}
                      onValueChange={(value) =>
                        change(line.id, 'quantity', value)
                      }
                    />
                  )}
                </Field>
                <Field label={requestUi.note}>
                  {(props) => (
                    <Textarea
                      {...props}
                      rows={2}
                      maxLength={4000}
                      value={entry.note}
                      onChange={(event) =>
                        change(line.id, 'note', event.currentTarget.value)
                      }
                    />
                  )}
                </Field>
              </fieldset>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={copy.noReceipt} />
      )}
      <ReceiptHistory request={request} />
      <InlineError error={save.error} />
      {rows.length > 0 && (
        <div className="sticky bottom-0 z-20 bg-paper">
          {partial && (
            <p className="border-t border-seam p-2 text-small text-pending-fg">
              {copy.partialReceipt}
            </p>
          )}
          <ActionBar
            fullWidthPrimary
            sticky={false}
            primary={{
              id: 'receipt',
              label: copy.record,
              reason,
              loading: save.isPending,
              onClick: () => save.mutate(lines),
            }}
          />
        </div>
      )}
    </div>
  );
}

function ReceiptHistory({ request }: { request: RequestDto }) {
  const items = new Map(request.items.map((line) => [line.id, line]));
  return (
    <section className="grid gap-2 rounded-panel border border-seam bg-paper p-3">
      <h2 className="text-subtitle">{copy.receiptHistory}</h2>
      {request.receipts?.length ? (
        <ol className="divide-y divide-seam">
          {request.receipts
            .slice()
            .reverse()
            .map((receipt) => (
              <li key={receipt.id} className="grid gap-1 py-2">
                <p className="flex flex-wrap gap-x-2 font-semibold">
                  <bdi>{receipt.recordedBy.name}</bdi>
                  <time
                    dateTime={receipt.recordedAt}
                    className="text-small text-concrete"
                  >
                    {formatDateTime(receipt.recordedAt)}
                  </time>
                </p>
                {receipt.note && (
                  <p className="whitespace-pre-wrap wrap-anywhere text-small">
                    {receipt.note}
                  </p>
                )}
                <ul className="grid gap-1 text-small">
                  {receipt.lines.map((line) => {
                    const item = items.get(line.itemId);
                    return (
                      <li key={line.itemId} className="wrap-anywhere">
                        <bdi>
                          {item?.snapshot.name ?? formatNumber(line.itemId)}
                        </bdi>{' '}
                        ·{' '}
                        <bdi>
                          {formatNumber(line.quantity)}{' '}
                          {item?.snapshot.unitName}
                        </bdi>
                        {line.note && (
                          <p className="whitespace-pre-wrap text-concrete">
                            {line.note}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
        </ol>
      ) : (
        <EmptyState title={copy.noHistory} />
      )}
    </section>
  );
}
