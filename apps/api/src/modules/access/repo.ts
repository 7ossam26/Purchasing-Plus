import { Prisma, type PrismaClient } from '@prisma/client';

import { verifyAudit } from './audit.js';
export type Tx = Prisma.TransactionClient;
export function accessTransaction<T>(
  db: PrismaClient,
  write: boolean,
  work: (tx: Tx) => Promise<T>,
) {
  return db.$transaction(
    async (tx) => {
      // A consistent order across processes protects grant checks, bootstrap and last-account checks.
      await tx.$executeRaw(
        write
          ? Prisma.sql`SELECT pg_advisory_xact_lock(735219)`
          : Prisma.sql`SELECT pg_advisory_xact_lock_shared(735219)`,
      );
      return work(tx);
    },
    { timeout: 15000 },
  );
}
export const userSelect = {
  id: true,
  name: true,
  username: true,
  isActive: true,
  isSuperadmin: true,
  roleId: true,
  sites: { select: { siteId: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
export const roleInclude = {
  permissions: { select: { key: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleInclude;
export async function listAudit(
  tx: Tx,
  where: Prisma.AuditLogWhereInput,
  page: number,
  pageSize: number,
  secret: string,
) {
  const rows = await tx.auditLog.findMany({
    where,
    take: pageSize,
    skip: (page - 1) * pageSize,
    orderBy: { id: 'desc' },
  });
  return {
    items: rows.map(({ signature, ...row }) => ({
      ...row,
      verified: verifyAudit(secret, { ...row, signature }),
    })),
    total: await tx.auditLog.count({ where }),
    page,
    pageSize,
  };
}
const auditIdentity = {
  id: true,
  createdAt: true,
  actorId: true,
  actorLabel: true,
  action: true,
  entity: true,
  entityId: true,
  ip: true,
  signature: true,
} as const;

export type AuditReader = Pick<Tx, 'auditLog'>;
export async function verifyAuditPage(
  tx: AuditReader,
  ids: number[],
  secret: string,
) {
  const rows = await tx.auditLog.findMany({
    where: { id: { in: ids } },
    select: auditIdentity,
  });
  const status = new Map(rows.map((row) => [row.id, verifyAudit(secret, row)]));
  return {
    items: ids.map((id) => ({ id, verified: status.get(id) ?? false })),
  };
}

export async function auditSnapshot(tx: AuditReader) {
  const { _max, _count } = await tx.auditLog.aggregate({
    _max: { id: true },
    _count: true,
  });
  return { lastId: _max.id ?? 0, total: _count };
}

export function auditBatch(tx: AuditReader, after: number, lastId: number) {
  return tx.auditLog.findMany({
    where: { id: { gt: after, lte: lastId } },
    orderBy: { id: 'asc' },
    take: 250,
    select: auditIdentity,
  });
}
export function actorById(tx: Tx, id: number) {
  return tx.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, isSuperadmin: true },
  });
}
export function findSession(tx: Tx, id: string) {
  return tx.session.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          isActive: true,
          isSuperadmin: true,
          updatedAt: true,
          sites: { select: { siteId: true } },
          role: { select: { id: true, updatedAt: true, siteScope: true } },
        },
      },
    },
  });
}
export function storedKeys(tx: Tx, roleId: number) {
  return tx.rolePermission.findMany({
    where: { roleId },
    select: { key: true },
  });
}
export function touchSession(tx: Tx, id: string, expiresAt: Date) {
  return tx.session.update({ where: { id }, data: { expiresAt } });
}
