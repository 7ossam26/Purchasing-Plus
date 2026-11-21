import { formatMoney, formatNumber } from '@purchasing-plus/shared';
import {
  fulfilmentUi as copy,
  purchasingUi as buying,
} from '@purchasing-plus/shared/i18n/ar';
import { rejectingRoundEndsRequest } from '@purchasing-plus/shared/lifecycle';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { useCanOnSite } from '../../app/session.js';
import { ActionBar } from '../../components/shared/action-bar.js';
import { LoadRecord } from '../../components/shared/record-feedback.js';
import { useConfirm, usePrompt } from '../../components/ui/dialogs.js';
import { toast } from '../../components/ui/toast.js';
import {
  fulfilmentApi,
  roundKey,
  type RoundSummary,
} from '../../lib/api/fulfilment.js';
import type { RequestDto } from '../../lib/api/requests.js';

import { PurchaseLineTitle } from './purchasing-pricing.js';
import type { PurchaseWrite } from './purchasing-writes.js';
import { hasAction } from './workspace.js';

export function PricingApproval({
  request,
  write,
}: {
  request: RequestDto;
  write: PurchaseWrite;
}) {
  const rounds = request.rounds ?? [];
  const pending = rounds.filter((round) => round.status === 'PENDING');
  const earlier = rounds
    .filter((round) => round.status !== 'PENDING')
    .reverse();
  const [expanded, setExpanded] = useState<number>();
  const canApprove = hasAction(request, 'approvePricing');
  const canReject = hasAction(request, 'rejectPricing');
  const confirm = useConfirm();
  const prompt = usePrompt();
  const decision = useMutation({
    mutationFn: ({ round, reason }: { round: number; reason?: string }) =>
      write((version) =>
        fulfilmentApi.decide(request.id, round, version, reason),
      ),
    onSuccess: (_saved, { reason }) =>
      toast.success(reason === undefined ? copy.approved : copy.rejected),
  });
  async function decide(round: number, approve: boolean) {
    if (approve) {
      if (
        await confirm({
          title: copy.approveQuestion,
          description: copy.approveConsequence,
          confirmLabel: copy.approve,
        })
      )
        decision.mutate({ round });
      return;
    }
    const endsRequest = rejectingRoundEndsRequest(round, rounds);
    const reason = await prompt({
      title: copy.reject,
      description: endsRequest
        ? copy.rejectFinalConsequence
        : copy.rejectConsequence,
      confirmLabel: endsRequest ? copy.rejectFinal : copy.rejectRound,
      mode: 'reason',
      tone: 'danger',
    });
    if (reason !== null) decision.mutate({ round, reason });
  }
  return (
    <>
      {pending.map((round) => (
        <section
          key={round.number}
          className="grid min-w-0 gap-3 rounded-panel border border-seam bg-paper p-3 sm:p-4"
        >
          <h2 className="text-section">
            {copy.round(formatNumber(round.number))}
          </h2>
          <RoundDetails request={request} round={round}>
            <ActionBar
              primary={
                canApprove
                  ? {
                      id: 'approvePricing',
                      label: copy.approve,
                      loading: decision.isPending,
                      onClick: () => void decide(round.number, true),
                    }
                  : undefined
              }
              secondary={
                canReject
                  ? [
                      {
                        id: 'rejectPricing',
                        label: copy.reject,
                        variant: 'danger-outline',
                        loading: decision.isPending,
                        onClick: () => void decide(round.number, false),
                      },
                    ]
                  : []
              }
            />
          </RoundDetails>
        </section>
      ))}
      {earlier.length > 0 && (
        <section className="grid min-w-0 gap-1 rounded-panel border border-seam bg-paper p-3">
          <h2 className="text-subtitle">{copy.previousRounds}</h2>
          {earlier.map((round) => (
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
              </summary>
              {expanded === round.number && (
                <RoundDetails request={request} round={round} />
              )}
            </details>
          ))}
        </section>
      )}
    </>
  );
}

function RoundDetails({
  request,
  round,
  children,
}: {
  request: RequestDto;
  round: RoundSummary;
  children?: ReactNode;
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
          {data.status === 'PENDING' && children}
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
