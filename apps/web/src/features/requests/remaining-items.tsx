import { formatNumber } from '@purchasing-plus/shared';
import {
  ar,
  fulfilmentUi as copy,
  purchasingUi as buying,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import { outstanding, quantity } from '@purchasing-plus/shared/lifecycle';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { StatusChip } from '../../components/ui/chip.js';
import { usePrompt } from '../../components/ui/dialogs.js';
import { Field, NumberInput } from '../../components/ui/field.js';
import { Modal } from '../../components/ui/modal.js';
import { toast } from '../../components/ui/toast.js';
import { fulfilmentApi } from '../../lib/api/fulfilment.js';
import {
  purchasingApi,
  type SupplierContact,
} from '../../lib/api/purchasing.js';
import type { RequestDto, RequestLine } from '../../lib/api/requests.js';

import { PurchaseLineTitle, SupplierPicker } from './purchasing-pricing.js';
import type { PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

export function isFollowUpLine(line: RequestLine) {
  return line.state === 'UNAVAILABLE' || line.state === 'REMAINING';
}

export function ResolveItem({
  request,
  line,
  write,
}: {
  request: RequestDto;
  line: RequestLine;
  write: PurchaseWrite;
}) {
  const prompt = usePrompt();
  const resolve = useMutation({
    mutationFn: (note: string) =>
      write((version) =>
        fulfilmentApi.resolve(request.id, line.id, version, note || undefined),
      ),
    onSuccess: () => toast.success(copy.resolved),
  });
  if (!isFollowUpLine(line) || !hasAction(request, 'resolveExternally'))
    return null;
  async function ask() {
    const note = await prompt({
      title: copy.resolve,
      description: copy.resolveHint,
      label: requestUi.note,
      mode: 'reason',
      required: false,
      confirmLabel: copy.resolve,
    });
    if (note !== null) resolve.mutate(note);
  }
  return (
    <Button
      variant="secondary"
      loading={resolve.isPending}
      onClick={() => void ask()}
    >
      {copy.resolve}
    </Button>
  );
}

export function RemainingItems({
  request,
  suppliers,
  write,
}: {
  request: RequestDto;
  suppliers: SupplierContact[];
  write: PurchaseWrite;
}) {
  const lines = request.items.filter(isFollowUpLine);
  if (!lines.length) return null;
  return (
    <section className="grid min-w-0 gap-2">
      <h2 className="text-section">{copy.remaining}</h2>
      <ul className="divide-y divide-seam rounded-panel border border-seam bg-paper">
        {lines.map((line) => (
          <RemainingLine
            key={line.id}
            request={request}
            line={line}
            suppliers={suppliers}
            write={write}
          />
        ))}
      </ul>
    </section>
  );
}

function RemainingLine({
  request,
  line,
  suppliers,
  write,
}: {
  request: RequestDto;
  line: RequestLine;
  suppliers: SupplierContact[];
  write: PurchaseWrite;
}) {
  const [open, setOpen] = useState(false);
  const remaining = line.state === 'REMAINING';
  const canPrice = hasAction(
    request,
    remaining ? 'repriceRemaining' : 'priceUnavailable',
  );
  const stillComing = useMutation({
    mutationFn: () =>
      write((version) =>
        fulfilmentApi.stillComing(request.id, line.id, version),
      ),
    onSuccess: () => toast.success(copy.stillComingSaved),
  });
  return (
    <li className="grid gap-2 p-3">
      <PurchaseLineTitle line={line} />
      <div className="flex flex-wrap items-center gap-2 text-small">
        <StatusChip status={line.state} />
        {remaining && (
          <span>
            {copy.outstanding}{' '}
            <bdi>
              {formatNumber(line.outstanding ?? outstanding(line))}{' '}
              {line.snapshot.unitName}
            </bdi>
          </span>
        )}
      </div>
      {!remaining && line.unavailableNote && (
        <p className="whitespace-pre-wrap wrap-anywhere text-small text-concrete">
          {line.unavailableNote}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {remaining && hasAction(request, 'stillComing') && (
          <Button
            variant="secondary"
            loading={stillComing.isPending}
            onClick={() => stillComing.mutate()}
          >
            {copy.stillComing}
          </Button>
        )}
        {canPrice && (
          <Button
            variant="secondary"
            disabled={stillComing.isPending}
            onClick={() => setOpen(true)}
          >
            {remaining ? copy.reprice : copy.priceUnavailable}
          </Button>
        )}
        <ResolveItem request={request} line={line} write={write} />
      </div>
      {open && canPrice && (
        <FollowUpPrice
          request={request}
          line={line}
          suppliers={suppliers}
          write={write}
          onClose={() => setOpen(false)}
        />
      )}
    </li>
  );
}

function FollowUpPrice({
  request,
  line,
  suppliers,
  write,
  onClose,
}: {
  request: RequestDto;
  line: RequestLine;
  suppliers: SupplierContact[];
  write: PurchaseWrite;
  onClose: () => void;
}) {
  const [supplier, setSupplier] = useState<
    { id: number; name: string } | undefined
  >(
    line.state === 'REMAINING' && line.supplierId && line.supplierName
      ? { id: line.supplierId, name: line.supplierName }
      : undefined,
  );
  const [total, setTotal] = useState('');
  const [picking, setPicking] = useState(false);
  const remaining = line.state === 'REMAINING';
  const label = remaining ? copy.reprice : copy.priceUnavailable;
  const valid = quantity.safeParse(total).success;
  const save = useMutation({
    mutationFn: (supplierId: number) =>
      write((version) => {
        const body = { version, supplierId, lineTotal: total };
        return remaining
          ? fulfilmentApi.reprice(request.id, line.id, body)
          : purchasingApi.savePrice(request.id, line.id, body);
      }),
    onSuccess: () => {
      toast.success(remaining ? copy.repriced : copy.priceSaved);
      onClose();
    },
  });
  return (
    <>
      <Modal
        open
        title={label}
        description={remaining ? copy.repriceHint : copy.unavailablePriceHint}
        dismissible={!save.isPending}
        onClose={onClose}
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && supplier) save.mutate(supplier.id);
          }}
        >
          <p className="wrap-anywhere font-semibold">
            <bdi>{line.snapshot.name}</bdi>
          </p>
          <Button
            variant="secondary"
            aria-label={buying.supplier}
            disabled={save.isPending}
            onClick={() => setPicking(true)}
          >
            <bdi className="wrap-anywhere">
              {supplier?.name ?? buying.choosePriceSupplier}
            </bdi>
          </Button>
          <Field
            label={copy.lineTotal}
            required
            error={total && !valid ? buying.positiveTotal : undefined}
          >
            {(props) => (
              <NumberInput
                {...props}
                disabled={save.isPending}
                value={total}
                onValueChange={setTotal}
              />
            )}
          </Field>
          <InlineError error={save.error} />
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!valid || !supplier}
          >
            {ar.common.save}
          </Button>
        </form>
      </Modal>
      {picking && (
        <SupplierPicker
          id={request.id}
          category={suppliers}
          onClose={() => setPicking(false)}
          onPick={(supplier) => {
            setSupplier(supplier);
            setPicking(false);
          }}
        />
      )}
    </>
  );
}
