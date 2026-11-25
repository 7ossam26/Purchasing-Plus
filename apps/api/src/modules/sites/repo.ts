import type { Prisma } from '@prisma/client';
import type { siteFilters } from '@purchasing-plus/shared';
import { siteEngineerKey } from '@purchasing-plus/shared/permissions';

import type { Tx } from '../access/repo.js';
export async function listSites(
  tx: Tx,
  ids: number[] | undefined,
  { page, pageSize, search, active }: ReturnType<typeof siteFilters.parse>,
) {
  const where = {
    id: ids ? { in: ids } : undefined,
    isActive: active,
    OR: search
      ? [
          { name: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ]
      : undefined,
  };
  const items = await tx.site.findMany({
    where,
    orderBy: { id: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, page, pageSize, total: await tx.site.count({ where }) };
}
export function findSite(tx: Tx, id: number) {
  return tx.site.findUniqueOrThrow({ where: { id } });
}
export function createSite(tx: Tx, data: { name: string; address: string }) {
  return tx.site.create({ data });
}
export async function updateSite(
  tx: Tx,
  id: number,
  data: { name?: string; address?: string; isActive?: boolean },
) {
  const before = await tx.site.findUniqueOrThrow({ where: { id } });
  const after = await tx.site.update({ where: { id }, data });
  return { before, after };
}

// The database form of the engineer rule. `isSiteEngineer` is the same rule for loaded rows.
const engineerWhere = {
  isSuperadmin: false,
  role: {
    siteScope: 'ASSIGNED',
    permissions: { some: { key: siteEngineerKey } },
  },
} satisfies Prisma.UserWhereInput;
const accountSelect = {
  id: true,
  name: true,
  username: true,
  isActive: true,
  isSuperadmin: true,
  role: {
    select: { siteScope: true, permissions: { select: { key: true } } },
  },
  sites: {
    select: { siteId: true, site: { select: { name: true } } },
    orderBy: { siteId: 'asc' },
  },
} satisfies Prisma.UserSelect;
export type SiteAccount = Prisma.UserGetPayload<{
  select: typeof accountSelect;
}>;
export function isSiteEngineer(account: SiteAccount) {
  return (
    !account.isSuperadmin &&
    account.role?.siteScope === 'ASSIGNED' &&
    account.role.permissions.some(({ key }) => key === siteEngineerKey)
  );
}
const byName = [{ name: 'asc' }, { id: 'asc' }] as const;

// Includes inactive engineers so their assignment can still be shown and removed.
export function siteEngineers(tx: Tx, siteId: number) {
  return tx.user.findMany({
    where: { ...engineerWhere, sites: { some: { siteId } } },
    select: accountSelect,
    orderBy: [...byName],
  });
}
export function accountsByIds(tx: Tx, ids: number[]) {
  return tx.user.findMany({
    where: { id: { in: ids } },
    select: accountSelect,
  });
}
// Narrows candidates in SQL. The caller still applies the full grant check to each row.
export function engineerCandidates(
  tx: Tx,
  filter: {
    excludeId?: number;
    keys?: string[];
    siteIds?: number[];
    search?: string;
  },
) {
  return tx.user.findMany({
    where: {
      ...engineerWhere,
      isActive: true,
      id: filter.excludeId ? { not: filter.excludeId } : undefined,
      AND: [
        filter.keys
          ? { role: { permissions: { every: { key: { in: filter.keys } } } } }
          : {},
        filter.siteIds
          ? { sites: { every: { siteId: { in: filter.siteIds } } } }
          : {},
      ],
      OR: filter.search
        ? [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { username: { contains: filter.search, mode: 'insensitive' } },
          ]
        : undefined,
    },
    select: accountSelect,
    orderBy: [...byName],
  });
}
// Each call touches only this site's rows, so assignments to other sites are preserved.
export function assignEngineers(tx: Tx, siteId: number, userIds: number[]) {
  return tx.userSite.createMany({
    data: userIds.map((userId) => ({ userId, siteId })),
    skipDuplicates: true,
  });
}
export function unassignEngineers(tx: Tx, siteId: number, userIds: number[]) {
  return tx.userSite.deleteMany({ where: { siteId, userId: { in: userIds } } });
}
