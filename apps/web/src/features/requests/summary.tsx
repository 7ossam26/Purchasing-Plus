import {
  formatRelative,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@purchasing-plus/shared';
import {
  fulfilmentUi as fulfilment,
  requestUi as copy,
} from '@purchasing-plus/shared/i18n/ar';
import {
  isAging,
  itemStates,
  statusMap,
  type DisplayedStage,
} from '@purchasing-plus/shared/lifecycle';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { useCanOnSite } from '../../app/session.js';
import { Button } from '../../components/ui/button.js';
import { Chip, StatusChip } from '../../components/ui/chip.js';
import { EmptyState } from '../../components/ui/states.js';
import type { ActorSnapshot } from '../../lib/api/fulfilment.js';
import type {
  RequestDto,
  RequestSummary,
  RequestLine,
} from '../../lib/api/requests.js';

// Six steps: submitted pricing goes straight from purchasing to receipt.
const stages = [
  'DRAFT',
  'AWAITING_MANAGER',
  'AT_PURCHASING',
  'AWAITING_RECEIPT',
  'REMAINING',
  'COMPLETED',
] as const;
export function StageRail({
  stage,
  at,
  terminalFrom,
  onJump,
}: {
  stage: DisplayedStage;
  at: string | null;
  terminalFrom?: DisplayedStage;
  onJump?: () => void;
}) {
  const terminal = stage === 'REJECTED' || stage === 'CANCELLED';
  const anchor = terminal ? (terminalFrom ?? 'AWAITING_MANAGER') : stage;
  // A request rejected at the former pricing approval ended at the purchasing step.
  const step =
    anchor === 'RETURNED'
      ? 'AWAITING_MANAGER'
      : anchor === 'PAUSED' || anchor === 'AWAITING_APPROVAL'
        ? 'AT_PURCHASING'
        : anchor;
  const index = stages.findIndex((id) => id === step);
  const marker = stage === 'RETURNED' || stage === 'PAUSED';
  return (
    <section
      aria-label={copy.rail}
      className="relative grid gap-2 rounded-panel border border-seam bg-paper p-3 sm:p-4"
    >
      <ol className="grid grid-cols-6 gap-1.5 sm:gap-2">
        {stages.map((id, position) => {
          if (terminal && position > index) return null;
          const current = position === index;
          const complete = position < index;
          return (
            <li
              key={id}
              aria-current={current ? 'step' : undefined}
              data-state={
                current ? 'current' : complete ? 'completed' : 'future'
              }
              aria-label={
                statusMap[id].label +
                ' · ' +
                (current
                  ? copy.current
                  : complete
                    ? copy.complete
                    : copy.future)
              }
              className="relative grid min-w-0 content-start gap-1 text-center"
            >
              <span
                className={`grid h-3 place-items-center rounded-sm border sm:h-5 ${current ? (terminal ? 'border-danger-fg bg-danger-bg text-danger-fg' : 'border-ink bg-ink text-paper') : complete ? 'border-ppr bg-ppr text-paper' : 'border-seam bg-paper'}`}
              >
                {complete && (
                  <Check
                    className="hidden sm:block"
                    size={12}
                    aria-hidden="true"
                  />
                )}
                {current && terminal && <X size={12} aria-hidden="true" />}
              </span>
              {current && marker && (
                <span
                  aria-hidden="true"
                  className="absolute inset-bs-2 start-1/2 size-2 rotate-45 border-b border-e border-distinct-fg bg-distinct-bg sm:inset-bs-4"
                />
              )}
              <span className="hidden text-micro leading-tight text-concrete sm:block">
                {statusMap[id].label}
              </span>
            </li>
          );
        })}
      </ol>
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          className="flex min-h-target flex-wrap items-center gap-x-2 rounded-control text-start after:absolute after:inset-0 after:rounded-panel hover:bg-plaster"
        >
          <RailCaption stage={stage} at={at} />
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <RailCaption stage={stage} at={at} />
        </div>
      )}
    </section>
  );
}
function RailCaption({
  stage,
  at,
}: {
  stage: DisplayedStage;
  at: string | null;
}) {
  return (
    <>
      <StatusChip status={stage} />
      {at && (
        <span className="text-micro text-concrete">{formatRelative(at)}</span>
      )}
    </>
  );
}
export function RequestFacts({
  request,
  agingDays,
  showTime = false,
  showCounts = false,
}: {
  request: RequestSummary;
  agingDays?: number;
  showTime?: boolean;
  showCounts?: boolean;
}) {
  const present = itemStates.filter(
    (state) => state !== 'REMOVED' && request.stateCounts[state] > 0,
  );
  const aging =
    agingDays !== undefined &&
    isAging(request.stageStartedAt, new Date(), agingDays);
  return (
    <div className="grid min-w-0 gap-2">
      <ul className="flex flex-wrap gap-x-2 gap-y-1 text-small text-concrete">
        {[request.site.name, request.category.name, request.creator.name].map(
          (name, index) => (
            <li key={index} className="min-w-0 wrap-anywhere">
              <bdi>{name}</bdi>
            </li>
          ),
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={request.displayedStage} />
        <StatusChip status={request.urgency} />
        {request.isModified && <Chip>{copy.modified}</Chip>}
        {aging && <StatusChip status="OVERDUE" />}
        {(showCounts || present.length > 1) &&
          present.map((state) => (
            <StatusChip
              key={state}
              status={state}
              count={request.stateCounts[state]}
            />
          ))}
        {showTime && request.stageStartedAt && (
          <span className="text-micro text-concrete">
            {formatRelative(request.stageStartedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
export function RequestHeader({
  request,
  agingDays,
}: {
  request: RequestDto;
  agingDays?: number;
}) {
  const decision = request.rounds
    ?.filter((round) => round.decidedBy && round.decidedAt)
    .sort((a, b) => (a.decidedAt ?? '').localeCompare(b.decidedAt ?? ''))
    .at(-1);
  return (
    <header className="grid gap-2">
      <h1 className="numeric wrap-anywhere text-title sm:text-title-wide">
        {request.number ? (
          <bdi dir="ltr">{request.number}</bdi>
        ) : (
          statusMap.DRAFT.label
        )}
      </h1>
      <RequestFacts request={request} agingDays={agingDays} />
      {decision?.decidedBy && (
        <p
          className={`flex flex-wrap gap-x-2 rounded-panel border p-3 text-small font-bold ${decision.status === 'APPROVED' ? 'border-ppr bg-ppr-wash text-ppr-deep' : 'border-danger-fg bg-danger-bg text-danger-fg'}`}
        >
          <span>
            {decision.status === 'APPROVED'
              ? fulfilment.approvedBy
              : fulfilment.rejectedBy}{' '}
            <Actor attribution={decision.decidedBy} />
          </span>
          {decision.decidedAt && (
            <time dateTime={decision.decidedAt}>
              {formatDateTime(decision.decidedAt)}
            </time>
          )}
        </p>
      )}
    </header>
  );
}
function Actor({ attribution }: { attribution: ActorSnapshot }) {
  return (
    <>
      <bdi className="wrap-anywhere">{attribution.name}</bdi>
      {attribution.roleName && (
        <>
          {' '}
          (<bdi className="wrap-anywhere">{attribution.roleName}</bdi>)
        </>
      )}
    </>
  );
}
export function ItemRows({
  request,
  convert,
  renderActions,
  copyRejected,
  copyBusy,
}: {
  request: RequestDto;
  convert?: (id: number) => void;
  renderActions?: (line: RequestLine) => ReactNode;
  copyRejected?: (ids: number[]) => void;
  copyBusy?: boolean;
}) {
  const canViewPrices = useCanOnSite('requests.viewPrices', request.siteId);
  const rejected = request.items.filter((line) => line.state === 'REJECTED');
  const reasons = new Map(
    request.rounds?.flatMap((round) =>
      round.status === 'REJECTED'
        ? round.itemIds.map((id) => [id, round.reason] as const)
        : [],
    ) ?? [],
  );
  if (!request.items.length) return <EmptyState title={copy.emptyItems} />;
  return (
    <div className="grid gap-2">
      <ol className="divide-y divide-seam rounded-panel border border-seam bg-paper">
        {request.items.map((line) => (
          <li key={line.id} className="grid gap-2 p-3 sm:p-4">
            <div
              className={`flex items-start gap-2 ${line.state === 'REJECTED' ? 'text-concrete line-through' : ''}`}
            >
              <span className="numeric grid size-7 shrink-0 place-items-center rounded-control bg-plaster text-small text-concrete">
                {formatNumber(line.lineNo)}
              </span>
              <div className="min-w-0 grow">
                <h2 className="wrap-anywhere text-subtitle">
                  <bdi>{line.snapshot.name}</bdi>
                </h2>
                {line.specs && (
                  <p className="wrap-anywhere text-small text-concrete">
                    <bdi>{line.specs}</bdi>
                  </p>
                )}
              </div>
              <span className="shrink-0 text-small font-bold">
                <bdi className="numeric">{formatNumber(line.quantity)}</bdi>{' '}
                <bdi>{line.snapshot.unitName}</bdi>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={line.state} />
              {line.supplierName && (
                <bdi className="text-small text-concrete">
                  {line.supplierName}
                </bdi>
              )}
              {canViewPrices && line.lineTotal && (
                <span className="text-small">
                  {copy.price} <bdi>{formatMoney(line.lineTotal)}</bdi>
                </span>
              )}
              {line.isOther && convert && (
                <button
                  type="button"
                  onClick={() => convert(line.id)}
                  className="min-h-target rounded-control px-2 text-small font-bold text-ppr-deep underline hover:bg-ppr-wash"
                >
                  {copy.addToCatalog}
                </button>
              )}
              {renderActions?.(line)}
            </div>
            {line.state === 'REJECTED' && reasons.get(line.id) && (
              <p className="whitespace-pre-wrap wrap-anywhere text-small text-danger-fg">
                <strong>{fulfilment.rejectionReason}</strong> ·{' '}
                {reasons.get(line.id)}
              </p>
            )}
            {line.resolvedBy && (
              <p className="text-small text-ppr-deep">
                {fulfilment.resolvedBy} <Actor attribution={line.resolvedBy} />
              </p>
            )}
          </li>
        ))}
      </ol>
      {copyRejected && rejected.length > 0 && (
        <Button
          variant="secondary"
          className="justify-self-start"
          loading={copyBusy}
          onClick={() => copyRejected(rejected.map((line) => line.id))}
        >
          {fulfilment.copyRejected}
        </Button>
      )}
      {canViewPrices && request.deliveryFee && (
        <p className="rounded-control border border-seam bg-paper p-3 text-small">
          {copy.deliveryFee} <bdi>{formatMoney(request.deliveryFee)}</bdi>
        </p>
      )}
    </div>
  );
}
