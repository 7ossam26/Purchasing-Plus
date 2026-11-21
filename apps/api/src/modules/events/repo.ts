import type { Prisma, PrismaClient } from '@prisma/client';

import { allowed, siteWhere, type Viewer } from '../../middleware/access.js';
import type { Tx } from '../access/repo.js';

function visible(viewer: Viewer): Prisma.NotificationWhereInput {
  return {
    userId: viewer.userId,
    request: siteWhere(viewer),
    ...(allowed(viewer, 'requests.view') ? {} : { id: { in: [] } }),
  };
}

const select = {
  id: true,
  requestId: true,
  createdAt: true,
  readAt: true,
  event: { select: { type: true } },
  request: { select: { number: true } },
} satisfies Prisma.NotificationSelect;

export async function listNotifications(tx: Tx, viewer: Viewer, page: number) {
  const where = visible(viewer);
  const pageSize = 30;
  const rows = await tx.notification.findMany({
    where,
    select,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const total = await tx.notification.count({ where });
  const unread = await tx.notification.count({
    where: { ...where, readAt: null },
  });
  return {
    page,
    pageSize,
    total,
    unread,
    items: rows.map(({ event, request, ...row }) => ({
      ...row,
      type: event.type,
      number: request.number,
    })),
  };
}

export async function markRead(tx: Tx, viewer: Viewer, now: Date, id?: number) {
  const where: Prisma.NotificationWhereInput =
    id === undefined ? visible(viewer) : { AND: [visible(viewer), { id }] };
  if (id !== undefined && !(await tx.notification.count({ where })))
    return null;
  const result = await tx.notification.updateMany({
    where: { AND: [where, { readAt: null }] },
    data: { readAt: now },
  });
  return result.count;
}

export async function latestNotification(tx: Tx, viewer: Viewer) {
  const latest = await tx.notification.findFirst({
    where: visible(viewer),
    select: { id: true },
    orderBy: { id: 'desc' },
  });
  return latest?.id ?? 0;
}

export function replayNotifications(tx: Tx, viewer: Viewer, after: number) {
  return tx.notification.findMany({
    where: { AND: [visible(viewer), { id: { gt: after } }] },
    select: { id: true, requestId: true, event: { select: { type: true } } },
    orderBy: { id: 'asc' },
    take: 100,
  });
}

export function purgeNotifications(db: PrismaClient, now: Date) {
  return db.notification.deleteMany({
    where: { createdAt: { lt: new Date(+now - 90 * 86_400_000) } },
  });
}
