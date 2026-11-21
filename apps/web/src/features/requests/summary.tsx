import {
  formatRelative,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@purchasing-plus/shared';
import { ar, requestUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  isAging,
  statusMap,
  type DisplayedStage,
  type ItemState,
} from '@purchasing-plus/shared/lifecycle';
import { Check, X } from 'lucide-react';

import { Chip, StatusChip } from '../../components/ui/chip.js';
import { EmptyState } from '../../components/ui/states.js';
import type { RequestDto, RequestEvent } from '../../lib/api/requests.js';

const stages = [
  'DRAFT',
  'AWAITING_MANAGER',
  'AT_PURCHASING',
  'AWAITING_APPROVAL',
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
  const step =
    anchor === 'RETURNED'
      ? 'AWAITING_MANAGER'
      : anchor === 'PAUSED'
        ? 'AT_PURCHASING'
        : anchor;
  const index = stages.findIndex((id) => id === step);
  const marker = stage === 'RETURNED' || stage === 'PAUSED';
  return (
    <section
      aria-label={copy.rail}
      className="relative grid gap-2 rounded-panel border border-seam bg-paper p-3 sm:p-4"
    >
      <ol className="grid grid-cols-7 gap-1.5 sm:gap-2">
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
const openStates: ItemState[] = [
  'OPEN',
  'UNAVAILABLE',
  'AWAITING_APPROVAL',
  'AWAITING_RECEIPT',
  'REMAINING',
];
export function RequestFacts({
  request,
  agingDays,
  showTime = false,
}: {
  request: RequestDto;
  agingDays?: number;
  showTime?: boolean;
}) {
  const open = openStates.filter((state) => request.stateCounts[state] > 0);
  const aging =
    agingDays !== undefined &&
    isAging(request.stageStartedAt, new Date(), agingDays);
  return (
    <div className="grid min-w-0 gap-2">
      <p className="wrap-anywhere text-small text-concrete">
        <bdi>{request.site.name}</bdi> · <bdi>{request.category.name}</bdi> ·{' '}
        <bdi>{request.creator.name}</bdi>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip status={request.displayedStage} />
        <StatusChip status={request.urgency} />
        {request.isModified && <Chip>{copy.modified}</Chip>}
        {aging && <StatusChip status="OVERDUE" />}
        {open.length > 1 &&
          open.map((state) => (
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
    </header>
  );
}
export function ItemRows({
  request,
  convert,
}: {
  request: RequestDto;
  convert?: (id: number) => void;
}) {
  if (!request.items.length) return <EmptyState title={copy.emptyItems} />;
  return (
    <div className="grid gap-2">
      <ol className="divide-y divide-seam rounded-panel border border-seam bg-paper">
        {request.items.map((line) => (
          <li key={line.id} className="grid gap-2 p-3 sm:p-4">
            <div className="flex items-start gap-2">
              <span className="numeric grid size-7 shrink-0 place-items-center rounded-control bg-plaster text-small text-concrete">
                {formatNumber(line.lineNo)}
              </span>
              <div className="min-w-0 grow">
                <h3 className="wrap-anywhere text-subtitle">
                  <bdi>{line.snapshot.name}</bdi>
                </h3>
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
              {line.lineTotal && (
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
            </div>
          </li>
        ))}
      </ol>
      {request.deliveryFee && (
        <p className="rounded-control border border-seam bg-paper p-3 text-small">
          {copy.deliveryFee} <bdi>{formatMoney(request.deliveryFee)}</bdi>
        </p>
      )}
    </div>
  );
}

export function Timeline({
  events,
  highlight,
}: {
  events: RequestEvent[];
  highlight?: number;
}) {
  if (!events.length) return <EmptyState title={copy.noEvents} />;
  return (
    <ol className="divide-y divide-seam rounded-panel border border-seam bg-paper">
      {events.map((event) => (
        <li
          id={'request-event-' + event.id}
          key={event.id}
          tabIndex={event.id === highlight ? 0 : undefined}
          className={`scroll-mt-24 px-4 py-3 ${event.id === highlight ? 'bg-ppr-wash' : ''}`}
        >
          <p className="wrap-anywhere font-semibold">
            {ar.lifecycle.events[event.type]}
          </p>
          <p className="wrap-anywhere text-small text-concrete">
            {event.actorName && (
              <>
                <bdi>{event.actorName}</bdi> ·{' '}
              </>
            )}
            <bdi>{formatDateTime(event.at)}</bdi>
          </p>
          {'reason' in event.payload && (
            <p className="wrap-anywhere text-small">{event.payload.reason}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
