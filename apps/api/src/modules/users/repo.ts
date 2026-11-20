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
    select: userSelect,
    orderBy: { id: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total: await tx.user.count({ where }) };
}
