import { isDeepStrictEqual } from 'node:util';

import { Prisma } from '@prisma/client';
import { cairoYear } from '@purchasing-plus/shared';
import {
  deriveStage,
  matchesRecipient,
  purchasingQueueRules,
  snapshot,
  type EventDraft,
  type NotifyIntent,
  type RequestState,
} from '@purchasing-plus/shared/lifecycle';
import { isPermissionKey } from '@purchasing-plus/shared/permissions';

import {
  allowed,
  missing,
  siteWhere,
  type Viewer,
} from '../../middleware/access.js';
import type { Tx } from '../access/repo.js';
import { visiblePath } from '../catalog-tree/repo.js';
import { batchSummary, roundState } from '../purchasing/repo.js';

const include = {
  batches: batchSummary,
  rounds: roundState,
  items: {
    omit: { requestId: true, pickedAt: true, supplierId: true },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { lineNo: 'asc' },
  },
  site: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
  approver: { select: { id: true, name: true } },
  copiedFrom: { select: { siteId: true } },
  events: {
    where: { type: 'RETURNED_FOR_EDIT' },
    orderBy: { id: 'desc' },
    take: 1,
    select: { payload: true },
  },
} satisfies Prisma.RequestInclude;
export type RequestRecord = Prisma.RequestGetPayload<{
  include: typeof include;
}>;

export async function loadRequestInScope(
  tx: Tx,
  requestId: number,
  viewer: Viewer,
  lock = false,
) {
  if (lock) {
    const matches = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
      SELECT id FROM "Request" WHERE id = ${requestId} AND ${siteSql(viewer)} FOR UPDATE
    `);
    if (!matches.length) throw missing();
  }
  const row = await tx.request.findFirst({
    where: { id: requestId, ...siteWhere(viewer) },
    include,
  });
  if (!row) throw missing();
  return row;
}

export function toState(row: RequestRecord): RequestState {
  const {
    items,
    number,
    id,
    siteId,
    categoryId,
    createdById,
    status,
    version,
    urgency,
    urgencyLocked,
    isModified,
    unitOrClient,
    note,
    deliveryFee,
    pausedById,
    pausedAt,
    pauseReason,
    approvedById,
    copiedFromId,
    rounds,
    batches,
    supplyOrders,
  } = row;
  return {
    id,
    number,
    siteId,
    categoryId,
    createdById,
    status,
    version,
    urgency,
    urgencyLocked,
    isModified,
    unitOrClient,
    note,
    deliveryFee: deliveryFee?.toFixed(2) ?? null,
    pausedById,
    pausedAt: pausedAt?.toISOString() ?? null,
    pauseReason,
    approvedById,
    copiedFromId,
    deleted: false,
    rounds: rounds.map(({ items, ...round }) => ({
      ...round,
      decidedAt: round.decidedAt?.toISOString() ?? null,
      lines: items.map((line) => ({
        ...line,
        lineTotal: line.lineTotal.toFixed(2),
        quantity: line.quantity.toFixed(2),
      })),
    })),
    batches: batches.map((batch) => ({
      id: batch.id,
      itemIds: batch.items.map((line) => line.itemId),
      supplierIds: batch.suppliers.map((s) => s.supplierId),
      sentTo: batch.suppliers.flatMap((s) => (s.sentAt ? [s.supplierId] : [])),
    })),
    supplyOrders: supplyOrders as unknown as RequestState['supplyOrders'],
    items: items.map(
      ({
        snapshot: json,
        quantity,
        receivedQty,
        lineTotal,
        pricedQuantity,
        supplier,
        ...item
      }) => ({
        ...item,
        supplierId: supplier?.id ?? null,
        snapshot: snapshot.parse(json),
        quantity: quantity.toFixed(2),
        receivedQty: receivedQty.toFixed(2),
        lineTotal: lineTotal?.toFixed(2) ?? null,
        pricedQuantity: pricedQuantity?.toFixed(2) ?? null,
      }),
    ),
  };
}

export function findSite(tx: Tx, id: number) {
  return tx.site.findUnique({ where: { id }, select: { isActive: true } });
}
export function findCategory(tx: Tx, id: number) {
  return tx.catalogNode.findFirst({
    where: { id, parentId: null, isActive: true },
    select: { id: true },
  });
}
export async function requestOptions(
  tx: Tx,
  viewer: Viewer,
  withUnits: boolean,
) {
  const sites = await tx.site.findMany({
    where: { id: siteWhere(viewer).siteId },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const categories = await tx.catalogNode.findMany({
    where: { parentId: null },
    select: { id: true, name: true, isActive: true, iconKey: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const units = withUnits
    ? await tx.unit.findMany({
        where: { isActive: true },
        select: { id: true, name: true, isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      })
    : [];
  return { sites, categories, units };
}
export function findLineNodes(tx: Tx, ids: number[]) {
  return tx.catalogNode.findMany({
    where: { id: { in: ids } },
    select: { id: true, path: true },
  });
}
export function findLineUnits(tx: Tx, ids: number[]) {
  return tx.unit.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isActive: true },
  });
}

export async function reserveIds(
  tx: Tx,
  table: 'Request' | 'RequestItem' | 'RfqBatch',
  count: number,
) {
  if (!count) return [];
  const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT nextval(pg_get_serial_sequence(${'"' + table + '"'}, 'id'))::int AS id
    FROM generate_series(1, ${count}::int)
  `);
  return rows.map((row) => row.id);
}
export async function nextRequestNumber(tx: Tx, now: Date) {
  const [row] = await tx.$queryRaw<{ lastValue: number }[]>(Prisma.sql`
    INSERT INTO "RequestNumberSequence" ("year", "lastValue") VALUES (${Number(cairoYear(now))}, 1)
    ON CONFLICT ("year") DO UPDATE SET "lastValue" = "RequestNumberSequence"."lastValue" + 1
    WHERE "RequestNumberSequence"."lastValue" < 99999
    RETURNING "lastValue"
  `);
  return row?.lastValue;
}

function requestData(state: RequestState, now: Date, previous?: RequestRecord) {
  const {
    id,
    number,
    siteId,
    categoryId,
    createdById,
    status,
    version,
    urgency,
    urgencyLocked,
    isModified,
    unitOrClient,
    note,
    deliveryFee,
    pausedById,
    pausedAt,
    pauseReason,
    approvedById,
    copiedFromId,
    supplyOrders,
  } = state;
  const displayedStage = deriveStage(state);
  return {
    id,
    number,
    siteId,
    categoryId,
    createdById,
    status,
    version,
    urgency,
    urgencyLocked,
    isModified,
    unitOrClient,
    note,
    deliveryFee,
    pausedById,
    pausedAt,
    pauseReason,
    approvedById,
    copiedFromId,
    supplyOrders: supplyOrders.map((order) => ({
      ...order,
      lines: order.lines.map((line) => ({ ...line })),
    })),
    submittedAt: previous?.submittedAt ?? (state.number ? now : null),
    displayedStage,
    stageStartedAt:
      previous?.displayedStage === displayedStage
        ? previous.stageStartedAt
        : now,
    updatedAt: now,
  } satisfies Prisma.RequestUncheckedCreateInput;
}
export async function insertRequest(tx: Tx, state: RequestState, now: Date) {
  await tx.request.create({
    data: { ...requestData(state, now), createdAt: now },
  });
  await tx.requestItem.createMany({
    data: state.items.map((item) => ({
      ...item,
      requestId: state.id,
      pickedAt: now,
    })),
  });
}
export async function updateRequest(
  tx: Tx,
  row: RequestRecord,
  previous: RequestState,
  next: RequestState,
  now: Date,
) {
  if (next.deleted) {
    await tx.request.delete({ where: { id: row.id } });
    return;
  }
  await tx.request.update({
    where: { id: row.id },
    data: requestData(next, now, row),
  });
  const currentIds = new Set(next.items.map((i) => i.id));
  const removed = previous.items
    .filter((i) => !currentIds.has(i.id))
    .map((i) => i.id);
  if (removed.length)
    await tx.requestItem.deleteMany({
      where: { requestId: row.id, id: { in: removed } },
    });
  const old = new Map(previous.items.map((i) => [i.id, i]));
  const renumbered = next.items.filter(
    (i) => old.has(i.id) && old.get(i.id)!.lineNo !== i.lineNo,
  );
  if (renumbered.length) {
    // Free occupied positive positions before swapping draft lines.
    await tx.$executeRaw(Prisma.sql`
      UPDATE "RequestItem" SET "lineNo" = -"lineNo"
      WHERE "requestId" = ${row.id} AND id IN (${Prisma.join(renumbered.map((i) => i.id))})
    `);
  }
  const added = next.items.filter((i) => !old.has(i.id));
  if (added.length)
    await tx.requestItem.createMany({
      data: added.map((i) => ({ ...i, requestId: row.id, pickedAt: now })),
    });
  for (const item of next.items) {
    const prior = old.get(item.id);
    if (prior && !isDeepStrictEqual(prior, item)) {
      await tx.requestItem.update({
        where: { id: item.id },
        data: {
          ...item,
          ...(item.catalogItemId !== prior.catalogItemId
            ? { pickedAt: now }
            : {}),
        },
      });
    }
  }
}

export function findActor(tx: Tx, id: number) {
  return tx.user.findUniqueOrThrow({
    where: { id },
    select: {
      name: true,
      isSuperadmin: true,
      role: { select: { name: true } },
    },
  });
}
export function appendEvent(
  tx: Tx,
  draft: EventDraft,
  actorName: string | null,
  actorRoleName: string | null,
) {
  return tx.requestEvent.create({
    data: { ...draft, actorName, actorRoleName },
  });
}
export async function appendNotifications(
  tx: Tx,
  eventId: number,
  intents: NotifyIntent[],
  now: Date,
) {
  const first = intents[0];
  if (!first) return;
  const candidates = await tx.user.findMany({
    where: {
      isActive: true,
      isSuperadmin: false,
      id: { not: first.excludeUserId },
      AND: [
        {
          OR: [
            { role: { siteScope: 'ALL' } },
            { sites: { some: { siteId: first.siteId } } },
          ],
        },
        {
          OR: intents.map((intent) =>
            'userId' in intent
              ? { id: intent.userId }
              : { role: { permissions: { some: { key: intent.holdersOf } } } },
          ),
        },
      ],
    },
    select: {
      id: true,
      role: {
        select: { siteScope: true, permissions: { select: { key: true } } },
      },
      sites: { select: { siteId: true } },
    },
  });
  const recipients = candidates.filter(
    (user) =>
      user.role &&
      intents.some((intent) =>
        matchesRecipient(intent, {
          userId: user.id,
          isSuperadmin: false,
          siteIds: user.sites.map((s) => s.siteId),
          siteScope: user.role!.siteScope,
          permissions: new Set(
            user.role!.permissions.map((p) => p.key).filter(isPermissionKey),
          ),
        }),
      ),
  );
  if (recipients.length)
    await tx.notification.createMany({
      data: recipients.map((user) => ({
        eventId,
        userId: user.id,
        requestId: first.requestId,
        createdAt: now,
      })),
    });
}

export function purchasingQueueWhere(viewer: Viewer): Prisma.RequestWhereInput {
  const branches = purchasingQueueRules
    .filter((rule) => rule.anyOf.some((key) => allowed(viewer, key)))
    .map((rule) => ({
      status: rule.status,
      ...(rule.items
        ? { items: { some: { state: { in: [...rule.items] } } } }
        : {}),
      ...(rule.unsentOrder
        ? { supplyOrders: { array_contains: [{ sent: false }] } }
        : {}),
    }));
  return branches.length ? { OR: branches } : { id: { in: [] } };
}

export async function listRequests(
  tx: Tx,
  viewer: Viewer,
  filters: Prisma.RequestWhereInput,
  page: number,
  pageSize: number,
) {
  const where = { AND: [siteWhere(viewer), filters] };
  const rows = await tx.request.findMany({
    where,
    include,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: [{ urgency: 'desc' }, { stageStartedAt: 'asc' }, { id: 'asc' }],
  });
  const total = await tx.request.count({ where });
  return { rows, total, page, pageSize };
}
export function timeline(tx: Tx, requestId: number, viewer: Viewer) {
  return tx.requestEvent.findMany({
    where: { requestId, request: siteWhere(viewer) },
    orderBy: { id: 'asc' },
  });
}
export async function visibleRequestIds(tx: Tx, viewer: Viewer, ids: number[]) {
  if (!ids.length) return new Set<number>();
  const rows = await tx.request.findMany({
    where: { id: { in: ids }, ...siteWhere(viewer) },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

function siteSql(viewer: Viewer, column = Prisma.sql`"siteId"`) {
  const scope = siteWhere(viewer).siteId;
  return scope
    ? scope.in.length
      ? Prisma.sql`${column} IN (${Prisma.join(scope.in)})`
      : Prisma.sql`FALSE`
    : Prisma.sql`TRUE`;
}
export async function recentItemIds(
  tx: Tx,
  viewer: Viewer,
  categoryId: number,
) {
  const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT ci.id FROM "RequestItem" ri
    JOIN "Request" r ON r.id = ri."requestId"
    JOIN "CatalogItem" ci ON ci.id = ri."catalogItemId"
    JOIN "CatalogNode" n ON n.id = ci."nodeId"
    WHERE r."createdById" = ${viewer.userId} AND ${siteSql(viewer, Prisma.sql`r."siteId"`)}
      AND r."categoryId" = ${categoryId} AND ri.state <> 'REMOVED'
      AND ci."isActive" AND ${visiblePath(Prisma.sql`n.path`)}
    GROUP BY ci.id
    ORDER BY max(ri."pickedAt") DESC, max(ri.id) DESC, ci.id
    LIMIT 12
  `);
  return rows.map((row) => row.id);
}
