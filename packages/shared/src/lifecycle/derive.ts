import { cairoDay } from '../formatters.js';
import type { PermissionKey } from '../permissions/registry.js';

import {
  holds,
  inSite,
  isFinal,
  itemStates,
  urgencies,
  type DisplayedStage,
  type ItemState,
  type RequestState,
  type Viewer,
} from './model.js';

export function stateCounts(state: RequestState): Record<ItemState, number> {
  const counts = Object.fromEntries(itemStates.map((s) => [s, 0])) as Record<
    ItemState,
    number
  >;
  for (const item of state.items) counts[item.state]++;
  return counts;
}
export function deriveStage(state: RequestState): DisplayedStage {
  if (state.status !== 'FULFILMENT') return state.status;
  const counts = stateCounts(state);
  if (counts.AWAITING_APPROVAL) return 'AWAITING_APPROVAL';
  if (counts.AWAITING_RECEIPT) return 'AWAITING_RECEIPT';
  if (counts.REMAINING || counts.UNAVAILABLE) return 'REMAINING';
  return 'AT_PURCHASING'; // An unsubmitted pricing draft can be the only open work.
}
type StageEvent = { at: string; stageAfter: DisplayedStage };
// Input is in append order, including events written at the same instant.
export function stageStartedAt(events: readonly StageEvent[]): string | null {
  const last = events.at(-1);
  if (!last || isFinal(last.stageAfter)) return null;
  let start = events.length - 1;
  while (start > 0 && events[start - 1]!.stageAfter === last.stageAfter)
    start--;
  return events[start]!.at;
}
export function isAging(start: string | null, now: Date, agingDays: number) {
  return (
    start !== null && cairoDay(now) - cairoDay(new Date(start)) > agingDays
  );
}
export function compareQueue(
  a: { urgency: RequestState['urgency']; stageStartedAt: string },
  b: typeof a,
) {
  return (
    urgencies.indexOf(b.urgency) - urgencies.indexOf(a.urgency) ||
    Date.parse(a.stageStartedAt) - Date.parse(b.stageStartedAt)
  );
}

export const queueNames = [
  'drafts',
  'manager',
  'purchasing',
  'pricingApproval',
  'receipt',
  'paused',
] as const;
export type Queue = (typeof queueNames)[number];
export type PurchasingQueueRule = {
  status: 'AT_PURCHASING' | 'FULFILMENT';
  anyOf: readonly PermissionKey[];
  items?: readonly ItemState[];
  unsentOrder?: true;
};
export const purchasingQueueRules: readonly PurchasingQueueRule[] = [
  {
    status: 'AT_PURCHASING',
    anyOf: [
      'purchasing.price',
      'purchasing.sendRfq',
      'purchasing.returnForEdit',
    ],
  },
  {
    status: 'FULFILMENT',
    items: ['UNAVAILABLE', 'OPEN'],
    anyOf: ['purchasing.price'],
  },
  {
    status: 'FULFILMENT',
    items: ['REMAINING'],
    anyOf: ['purchasing.handleRemaining'],
  },
  {
    status: 'FULFILMENT',
    unsentOrder: true,
    anyOf: ['purchasing.sendSupplyOrder'],
  },
];
export function inQueue(
  queue: Queue,
  state: RequestState,
  viewer: Viewer,
): boolean {
  if (state.deleted || isFinal(state.status) || !inSite(viewer, state.siteId))
    return false;
  const has = (stateName: ItemState) =>
    state.items.some((i) => i.state === stateName);
  switch (queue) {
    case 'drafts':
      return (
        (state.status === 'DRAFT' || state.status === 'RETURNED') &&
        state.createdById === viewer.userId &&
        holds(viewer, 'requests.create')
      );
    case 'manager':
      return (
        state.status === 'AWAITING_MANAGER' && holds(viewer, 'requests.approve')
      );
    case 'paused':
      return (
        state.status === 'PAUSED' && holds(viewer, 'requests.editWhilePaused')
      );
    case 'pricingApproval':
      return (
        state.status === 'FULFILMENT' &&
        has('AWAITING_APPROVAL') &&
        holds(viewer, 'pricing.approve')
      );
    case 'receipt':
      return (
        state.status === 'FULFILMENT' &&
        has('AWAITING_RECEIPT') &&
        holds(viewer, 'receipt.record')
      );
    case 'purchasing':
      return purchasingQueueRules.some(
        (rule) =>
          rule.status === state.status &&
          rule.anyOf.some((key) => holds(viewer, key)) &&
          (!rule.items || rule.items.some(has)) &&
          (!rule.unsentOrder ||
            state.supplyOrders.some((order) => !order.sent)),
      );
  }
}
