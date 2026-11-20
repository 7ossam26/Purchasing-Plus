import type { Prisma } from '@prisma/client';

import { userSelect, type Tx } from '../access/repo.js';
export function activeSiteCount(tx: Tx, ids: number[]) {
  return tx.site.count({ where: { id: { in: ids }, isActive: true } });
}
export function activeSupportCount(tx: Tx) {
  return tx.user.count({ where: { isSuperadmin: true, isActive: true } });
}
export function findAccount(tx: Tx, id: number, support: boolean) {
  return tx.user.findFirst({
    where: { id, isSuperadmin: support },
    select: userSelect,
  });
}
export function insertAccount(tx: Tx, data: Prisma.UserUncheckedCreateInput) {
  return tx.user.create({ data, select: userSelect });
}
export function saveAccount(
  tx: Tx,
  id: number,
  data: Prisma.UserUncheckedUpdateInput,
) {
  return tx.user.update({ where: { id }, data, select: userSelect });
}
export async function findAccounts(
  tx: Tx,
  where: Prisma.UserWhereInput,
  page: number,
  pageSize: number,
) {
  const items = await tx.user.findMany({
    where,
    select: {
      ...userSelect,
      role: {
        select: {
          name: true,
          siteScope: true,
          permissions: { select: { key: true } },
        },
      },
      sites: {
        select: {
          siteId: true,
          site: { select: { name: true, isActive: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total: await tx.user.count({ where }) };
}

export async function accountOptions(tx: Tx, siteIds?: number[]) {
  const roles = await tx.role.findMany({
    select: {
      id: true,
      name: true,
      siteScope: true,
      permissions: { select: { key: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const sites = await tx.site.findMany({
    where: { id: siteIds ? { in: siteIds } : undefined },
    select: { id: true, name: true, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return { roles, sites };
}
