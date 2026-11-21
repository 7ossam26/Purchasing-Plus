import { formatDateTime, formatNumber } from '@purchasing-plus/shared';
import {
  ar,
  fulfilmentUi as copy,
  purchasingUi as buying,
} from '@purchasing-plus/shared/i18n/ar';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button, buttonClass } from '../../components/ui/button.js';
import { Field, Textarea } from '../../components/ui/field.js';
import { EmptyState } from '../../components/ui/states.js';
import { toast } from '../../components/ui/toast.js';
import { fulfilmentApi, type SupplyOrder } from '../../lib/api/fulfilment.js';
import type { RequestDto } from '../../lib/api/requests.js';

import { copyText } from './purchasing-rfq.js';
import type { PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

export function SupplyOrders({
  request,
  write,
}: {
  request: RequestDto;
  write: PurchaseWrite;
}) {
  const bySupplier = new Map<number, SupplyOrder[]>();
  for (const order of request.supplyOrders ?? []) {
    const key = order.supplier?.id ?? -order.id;
    const orders = bySupplier.get(key);
    if (orders) orders.push(order);
    else bySupplier.set(key, [order]);
  }
  return (
    <section className="grid min-w-0 gap-2">
      <h2 className="text-section">{copy.orders}</h2>
      {bySupplier.size ? (
        Array.from(bySupplier, ([key, orders]) => (
          <article
            key={key}
            className="grid min-w-0 gap-2 rounded-panel border border-seam bg-paper p-3"
          >
            {orders[0]?.supplier && (
              <h3 className="wrap-anywhere text-subtitle">
                <bdi>{orders[0].supplier.name}</bdi>
              </h3>
            )}
            <div className="grid min-w-0 divide-y divide-seam">
              {orders.map((order) => (
                <OrderDetails
                  key={order.id}
                  request={request}
                  order={order}
                  write={write}
                />
              ))}
            </div>
          </article>
        ))
      ) : (
        <EmptyState title={copy.noOrders} />
      )}
    </section>
  );
}

function OrderDetails({
  request,
  order,
  write,
}: {
  request: RequestDto;
  order: SupplyOrder;
  write: PurchaseWrite;
}) {
  const [draft, setDraft] = useState<string>();
  const message = draft ?? order.message ?? '';
  const dirty = message !== order.message && order.message !== undefined;
  const canEdit =
    !order.sentAt &&
    order.message !== undefined &&
    hasAction(request, 'editSupplyOrderMessage');
  const canMark =
    !order.sentAt &&
    order.message !== undefined &&
    hasAction(request, 'markSupplyOrderSent');
  const send = useMutation({
    mutationFn: () =>
      write((version) =>
        fulfilmentApi.markSent(request.id, order.number, version),
      ),
    onSuccess: () => toast.success(copy.orderSent),
  });
  const edit = useMutation({
    mutationFn: (message: string) =>
      write((version) =>
        fulfilmentApi.editMessage(request.id, order.number, version, message),
      ),
    onSuccess: () => {
      setDraft(undefined);
      toast.success(copy.messageSaved);
    },
  });
  const busy = edit.isPending || send.isPending;
  return (
    <section className="grid min-w-0 gap-2 py-2 first:pt-0 last:pb-0">
      <header className="grid gap-1">
        <p className="text-small font-semibold">
          {copy.order(formatNumber(order.number))}
        </p>
        {order.sentAt && (
          <p className="text-small font-bold text-ppr-deep">
            {copy.sentAt}{' '}
            <time dateTime={order.sentAt}>{formatDateTime(order.sentAt)}</time>
          </p>
        )}
      </header>
      <ul className="divide-y divide-seam">
        {order.items.map((line) => {
          const item = request.items.find((item) => item.id === line.itemId);
          return (
            <li
              key={line.itemId}
              className="flex flex-wrap items-baseline justify-between gap-x-2 py-1 text-small"
            >
              <span className="wrap-anywhere">
                <bdi className="text-concrete">{formatNumber(line.lineNo)}</bdi>{' '}
                <bdi>{item?.snapshot.name}</bdi>
              </span>
              <bdi className="font-semibold">
                {formatNumber(line.quantity)} {item?.snapshot.unitName}
              </bdi>
              {item?.specs && (
                <bdi className="basis-full whitespace-pre-wrap wrap-anywhere text-concrete">
                  {item.specs}
                </bdi>
              )}
            </li>
          );
        })}
      </ul>
      {order.message !== undefined && (
        <Field
          label={buying.message}
          error={
            canEdit && !message.trim() ? buying.messageRequired : undefined
          }
        >
          {(props) => (
            <Textarea
              {...props}
              rows={4}
              maxLength={65536}
              readOnly={!canEdit}
              disabled={busy}
              value={canEdit ? message : order.message}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          )}
        </Field>
      )}
      <InlineError error={edit.error ?? send.error} />
      {canEdit && dirty && (
        <p className="text-small text-concrete">{copy.saveMessageFirst}</p>
      )}
      {(!canEdit || !dirty) && order.tooLong && (
        <p className="text-small text-concrete">{buying.longMessage}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {canEdit && dirty && (
          <Button
            loading={edit.isPending}
            disabled={!message.trim() || send.isPending}
            onClick={() => edit.mutate(message.trim())}
          >
            {ar.common.save}
          </Button>
        )}
        {(!canEdit || !dirty) && !order.tooLong && order.waUrl && (
          <a
            className={buttonClass('secondary')}
            href={order.waUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {buying.openWhatsApp}
          </a>
        )}
        {order.message !== undefined && (
          <Button
            variant="secondary"
            disabled={busy || !message.trim()}
            onClick={() =>
              void copyText(
                canEdit ? message.trim() : order.message!,
                buying.copiedMessage,
              )
            }
          >
            {buying.copyMessage}
          </Button>
        )}
        {canMark && (
          <Button
            loading={send.isPending}
            disabled={dirty || edit.isPending}
            onClick={() => send.mutate()}
          >
            {buying.markSent}
          </Button>
        )}
      </div>
    </section>
  );
}
