import { formatMoney, formatNumber } from '@purchasing-plus/shared';
import {
  fulfilmentUi as copy,
  purchasingUi as buying,
} from '@purchasing-plus/shared/i18n/ar';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
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
          className="group/round"
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
          <summary className="flex min-h-target cursor-pointer items-center gap-2 rounded-control py-2 font-semibold transition-colors hover:bg-plaster">
            <ChevronDown
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className="shrink-0 text-concrete transition-transform group-open/round:rotate-180"
            />
            {copy.round(formatNumber(round.number))}
            <span className="text-small font-normal text-concrete">
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
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-small">
                    <span className="flex items-baseline gap-2">
                      <span className="text-concrete">{copy.lineTotal}</span>
                      <bdi className="numeric font-bold">
                        {formatMoney(line.lineTotal)}
                      </bdi>
                    </span>
                    {line.unitPrice !== undefined && (
                      <bdi className="numeric text-concrete">
                        {buying.unitPrice(formatMoney(line.unitPrice))}
                      </bdi>
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
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 font-bold">
                <dt>{buying.roundTotal}</dt>
                <dd className="numeric text-subtitle">
                  <bdi>{formatMoney(data.roundTotal)}</bdi>
                </dd>
              </div>
              {/* The fee is shown beside the total, never added to it. */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-small text-concrete">
                <dt>
                  {buying.deliveryFee} · {buying.separateFee}
                </dt>
                <dd className="numeric font-semibold text-ink">
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
