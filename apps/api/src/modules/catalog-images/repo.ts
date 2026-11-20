import type { Prisma, PrismaClient } from '@prisma/client';

import type { Tx } from '../access/repo.js';

export const imageSelection = {
  where: { pendingDelete: false },
  orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
} satisfies Prisma.CatalogItem$imagesArgs;

export function itemImages(tx: Tx, itemId: number) {
  return tx.catalogItemImage.findMany({
    ...imageSelection,
    where: { ...imageSelection.where, itemId },
  });
}
export function assertItem(tx: Tx, id: number) {
  return tx.catalogItem.findUniqueOrThrow({
    where: { id },
    select: { id: true },
  });
}
export function addImage(
  tx: Tx,
  data: Prisma.CatalogItemImageUncheckedCreateInput,
) {
  return tx.catalogItemImage.create({ data });
}
export function findImage(tx: Tx, itemId: number, id: number) {
  return tx.catalogItemImage.findUniqueOrThrow({ where: { id, itemId } });
}
export function updateImage(
  tx: Tx,
  id: number,
  data: Prisma.CatalogItemImageUpdateInput,
) {
  return tx.catalogItemImage.update({ where: { id }, data });
}
export async function finalizeDelete(db: PrismaClient, id: number) {
  await db.catalogItemImage.deleteMany({ where: { id, pendingDelete: true } });
}
