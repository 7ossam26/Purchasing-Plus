import {
  ar,
  cairoDateBoundary,
  createCatalogItem,
  type addRequestItemToCatalogInput,
  type copyRequestInput,
  type createRequestInput,
  type editRequestInput,
  type requestListInput,
  type saveDraftInput,
} from '@purchasing-plus/shared';
import {
  actions,
  applySaveDraft,
  canSaveDraft,
  catalogConversionItem,
  copyableItems,
  draftState,
  LifecycleError,
  type ActionInput,
  type ActionName,
  type RequestState,
  type Verdict,
  type Transition,
} from '@purchasing-plus/shared/lifecycle';
import type { z } from 'zod';

import {
  assertSiteInScope,
  missing,
  type Viewer,
} from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import { addItem, itemsByIds } from '../catalog/service.js';

import {
  forCopy,
  hydrateLines,
  lineChanges,
  snapshotForSubmit,
} from './catalog.js';
import { timelinePayload, toRequestDto } from './dto.js';
import * as repo from './repo.js';

const conflictCodes = new Set([
  'VERSION_CONFLICT',
  'WRONG_STATUS',
  'WRONG_ITEM_STATE',
  'URGENCY_LOCKED',
  'MUST_RAISE',
  'NEEDS_REPRICING',
  'ROUND_NOT_PENDING',
  'NO_PENDING_SEND',
  'NOT_CLOSED',
  'UNIT_PRICE_TOO_LARGE',
]);
function appError(error: LifecycleError) {
  const { code, message } = error;
  if (code === 'OUT_OF_SCOPE' || code === 'ITEM_NOT_FOUND') return missing();
  if (code === 'FORBIDDEN' || code === 'NOT_CREATOR' || code === 'SYSTEM_ONLY')
    return new AppError(403, code, message);
  return new AppError(conflictCodes.has(code) ? 409 : 422, code, message);
}
function assertOk(verdict: Verdict) {
  if (!verdict.ok) throw appError(new LifecycleError(verdict.code));
}
async function activeSite(ctx: Context, siteId: number) {
  assertSiteInScope(ctx.viewer, siteId);
  if (!(await repo.findSite(ctx.tx, siteId))?.isActive)
    throw new AppError(422, 'INVALID_SITE', ar.requests.inactiveSite);
}
async function activeCategory(ctx: Context, categoryId: number) {
  if (!(await repo.findCategory(ctx.tx, categoryId)))
    throw new AppError(422, 'INVALID_CATEGORY', ar.requests.invalidCategory);
}
async function appendEffects(ctx: Context, result: Transition) {
  if (!result.events.length) return;
  const actor = await repo.findActor(ctx.tx, ctx.viewer.userId);
  for (const event of result.events) {
    const human = event.actorId !== null;
    const row = await repo.appendEvent(
      ctx.tx,
      event,
      human ? actor.name : null,
      human
        ? actor.isSuperadmin
          ? ar.requests.support
          : (actor.role?.name ?? null)
        : null,
    );
    await repo.appendNotifications(
      ctx.tx,
      row.id,
      result.notify.filter(
        (intent) =>
          intent.event === event.type && intent.requestId === event.requestId,
      ),
      ctx.now,
    );
  }
}

export async function createDraft(
  ctx: Context,
  input: z.output<typeof createRequestInput>,
) {
  const { siteId, categoryId, ...fields } = input;
  await activeSite(ctx, siteId);
  await activeCategory(ctx, categoryId);
  const [id] = await repo.reserveIds(ctx.tx, 'Request', 1);
  const state = draftState({
    id: id!,
    siteId,
    categoryId,
    createdById: ctx.viewer.userId,
  });
  const command = { version: 0, fields };
  assertOk(canSaveDraft(state, ctx.viewer, command));
  const result = applySaveDraft(state, ctx.viewer, command, ctx.now);
  await repo.insertRequest(ctx.tx, result.next, ctx.now);
  await appendEffects(ctx, result);
  await ctx.audit('request.create', 'Request', state.id, null, result.next);
  return getRequest(ctx, state.id);
}

type Prepared<A extends ActionName> = {
  command: ActionInput<A>;
  state?: RequestState;
};
type Command<A extends ActionName> = {
  available: (state: RequestState, viewer: Viewer | null) => Verdict;
  can: (
    state: RequestState,
    viewer: Viewer | null,
    input: ActionInput<A>,
  ) => Verdict;
  apply: (
    state: RequestState,
    viewer: Viewer | null,
    input: ActionInput<A>,
    now: Date,
  ) => Transition;
};

// The endpoint owns the surrounding transaction and keeps grants stable until it commits.
export async function runTransition<
  A extends ActionName,
  I extends { version: number },
>(
  ctx: Context,
  requestId: number,
  name: A,
  read: () => I,
  prepare: (
    state: RequestState,
    input: I,
  ) => Prepared<A> | Promise<Prepared<A>>,
) {
  const { tx, viewer, now } = ctx;
  const row = await repo.loadRequestInScope(tx, requestId, viewer, true);
  const previous = repo.toState(row);
  const input = read();
  if (input.version !== previous.version)
    throw appError(new LifecycleError('VERSION_CONFLICT'));
  const action = actions[name] as Command<A>;
  assertOk(action.available(previous, viewer));
  try {
    const { command, state = previous } = await prepare(previous, input);
    assertOk(action.can(state, viewer, command));
    const result = action.apply(state, viewer, command, now);
    await repo.updateRequest(tx, row, previous, result.next, now);
    if (result.copiedDraft)
      await repo.insertRequest(tx, result.copiedDraft, now);
    await appendEffects(ctx, result);
    await ctx.audit(
      'request.' + name,
      'Request',
      requestId,
      previous,
      result.next.deleted ? null : result.next,
    );
    if (result.copiedDraft)
      await ctx.audit(
        'request.create',
        'Request',
        result.copiedDraft.id,
        null,
        result.copiedDraft,
      );
    return result.next.deleted
      ? null
      : getRequest(ctx, result.copiedDraft?.id ?? requestId);
  } catch (error) {
    if (error instanceof LifecycleError) throw appError(error);
    throw error;
  }
}

export function save(
  ctx: Context,
  id: number,
  read: () => z.output<typeof saveDraftInput>,
) {
  return runTransition(
    ctx,
    id,
    'saveDraft',
    read,
    async (state, { version, items, ...fields }) => {
      if (fields.siteId !== undefined) await activeSite(ctx, fields.siteId);
      const lines = await hydrateLines(
        ctx.tx,
        state.categoryId,
        items,
        state.items,
      );
      return {
        command: {
          version,
          fields,
          ...lineChanges(state, lines),
          order: lines.map((line) => line.id),
        },
      };
    },
  );
}
export function edit(
  ctx: Context,
  id: number,
  read: () => z.output<typeof editRequestInput>,
) {
  return runTransition(
    ctx,
    id,
    'editBeforeApproval',
    read,
    async (state, { version, items, ...fields }) => {
      const changes =
        items === undefined
          ? {}
          : lineChanges(
              state,
              await hydrateLines(ctx.tx, state.categoryId, items, state.items),
            );
      return { command: { version, fields, ...changes } };
    },
  );
}
export function submit(
  ctx: Context,
  id: number,
  read: () => { version: number },
) {
  return runTransition(ctx, id, 'submit', read, async (state, input) => {
    await activeSite(ctx, state.siteId);
    await activeCategory(ctx, state.categoryId);
    const fresh = await snapshotForSubmit(ctx.tx, state);
    const sequence = await repo.nextRequestNumber(ctx.tx, ctx.now);
    if (sequence === undefined)
      throw new AppError(409, 'REQUEST_NUMBER_LIMIT', ar.requests.numberLimit);
    return { command: { ...input, sequence }, state: fresh };
  });
}
export function copy(
  ctx: Context,
  id: number,
  read: () => z.output<typeof copyRequestInput>,
) {
  return runTransition(ctx, id, 'copyRequest', read, async (state, input) => {
    await activeSite(ctx, input.siteId ?? state.siteId);
    const selected = copyableItems(state, input.itemIds);
    const [newId] = await repo.reserveIds(ctx.tx, 'Request', 1);
    return {
      command: {
        ...input,
        newId: newId!,
        lines: await forCopy(ctx.tx, state.categoryId, selected),
      },
    };
  });
}
export function convert(
  ctx: Context,
  id: number,
  itemId: number,
  read: () => z.output<typeof addRequestItemToCatalogInput>,
) {
  return runTransition(
    ctx,
    id,
    'addToCatalog',
    read,
    async (state, { version, ...edits }) => {
      const line = catalogConversionItem(state, itemId);
      const input = createCatalogItem.parse({
        name: line.otherName,
        unitId: line.unitId,
        nodeId: line.nodeId,
        ...edits,
      });
      const item = await addItem(ctx, input);
      if (item.nodePath[0]?.id !== state.categoryId)
        throw new AppError(
          422,
          'INVALID_CATEGORY',
          ar.requests.invalidCategory,
        );
      return {
        command: { version, itemId, catalogItemId: item.id, code: item.code },
      };
    },
  );
}

export async function getRequest(ctx: Context, id: number) {
  return toRequestDto(
    await repo.loadRequestInScope(ctx.tx, id, ctx.viewer),
    ctx.viewer,
  );
}

export async function list(
  ctx: Context,
  {
    page,
    pageSize,
    stage,
    q,
    from,
    to,
    ...filters
  }: z.output<typeof requestListInput>,
) {
  const dateOnly = (v: string) => v.length === 10;
  const start =
    from && (dateOnly(from) ? cairoDateBoundary(from) : new Date(from));
  const end = to && (dateOnly(to) ? cairoDateBoundary(to, true) : new Date(to));
  if (start && end && (start > end || (dateOnly(to!) && +start === +end)))
    throw new AppError(422, 'INVALID_DATE_RANGE', ar.requests.invalidDateRange);
  const result = await repo.listRequests(
    ctx.tx,
    ctx.viewer,
    {
      ...filters,
      displayedStage: stage,
      ...(q ? { number: { contains: q, mode: 'insensitive' } } : {}),
      createdAt: {
        ...(start ? { gte: start } : {}),
        ...(end ? (dateOnly(to!) ? { lt: end } : { lte: end }) : {}),
      },
    },
    page,
    pageSize,
  );
  return {
    items: result.rows.map((row) => toRequestDto(row, ctx.viewer)),
    total: result.total,
    page,
    pageSize,
  };
}

export async function getTimeline(ctx: Context, id: number) {
  await repo.loadRequestInScope(ctx.tx, id, ctx.viewer);
  const rows = await repo.timeline(ctx.tx, id, ctx.viewer);
  const linkIds = rows.flatMap((row) =>
    row.type === 'COPIED_TO' || row.type === 'COPIED_FROM'
      ? [(row.payload as { requestId: number }).requestId]
      : [],
  );
  const links = await repo.visibleRequestIds(ctx.tx, ctx.viewer, linkIds);
  return {
    items: rows.map((row) => ({
      ...row,
      payload: timelinePayload(row.type, row.payload, ctx.viewer, links),
    })),
  };
}

export async function recent(ctx: Context, categoryId: number) {
  await activeCategory(ctx, categoryId);
  const ids = await repo.recentItemIds(ctx.tx, ctx.viewer, categoryId);
  return { items: await itemsByIds(ctx, ids) };
}
