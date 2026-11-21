import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatRelative,
  formatTimelineTime,
} from '@purchasing-plus/shared';
import { describeEvent, type EventType } from '@purchasing-plus/shared/events';
import {
  ar,
  requestUi,
  timelineUi as copy,
} from '@purchasing-plus/shared/i18n/ar';
import {
  isFinal,
  statusMap,
  urgencies,
} from '@purchasing-plus/shared/lifecycle';
import { Check, ChevronDown, Clock, History } from 'lucide-react';
import { useEffect, useState } from 'react';

import { InlineError } from '../../components/shared/record-feedback.js';
import { Button } from '../../components/ui/button.js';
import { StatusChip } from '../../components/ui/chip.js';
import { EmptyState, Skeleton } from '../../components/ui/states.js';
import type { RequestEvent } from '../../lib/api/requests.js';

type Group = {
  stage: RequestEvent['stageAfter'];
  events: RequestEvent[];
  start: number;
  end: number;
};
type Filter = keyof typeof copy.filters;
const categories: Record<Exclude<Filter, 'all'>, readonly EventType[]> = {
  status: [
    'CREATED',
    'SUBMITTED',
    'RESUBMITTED',
    'URGENCY_CHANGED',
    'MANAGER_APPROVED',
    'MANAGER_REJECTED',
    'RETURNED_FOR_EDIT',
    'PAUSED',
    'RESUMED',
    'PURCHASING_RETURNED',
    'PRICING_SUBMITTED',
    'PRICING_APPROVED',
    'PRICING_REJECTED',
    'CANCELLED',
    'COMPLETED',
    'REJECTED_AUTO',
  ],
  edits: [
    'EDITED',
    'URGENCY_CHANGED',
    'DELIVERY_FEE_CHANGED',
    'ADDED_TO_CATALOG',
    'COPIED_TO',
    'COPIED_FROM',
  ],
  purchasing: [
    'BATCH_CREATED',
    'ITEM_UNAVAILABLE',
    'ITEM_AVAILABLE_AGAIN',
    'PRICING_SUBMITTED',
    'DELIVERY_FEE_CHANGED',
    'PRICING_APPROVED',
    'PRICING_REJECTED',
    'SUPPLY_ORDER_SENT_MARKED',
    'ITEM_STILL_COMING',
    'ITEM_REPRICED',
    'PURCHASING_RETURNED',
  ],
  receipt: [
    'RECEIPT_RECORDED',
    'ITEM_STILL_COMING',
    'ITEM_RESOLVED_EXTERNALLY',
  ],
};
const strongAttribution: readonly EventType[] = [
  'MANAGER_APPROVED',
  'MANAGER_REJECTED',
  'PRICING_APPROVED',
  'PRICING_REJECTED',
  'ITEM_RESOLVED_EXTERNALLY',
];

export function timelineGroups(events: RequestEvent[]) {
  const groups: Group[] = [];
  for (const event of events) {
    const time = Date.parse(event.at);
    const group = groups.at(-1);
    if (group?.stage === event.stageAfter) {
      group.events.push(event);
      group.end = time;
    } else {
      groups.push({
        stage: event.stageAfter,
        events: [event],
        start: time,
        end: time,
      });
    }
  }
  return groups;
}

const weekHours = 7 * 24;
export function timelineGap(elapsed: number) {
  const hours = Math.max(1, elapsed / 3_600_000);
  return Math.min(64, 8 + (56 * Math.log(hours)) / Math.log(weekHours));
}

function diffValue(value: unknown) {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return value || copy.missingValue;
  if (
    value &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
    return value.name;
  return copy.missingValue;
}

function fieldValue(field: string, value: unknown) {
  const urgency = field === 'urgency' && urgencies.find((key) => key === value);
  if (urgency) return statusMap[urgency].label;
  if (field === 'quantity' && typeof value === 'string')
    return formatNumber(value);
  return diffValue(value);
}

function DiffPair({
  label,
  before,
  after,
}: {
  label: string;
  before: string;
  after: string;
}) {
  return (
    <div className="grid gap-1 border-s-2 border-seam ps-3">
      <dt className="text-micro text-concrete">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-small">
        <del className="whitespace-pre-wrap wrap-anywhere text-concrete">
          <span className="sr-only">{copy.previous} </span>
          <bdi>{before}</bdi>
        </del>
        <ins className="rounded-control bg-ppr-wash px-2 whitespace-pre-wrap wrap-anywhere text-ppr-deep no-underline">
          <span className="sr-only">{copy.current} </span>
          <bdi>{after}</bdi>
        </ins>
      </dd>
    </div>
  );
}

function EventDiff({ event }: { event: RequestEvent }) {
  if (event.type === 'DELIVERY_FEE_CHANGED') {
    const { before, after } = event.payload;
    if (before === undefined || after === undefined) return null;
    return (
      <dl>
        <DiffPair
          label={copy.fields.deliveryFee}
          before={before === null ? copy.missingValue : formatMoney(before)}
          after={after === null ? copy.missingValue : formatMoney(after)}
        />
      </dl>
    );
  }
  if (event.type !== 'EDITED') return null;
  const { fields = [], changed = [], added = [], removed = [] } = event.payload;
  return (
    <div className="grid gap-2">
      <dl className="grid gap-2">
        {fields.map(({ field, before, after }) => (
          <DiffPair
            key={field}
            label={copy.fields[field]}
            before={fieldValue(field, before)}
            after={fieldValue(field, after)}
          />
        ))}
        {changed.flatMap(({ lineNo, fields }) =>
          fields.map(({ field, before, after }) => (
            <DiffPair
              key={lineNo + '-' + field}
              label={
                copy.line(formatNumber(lineNo)) + ' / ' + copy.fields[field]
              }
              before={fieldValue(field, before)}
              after={fieldValue(field, after)}
            />
          )),
        )}
      </dl>
      {Boolean(added.length || removed.length) && (
        <ul className="grid gap-2 text-small">
          {added.map((line) => (
            <li
              key={'added-' + line.id}
              className="border-s-2 border-ppr ps-3 wrap-anywhere"
            >
              <strong className="block text-micro text-ppr-deep">
                {copy.added}
              </strong>
              <bdi>{line.snapshot.name}</bdi>{' '}
              <bdi>{formatNumber(line.quantity)}</bdi> {line.snapshot.unitName}
            </li>
          ))}
          {removed.map((line) => (
            <li
              key={'removed-' + line.id}
              className="border-s-2 border-danger-fg ps-3 wrap-anywhere"
            >
              <strong className="block text-micro text-danger-fg">
                {copy.removed}
              </strong>
              <del>
                <bdi>{line.snapshot.name}</bdi>{' '}
                <bdi>{formatNumber(line.quantity)}</bdi>{' '}
                {line.snapshot.unitName}
              </del>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BatchDetails({
  batch,
}: {
  batch: NonNullable<RequestEvent['batch']>;
}) {
  return (
    <details className="group rounded-control border border-seam bg-paper">
      <summary className="flex min-h-target cursor-pointer list-none items-center justify-between gap-2 rounded-control px-3 text-small font-semibold hover:bg-plaster [&::-webkit-details-marker]:hidden">
        {copy.batchDetails}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-3 border-t border-seam p-3 text-small">
        <ul className="grid gap-2">
          {batch.suppliers.map((supplier, index) => (
            <li key={index} className="grid gap-0.5 wrap-anywhere">
              <bdi className="font-semibold">{supplier.name}</bdi>
              {supplier.sentAt ? (
                <span className="flex items-start gap-1 text-micro text-ppr-deep">
                  <Check
                    size={14}
                    className="mt-0.5 shrink-0"
                    aria-label={copy.sent}
                  />
                  <time dateTime={supplier.sentAt}>
                    {formatTimelineTime(supplier.sentAt)}
                  </time>
                </span>
              ) : (
                <span className="text-micro text-concrete">{copy.unsent}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="border-t border-seam pt-2">
          <strong className="block">{copy.batchItems}</strong>
          <bdi>{batch.lineNos.map(formatNumber).join('، ')}</bdi>
        </p>
      </div>
    </details>
  );
}

function EventRow({
  event,
  highlight,
  now,
}: {
  event: RequestEvent;
  highlight: boolean;
  now: number;
}) {
  const name = event.actorName ?? copy.system;
  const initials = name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('');
  const attributed = strongAttribution.includes(event.type);
  return (
    <li
      id={'request-event-' + event.id}
      tabIndex={0}
      className={
        'grid min-w-0 scroll-mt-24 grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 rounded-control px-2 py-3 sm:px-3 ' +
        (highlight ? 'bg-ppr-wash' : '')
      }
    >
      <span
        aria-hidden="true"
        className={
          'relative z-10 grid size-9 place-items-center rounded-full border border-paper text-small font-bold ' +
          (attributed
            ? 'bg-ppr-wash text-ppr-deep'
            : 'bg-plaster text-neutral-fg')
        }
      >
        <bdi>{initials}</bdi>
      </span>
      <div className="grid min-w-0 gap-2">
        <div>
          <div
            className={
              'flex flex-wrap items-baseline gap-x-2 text-small wrap-anywhere ' +
              (attributed ? 'font-bold text-ink' : 'text-concrete')
            }
          >
            <bdi className={attributed ? '' : 'font-semibold text-ink'}>
              {name}
            </bdi>
            {event.actorRoleName && <bdi>{event.actorRoleName}</bdi>}
          </div>
          <p className="whitespace-pre-wrap wrap-anywhere">
            {describeEvent(
              { type: event.type, payload: event.payload },
              event.batch?.suppliers.length,
            )}
          </p>
        </div>
        <EventDiff event={event} />
        {event.batch && <BatchDetails batch={event.batch} />}
        <div className="text-micro text-concrete">
          <time className="block" dateTime={event.at}>
            {formatTimelineTime(event.at)}
          </time>
          <span className="block">{formatRelative(event.at, now)}</span>
        </div>
      </div>
    </li>
  );
}

export function Timeline({
  events,
  error,
  retry,
  highlight,
}: {
  events?: RequestEvent[];
  error: Error | null;
  retry: () => void;
  highlight?: number;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [clock, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const loaded = events !== undefined;
  useEffect(() => {
    if (highlight === undefined || !loaded) return;
    const row = document.getElementById('request-event-' + highlight);
    row?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    row?.focus({ preventScroll: true });
  }, [highlight, loaded]);

  const errorState = <InlineError error={error} retry={retry} />;
  if (!events)
    return error ? (
      errorState
    ) : (
      <div
        className="grid gap-3 rounded-panel border border-seam bg-paper p-4"
        role="status"
        aria-label={ar.common.loading}
      >
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-16 w-full" key={row} />
        ))}
      </div>
    );
  if (!events.length)
    return (
      <>
        {errorState}
        <EmptyState title={requestUi.noEvents} icon={<History size={24} />} />
      </>
    );

  const now = Math.max(clock, Date.parse(events.at(-1)!.at));
  const groups = timelineGroups(events)
    .map((group, index, all) => {
      const next = all[index + 1];
      const ongoing = !next && !isFinal(group.stage);
      const duration =
        (next?.start ?? (ongoing ? now : group.end)) - group.start;
      return {
        ...group,
        ongoing,
        duration,
        events: group.events.filter(
          (event) =>
            event.type !== 'BATCH_SENT_MARKED' &&
            (filter === 'all' || categories[filter].includes(event.type)),
        ),
      };
    })
    .filter((group) => group.events.length);

  return (
    <div className="mx-auto grid max-w-3xl gap-3">
      {errorState}
      <div
        role="group"
        aria-label={copy.filterLabel}
        className="flex flex-wrap gap-1.5"
      >
        {(Object.keys(copy.filters) as Filter[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className="min-h-target rounded-full border border-seam bg-paper px-3 text-small font-semibold text-concrete hover:border-concrete aria-pressed:border-ppr aria-pressed:bg-ppr-wash aria-pressed:text-ppr-deep"
          >
            {copy.filters[id]}
          </button>
        ))}
      </div>
      {groups.length ? (
        <ol>
          {groups.map((group, index) => {
            const previous = groups[index - 1];
            const elapsed = previous ? group.start - previous.end : 0;
            return (
              <li key={group.events[0]!.id}>
                {previous && (
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-2 ps-3 text-micro text-concrete">
                    <span
                      aria-hidden="true"
                      className="h-full justify-self-center border-s border-dashed border-concrete/50"
                    />
                    <span
                      className="flex min-h-6 items-center gap-1"
                      style={{ minBlockSize: 24 + timelineGap(elapsed) }}
                    >
                      <Clock size={13} aria-hidden="true" />
                      {formatDuration(elapsed)}
                    </span>
                  </div>
                )}
                <section
                  aria-labelledby={'timeline-stage-' + group.events[0]!.id}
                  className="rounded-panel border border-seam bg-paper"
                >
                  <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-t-panel border-b border-seam bg-neutral-bg px-3 py-3 sm:px-4">
                    <div className="grid gap-1">
                      <h3 id={'timeline-stage-' + group.events[0]!.id}>
                        <StatusChip status={group.stage} />
                      </h3>
                      {!isFinal(group.stage) && (
                        <p className="text-small text-concrete">
                          {copy.heldBy(copy.holders[group.stage])}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-1 text-micro text-neutral-fg">
                      <Clock size={14} aria-hidden="true" />
                      {(group.ongoing ? copy.ongoing : copy.took)(
                        formatDuration(group.duration),
                      )}
                    </span>
                  </header>
                  <ol className="relative grid p-1.5 before:absolute before:inset-bs-6 before:inset-be-6 before:start-8 before:border-s before:border-seam sm:before:start-9">
                    {group.events.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        highlight={highlight === event.id}
                        now={now}
                      />
                    ))}
                  </ol>
                </section>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState
          title={copy.noMatches}
          action={
            <Button variant="secondary" onClick={() => setFilter('all')}>
              {copy.filters.all}
            </Button>
          }
        />
      )}
    </div>
  );
}
