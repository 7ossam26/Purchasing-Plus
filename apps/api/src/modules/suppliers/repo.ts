import type { Prisma } from '@prisma/client';

import type { Tx } from '../access/repo.js';

const withCategories = {
  categories: { select: { categoryId: true }, orderBy: { categoryId: 'asc' } },
} satisfies Prisma.SupplierInclude;

export type SupplierRecord = Prisma.SupplierGetPayload<{
  include: typeof withCategories;
}>;

export async function listSuppliers(
  tx: Tx,
  page: number,
  pageSize: number,
  active?: boolean,
  categoryId?: number,
) {
  const where = {
    isActive: categoryId ? true : active,
    categories: categoryId ? { some: { categoryId } } : undefined,
  };
  const items = await tx.supplier.findMany({
    where,
    include: withCategories,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return { items, total: await tx.supplier.count({ where }), page, pageSize };
}

export function findSupplier(tx: Tx, id: number) {
  return tx.supplier.findUniqueOrThrow({
    where: { id },
    include: withCategories,
  });
}

export function findByPhone(tx: Tx, whatsappNumber: string) {
  return tx.supplier.findUnique({
    where: { whatsappNumber },
    select: { id: true },
  });
}

export function topLevelCount(tx: Tx, ids: number[]) {
  return tx.catalogNode.count({ where: { id: { in: ids }, parentId: null } });
}

export function createSupplier(
  tx: Tx,
  input: Omit<Prisma.SupplierCreateInput, 'categories'>,
  categoryIds: number[],
) {
  return tx.supplier.create({
    data: {
      ...input,
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
    },
    include: withCategories,
  });
}

export async function updateSupplier(
  tx: Tx,
  id: number,
  data: Prisma.SupplierUpdateInput,
  categoryIds?: number[],
) {
  if (categoryIds) {
    await tx.supplierCategory.deleteMany({ where: { supplierId: id } });
    await tx.supplierCategory.createMany({
      data: categoryIds.map((categoryId) => ({ supplierId: id, categoryId })),
    });
  }
  return tx.supplier.update({ where: { id }, data, include: withCategories });
}

export function supplierReferences(tx: Tx, id: number) {
  return tx.supplier.findUniqueOrThrow({
    where: { id },
    select: {
      _count: {
        select: {
          prices: true,
          requestItems: true,
          rfqBatches: true,
          roundLines: true,
        },
      },
    },
  });
}

export function deleteSupplier(tx: Tx, id: number) {
  return tx.supplier.delete({ where: { id }, include: withCategories });
}
