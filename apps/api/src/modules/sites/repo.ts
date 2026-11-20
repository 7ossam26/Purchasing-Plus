import type { siteFilters } from '@purchasing-plus/shared';

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
