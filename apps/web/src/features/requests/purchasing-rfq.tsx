import {
  buildRfqMessage,
  defaultSettings,
  formatDateTime,
  formatNumber,
} from '@purchasing-plus/shared';
import {
  ar,
  purchasingUi as copy,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';
import { useState } from 'react';

import {
  InlineError,
  LoadRecord,
} from '../../components/shared/record-feedback.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { Chip } from '../../components/ui/chip.js';
import { Field, Textarea } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import {
  purchasingApi,
  purchasingKey,
  type BatchSupplier,
  type PurchasingLine,
  type PurchasingView,
  type RfqBatch,
  type SupplierContact,
} from '../../lib/api/purchasing.js';

import type { PurchaseWrite } from './purchasing-writes.js';

export async function copyText(text: string, message: string) {
  try {
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(text);
    else {
      const focused = document.activeElement as HTMLElement | null;
      const area = document.createElement('textarea');
      area.value = text;
      area.className = 'sr-only';
      (focused?.closest('dialog') ?? document.body).append(area);
      area.select();
      try {
        if (!document.execCommand('copy')) throw new Error(copy.copyFailed);
      } finally {
        area.remove();
        focused?.focus();
      }
    }
    toast.success(message);
  } catch {
    toast.error(copy.copyFailed);
  }
}

export function SupplierPhone({ supplier }: { supplier: SupplierContact }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-small">
      <bdi dir="ltr" className="numeric text-concrete">
        {supplier.whatsappDisplay}
      </bdi>
      <Button
        variant="ghost"
        iconOnly
        aria-label={copy.copyPhone + ' ' + supplier.name}
        onClick={() => void copyText(supplier.whatsappNumber, copy.copiedPhone)}
      >
        <Copy size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}

export function SelectRow({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-target min-w-0 cursor-pointer items-start gap-3 rounded-control p-2 hover:bg-plaster has-checked:bg-ppr-wash">
      <input
        type="checkbox"
        aria-label={label}
        className="mt-1.5 size-5 shrink-0 accent-ppr"
        checked={checked}
        onChange={onChange}
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function SentHistory({
  line,
  onClose,
}: {
  line: PurchasingLine;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      title={copy.history}
      description={line.snapshot.name}
      onClose={onClose}
    >
      <ul className="divide-y divide-seam">
        {line.sentTo?.map((entry) => (
          <li
            key={entry.batchId + ':' + entry.supplierId}
            className="grid gap-1 py-2"
          >
            <bdi className="wrap-anywhere font-bold">{entry.supplierName}</bdi>
            <time className="text-small text-concrete" dateTime={entry.sentAt}>
              {formatDateTime(entry.sentAt)}
            </time>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function BatchComposer({
  request,
  items,
  template,
  write,
  onClose,
  onCreated,
}: {
  request: PurchasingView;
  items: PurchasingLine[];
  template?: string;
  write: PurchaseWrite;
  onClose: () => void;
  onCreated: (batch: RfqBatch) => void;
}) {
  const [step, setStep] = useState<'suppliers' | 'message'>('suppliers');
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState<string>();
  const itemIds = items.map((item) => item.id);
  const query = useQuery({
    queryKey: [...purchasingKey(request.id), 'selection', itemIds],
    queryFn: ({ signal }) => purchasingApi.get(request.id, signal, itemIds),
  });
  const create = useMutation({
    mutationFn: () =>
      write((version) =>
        purchasingApi.createBatch(request.id, {
          version,
          itemIds,
          supplierIds: selected,
          message: message!.trim(),
        }),
      ),
    onSuccess: (result) => onCreated(result.batch),
  });
  const suppliers = query.data?.suppliers ?? [];
  function forward() {
    if (!selected.length) return;
    setMessage(
      (previous) =>
        previous ??
        buildRfqMessage(
          template ?? defaultSettings.rfqIntro,
          {
            requestNumber: request.number ?? '',
            siteName: request.site.name,
            categoryName: request.category.name,
          },
          items.map((item) => ({
            name: item.snapshot.name,
            lineNo: item.lineNo,
            specs: item.specs,
            quantity: item.quantity,
            unit: item.snapshot.unitName,
          })),
        ),
    );
    setStep('message');
  }
  return (
    <Modal
      key={step}
      open
      title={step === 'suppliers' ? copy.chooseSuppliers : copy.message}
      dismissible={!create.isPending}
      onClose={onClose}
    >
      {step === 'suppliers' ? (
        <LoadRecord query={query}>
          {() =>
            suppliers.length ? (
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        selected.length === suppliers.length
                          ? []
                          : suppliers.map((s) => s.id),
                      )
                    }
                  >
                    {selected.length === suppliers.length
                      ? copy.clearSelection
                      : copy.selectAll}
                  </Button>
                  <p className="text-small text-concrete">
                    {copy.selection(formatNumber(items.length))}
                  </p>
                </div>
                <ul className="divide-y divide-seam">
                  {suppliers.map((supplier) => (
                    <li key={supplier.id} className="min-w-0 py-1">
                      <SelectRow
                        label={copy.selectSupplier(supplier.name)}
                        checked={selected.includes(supplier.id)}
                        onChange={() =>
                          setSelected((values) =>
                            values.includes(supplier.id)
                              ? values.filter((id) => id !== supplier.id)
                              : [...values, supplier.id],
                          )
                        }
                      >
                        <bdi className="block wrap-anywhere font-bold">
                          {supplier.name}
                        </bdi>
                        <span className="block text-small text-concrete">
                          {copy.alreadyReceived(
                            formatNumber(supplier.alreadyReceivedCount),
                          )}
                        </span>
                      </SelectRow>
                      <SupplierPhone supplier={supplier} />
                    </li>
                  ))}
                </ul>
                <div className="sticky bottom-0 grid gap-1 border-t border-seam bg-paper pt-2">
                  <Button disabled={!selected.length} onClick={forward}>
                    {ar.common.next}
                  </Button>
                  {!selected.length && (
                    <p className="text-small text-concrete">
                      {copy.chooseAtLeastOne}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState title={copy.noSuppliers} />
            )
          }
        </LoadRecord>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (message?.trim() && !create.isPending) create.mutate();
          }}
        >
          <Field label={copy.message}>
            {(props) => (
              <Textarea
                {...props}
                value={message ?? ''}
                maxLength={65536}
                rows={7}
                onChange={(event) => setMessage(event.currentTarget.value)}
              />
            )}
          </Field>
          <InlineError error={create.error} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={!message?.trim()}
              loading={create.isPending}
            >
              {copy.send}
            </Button>
            <Button
              variant="secondary"
              disabled={create.isPending}
              onClick={() => setStep('suppliers')}
            >
              {ar.common.previous}
            </Button>
          </div>
          {!message?.trim() && (
            <p className="text-small text-concrete">{copy.messageRequired}</p>
          )}
        </form>
      )}
    </Modal>
  );
}

export function SendBatchSheet({
  id,
  batch,
  canMark,
  canEdit,
  write,
  onUpdate,
  onClose,
}: {
  id: number;
  batch: RfqBatch;
  canMark: boolean;
  canEdit: boolean;
  write: PurchaseWrite;
  onUpdate: (batch: RfqBatch) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      title={copy.send}
      description={copy.batchLabel(formatNumber(batch.itemIds.length))}
      onClose={onClose}
    >
      <ul className="grid gap-2">
        {batch.suppliers?.map((row) => (
          <SendRecipient
            key={row.supplierId}
            row={row}
            canMark={canMark}
            canEdit={canEdit}
            edit={(version, message) =>
              purchasingApi.editMessage(
                id,
                batch.id,
                row.supplierId,
                version,
                message,
              )
            }
            send={(version) =>
              purchasingApi.markSent(id, batch.id, row.supplierId, version)
            }
            write={write}
            onUpdate={onUpdate}
          />
        ))}
      </ul>
    </Modal>
  );
}
function SendRecipient({
  row,
  canMark,
  canEdit,
  edit,
  send,
  write,
  onUpdate,
}: {
  row: BatchSupplier;
  canMark: boolean;
  canEdit: boolean;
  edit: (
    version: number,
    message: string,
  ) => ReturnType<typeof purchasingApi.editMessage>;
  send: (version: number) => ReturnType<typeof purchasingApi.markSent>;
  write: PurchaseWrite;
  onUpdate: (batch: RfqBatch) => void;
}) {
  const [message, setMessage] = useState<string>();
  const mutation = useMutation({
    mutationFn: (effect: 'edit' | 'sent') =>
      write((version) =>
        effect === 'edit' ? edit(version, message!) : send(version),
      ),
    onSuccess: ({ batch }, effect) => {
      onUpdate(batch);
      setMessage(undefined);
      if (effect === 'edit') toast.success(requestUi.saved);
    },
  });
  return (
    <li className="grid min-w-0 gap-2 rounded-control border border-seam p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <bdi className="wrap-anywhere text-subtitle">{row.supplier.name}</bdi>
        <span role="status">
          {row.sentAt && (
            <Chip
              tone="success"
              icon={<CheckCircle2 size={14} aria-hidden="true" />}
            >
              {copy.markSent}
            </Chip>
          )}
        </span>
      </div>
      <SupplierPhone supplier={row.supplier} />
      {row.tooLong && (
        <p className="rounded-control bg-pending-bg p-2 text-small text-pending-fg">
          {copy.longMessage}
        </p>
      )}
      {row.message !== undefined && (
        <div className="flex flex-wrap gap-2">
          {!row.tooLong && row.waUrl && (
            <a
              href={row.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('secondary')}
            >
              {copy.openWhatsApp}
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          )}
          <Button
            variant={row.tooLong ? 'primary' : 'secondary'}
            onClick={() => void copyText(row.message!, copy.copiedMessage)}
          >
            {copy.copyMessage}
          </Button>
          {canMark && !row.sentAt && (
            <Button
              variant="secondary"
              loading={mutation.isPending && mutation.variables === 'sent'}
              disabled={mutation.isPending || message !== undefined}
              onClick={() => mutation.mutate('sent')}
            >
              {copy.markSent}
            </Button>
          )}
        </div>
      )}
      {row.sentAt && (
        <p className="text-micro text-concrete">
          {copy.sentAt(formatDateTime(row.sentAt))}
        </p>
      )}
      {canEdit &&
        !row.sentAt &&
        row.message !== undefined &&
        message === undefined && (
          <Button
            variant="ghost"
            className="justify-self-start"
            disabled={mutation.isPending}
            onClick={() => setMessage(row.message)}
          >
            {copy.editMessage}
          </Button>
        )}
      {message !== undefined && (
        <div className="grid gap-2">
          <Field label={copy.message}>
            {(props) => (
              <Textarea
                {...props}
                maxLength={65536}
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.currentTarget.value)}
              />
            )}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!message.trim()}
              loading={mutation.isPending}
              onClick={() => mutation.mutate('edit')}
            >
              {ar.common.save}
            </Button>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => setMessage(undefined)}
            >
              {ar.common.cancel}
            </Button>
          </div>
        </div>
      )}
      <InlineError error={mutation.error} />
    </li>
  );
}
