import type { Tx } from '../access/repo.js';

export async function listUnits(
  tx: Tx,
  page: number,
  pageSize: number,
  active?: boolean,
) {
  const where = { isActive: active };
  const items = await tx.unit.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total: await tx.unit.count({ where }), page, pageSize };
}

export function findUnit(tx: Tx, id: number) {
  return tx.unit.findUniqueOrThrow({ where: { id } });
}

export function createUnit(tx: Tx, name: string) {
  return tx.unit.create({ data: { name } });
}

export function updateUnit(
  tx: Tx,
  id: number,
  data: { name?: string; isActive?: boolean },
) {
  return tx.unit.update({ where: { id }, data });
}

export function activeUnit(tx: Tx, id: number) {
  return tx.unit.findFirst({ where: { id, isActive: true } });
}

export function unitUsage(tx: Tx, id: number) {
  return tx.catalogItem.count({ where: { unitId: id } });
}

export function deleteUnit(tx: Tx, id: number) {
  return tx.unit.delete({ where: { id } });
}
