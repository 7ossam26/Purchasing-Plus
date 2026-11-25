import { z } from 'zod';

import { ar } from '../i18n/ar.js';
import type { PermissionKey } from '../permissions/registry.js';

import { deriveStage } from './derive.js';
import type { EventDraft, EventType, Payload } from './events.js';
import {
  holds,
  inSite,
  isClosed,
  type RequestState,
  type RequestStatus,
  type Viewer,
} from './model.js';

export type RefusalCode = keyof typeof ar.lifecycle.errors;
export type Verdict =
  { ok: true } | { ok: false; code: RefusalCode; message: string };
export class LifecycleError extends Error {
  constructor(readonly code: RefusalCode) {
    super(ar.lifecycle.errors[code]);
  }
}
export function refuse(code: RefusalCode): never {
  throw new LifecycleError(code);
}
export function unique<T>(values: T[]) {
  if (new Set(values).size !== values.length) refuse('DUPLICATE');
}

type Recipient = { holdersOf: PermissionKey } | { userId: number };
export type NotifyIntent = Recipient & {
  siteId: number;
  requestId: number;
  event: EventType;
  // Null for a system transition, which has no actor to leave out.
  excludeUserId: number | null;
  excludeSuperadmins: true;
};
export function matchesRecipient(intent: NotifyIntent, viewer: Viewer) {
  return (
    !viewer.isSuperadmin &&
    viewer.userId !== intent.excludeUserId &&
    inSite(viewer, intent.siteId) &&
    ('userId' in intent
      ? viewer.userId === intent.userId
      : holds(viewer, intent.holdersOf))
  );
}
export interface Transition {
  next: RequestState;
  events: EventDraft[];
  notify: NotifyIntent[];
  priceRecords: {
    requestItemId: number;
    // APPROVED records came from the former pricing approval and are never written now.
    source: 'SUBMITTED' | 'APPROVED' | 'REPRICED';
    catalogItemId: number;
    supplierId: number;
    quantity: string;
    lineTotal: string;
    unitPrice: string;
  }[];
  copiedDraft?: RequestState;
}
export interface Context {
  result: Transition;
  state: RequestState;
  actorId: number | null;
  now: string;
  emit<K extends EventType>(
    type: K,
    payload: Payload<K>,
    items?: number[],
    system?: boolean,
  ): void;
}
// Submitted pricing goes straight to the site: the engineer who asked for it, whoever records
// receipt there, and whoever sends the supply orders. There is no approval step to notify.
const pricingSentRecipients: (state: RequestState) => Recipient[] = (state) => [
  { userId: state.createdById },
  { holdersOf: 'receipt.record' },
  { holdersOf: 'purchasing.sendSupplyOrder' },
];
function notifications(
  state: RequestState,
  actor: number | null,
  type: EventType,
  partial: boolean,
): NotifyIntent[] {
  const holder = (holdersOf: PermissionKey) => ({ holdersOf });
  const creator = { userId: state.createdById };
  let recipients: Recipient[];
  switch (type) {
    case 'SUBMITTED':
    case 'RESUBMITTED':
      recipients = [holder('requests.approve')];
      break;
    case 'MANAGER_APPROVED':
    case 'RESUMED':
      recipients = [holder('purchasing.price')];
      break;
    case 'MANAGER_REJECTED':
    case 'RETURNED_FOR_EDIT':
    case 'PURCHASING_RETURNED':
      recipients = [creator];
      break;
    case 'PRICING_SENT_FOR_RECEIPT':
    case 'PRICING_RELEASED':
      recipients = pricingSentRecipients(state);
      break;
    case 'RECEIPT_RECORDED':
      recipients = partial ? [holder('purchasing.handleRemaining')] : [];
      break;
    default:
      return [];
  }
  return recipients
    .filter((r) => !('userId' in r) || r.userId !== actor)
    .map((r) => ({
      ...r,
      siteId: state.siteId,
      requestId: state.id,
      event: type,
      excludeUserId: actor,
      excludeSuperadmins: true,
    }));
}
export function autoOutcome(
  state: RequestState,
): 'COMPLETED' | 'REJECTED' | null {
  const live = state.items.filter((i) => i.state !== 'REMOVED');
  if (!live.length || !live.every(isClosed)) return null;
  if (live.every((i) => i.state === 'REJECTED')) return 'REJECTED';
  return live.some(
    (i) => i.state === 'RECEIVED' || i.state === 'RESOLVED_EXTERNALLY',
  )
    ? 'COMPLETED'
    : null;
}
export function finish(ctx: Context, outcome = autoOutcome(ctx.state)) {
  if (!outcome) return;
  ctx.state.status = outcome;
  ctx.emit(
    outcome === 'COMPLETED' ? 'COMPLETED' : 'REJECTED_AUTO',
    {},
    [],
    true,
  );
}
export const command = <S extends z.ZodRawShape>(shape: S) =>
  z.strictObject({ ...shape, version: z.number().int().nonnegative() });
export const openStatuses: RequestStatus[] = [
  'DRAFT',
  'AWAITING_MANAGER',
  'RETURNED',
  'AT_PURCHASING',
  'PAUSED',
  'FULFILMENT',
];
export type ActionHint = 'primary' | 'secondary' | 'danger';
interface Rules {
  key: PermissionKey | 'system';
  statuses: readonly RequestStatus[];
  owner?: boolean;
  hint?: ActionHint;
  ready?: (state: RequestState) => RefusalCode | undefined;
}
function verdict(run: () => void): Verdict {
  try {
    run();
    return { ok: true };
  } catch (error) {
    if (error instanceof LifecycleError)
      return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
export function action<S extends z.ZodType<{ version: number }>>(
  schema: S,
  rules: Rules,
  change: (ctx: Context, input: z.output<S>, viewer: Viewer | null) => void,
) {
  function authorized(state: RequestState, viewer: Viewer | null) {
    if (rules.key === 'system') {
      if (viewer !== null) refuse('SYSTEM_ONLY');
    } else {
      if (!viewer || !holds(viewer, rules.key)) refuse('FORBIDDEN');
      if (!inSite(viewer, state.siteId)) refuse('OUT_OF_SCOPE');
      if (rules.owner && state.createdById !== viewer.userId)
        refuse('NOT_CREATOR');
    }
  }
  function checkStatus(state: RequestState) {
    if (state.deleted || !rules.statuses.includes(state.status))
      refuse('WRONG_STATUS');
  }
  function available(state: RequestState, viewer: Viewer | null) {
    return verdict(() => {
      authorized(state, viewer);
      checkStatus(state);
      const reason = rules.ready?.(state);
      if (reason) refuse(reason);
    });
  }
  function apply(
    state: RequestState,
    viewer: Viewer | null,
    input: z.input<S>,
    now: Date,
  ): Transition {
    authorized(state, viewer);
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      if (issue.path.includes('reason')) refuse('REASON_REQUIRED');
      if (issue.path.includes('confirm')) refuse('CONFIRM_REQUIRED');
      if (issue.path.includes('quantity')) refuse('INVALID_QUANTITY');
      refuse('INVALID_INPUT');
    }
    if (parsed.data.version !== state.version) refuse('VERSION_CONFLICT');
    checkStatus(state);
    const reason = rules.ready?.(state);
    if (reason) refuse(reason);
    const next = structuredClone(state);
    const result: Transition = {
      next,
      events: [],
      notify: [],
      priceRecords: [],
    };
    const at = now.toISOString();
    const actor = viewer?.userId ?? null;
    const ctx: Context = {
      state: next,
      result,
      actorId: actor,
      now: at,
      emit(type, payload, itemIds = [], system = false) {
        // A closing item and the following system transition are separate timeline entries.
        const stageAfter =
          next.status === 'FULFILMENT' && autoOutcome(next)
            ? deriveStage(state)
            : deriveStage(next);
        result.events.push({
          requestId: state.id,
          type,
          payload,
          itemIds,
          stageAfter,
          at,
          actorId: system ? null : actor,
        } as EventDraft);
        result.notify.push(
          ...notifications(
            next,
            actor,
            type,
            type === 'RECEIPT_RECORDED' &&
              next.items.some(
                (i) => itemIds.includes(i.id) && i.state === 'REMAINING',
              ),
          ),
        );
      },
    };
    change(ctx, parsed.data, viewer);
    if (next.status === 'FULFILMENT') finish(ctx);
    if (state.status === 'PAUSED' && next.status !== 'PAUSED') {
      next.pausedAt = null;
      next.pausedById = null;
      next.pauseReason = null;
    }
    next.version++;
    return result;
  }
  function can(state: RequestState, viewer: Viewer | null, input: z.input<S>) {
    return verdict(() => {
      apply(state, viewer, input, new Date(0));
    });
  }
  return { can, apply, available, hint: rules.hint ?? 'secondary' };
}
