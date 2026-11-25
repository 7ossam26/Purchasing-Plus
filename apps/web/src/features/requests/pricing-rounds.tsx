import { formatMoney, formatNumber } from '@purchasing-plus/shared';
import {
  fulfilmentUi as copy,
  purchasingUi as buying,
} from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useCanOnSite } from '../../app/session.js';
import { LoadRecord } from '../../components/shared/record-feedback.js';
import {
  fulfilmentApi,
  roundKey,
  type RoundSummary,
} from '../../lib/api/fulfilment.js';
import type { RequestDto } from '../../lib/api/requests.js';

import { PurchaseLineTitle } from './purchasing-pricing.js';

// Read-only pricing history for price viewers. Submitted pricing goes straight to the site for
// receipt, so there is nothing to approve here; earlier approval decisions stay visible as history.
export function PricingRounds({ request }: { request: RequestDto }) {
  const rounds = [...(request.rounds ?? [])].reverse();
  const [expanded, setExpanded] = useState<number>();
  if (!rounds.length) return null;
  return (
    <section className="grid min-w-0 gap-1 rounded-panel border border-seam bg-paper p-3">
      <h2 className="text-subtitle">{copy.rounds}</h2>
      {rounds.map((round) => (
        <details
          key={round.number}
          open={expanded === round.number}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setExpanded((current) =>
              open
                ? round.number
                : current === round.number
                  ? undefined
                  : current,
            );
          }}
        >
          <summary className="min-h-target cursor-pointer py-2 font-semibold">
            {copy.round(formatNumber(round.number))}
            <span className="ms-2 text-small font-normal text-concrete">
              {copy.roundStatus[round.status]}
            </span>
          </summary>
          {expanded === round.number && (
            <RoundDetails request={request} round={round} />
          )}
        </details>
      ))}
    </section>
  );
}

function RoundDetails({
  request,
  round,
}: {
  request: RequestDto;
  round: RoundSummary;
}) {
  const canViewPrices = useCanOnSite('requests.viewPrices', request.siteId);
  const query = useQuery({
    queryKey: [...roundKey(request.id), round.number, request.version],
    queryFn: ({ signal }) =>
      fulfilmentApi.round(request.id, round.number, signal),
  });
  return (
    <LoadRecord query={query}>
      {(data) => (
        <>
          <ul className="divide-y divide-seam">
            {data.items.map((line) => (
              <li key={line.itemId} className="grid gap-1 py-2">
                <PurchaseLineTitle line={line} />
                {line.supplier && (
                  <bdi className="text-small text-concrete">
                    {line.supplier.name}
                  </bdi>
                )}
                {canViewPrices && line.lineTotal !== undefined && (
                  <p className="text-small">
                    {copy.lineTotal}{' '}
                    <bdi className="font-bold">
                      {formatMoney(line.lineTotal)}
                    </bdi>
                    {line.unitPrice !== undefined && (
                      <>
                        {' '}
                        ·{' '}
                        <bdi>
                          {buying.unitPrice(formatMoney(line.unitPrice))}
                        </bdi>
                      </>
                    )}
                  </p>
                )}
                {canViewPrices && line.lastPrice && (
                  <p className="flex flex-wrap items-baseline gap-x-2 text-small text-concrete">
                    <span>
                      {copy.lastPrice}{' '}
                      <bdi>{formatMoney(line.lastPrice.unitPrice)}</bdi>
                    </span>
                    {line.priceChange?.percent != null && (
                      <PriceDifference
                        {...line.priceChange}
                        percent={line.priceChange.percent}
                      />
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {canViewPrices && data.roundTotal !== undefined && (
            <dl className="grid gap-1 border-t border-seam pt-2">
              <div className="flex flex-wrap justify-between gap-x-2 font-bold">
                <dt>{buying.roundTotal}</dt>
                <dd>
                  <bdi>{formatMoney(data.roundTotal)}</bdi>
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2 text-small">
                <dt>
                  {buying.deliveryFee} · {buying.separateFee}
                </dt>
                <dd>
                  <bdi>{formatMoney(data.deliveryFee ?? '0.00')}</bdi>
                </dd>
              </div>
            </dl>
          )}
        </>
      )}
    </LoadRecord>
  );
}

function PriceDifference({
  amount,
  percent,
}: {
  amount: string;
  percent: string;
}) {
  const lower = amount.startsWith('-');
  const equal = amount === '0.00';
  return (
    <bdi
      dir="ltr"
      className={
        equal ? 'text-concrete' : lower ? 'text-ppr-deep' : 'text-danger-fg'
      }
    >
      {equal ? '' : lower ? '▼ ' : '▲ '}
      {formatNumber(percent.replace(/^-/, ''))}%
    </bdi>
  );
}
