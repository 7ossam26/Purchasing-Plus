import { Prisma } from '@prisma/client';

import type { Tx } from '../access/repo.js';

export const units = (tx: Tx) => tx.unit.findMany({ orderBy: { id: 'asc' } });
export const sites = (tx: Tx, siteIds?: number[]) =>
  tx.site.findMany({
    where: siteIds ? { id: { in: siteIds } } : undefined,
    orderBy: { id: 'asc' },
  });
export const nodes = (tx: Tx) =>
  tx.catalogNode.findMany({
    orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });
export const attributes = (tx: Tx) =>
  tx.attributeDefinition.findMany({
    include: { options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] } },
    orderBy: { id: 'asc' },
  });
export const items = (tx: Tx) =>
  tx.catalogItem.findMany({
    orderBy: { id: 'asc' },
    include: {
      unit: { select: { name: true } },
      attributeValues: {
        orderBy: { attributeId: 'asc' },
        include: {
          attribute: { select: { name: true } },
          option: { select: { label: true } },
        },
      },
    },
  });
export const itemCodes = (tx: Tx) =>
  tx.catalogItem.findMany({
    select: { code: true, id: true },
  });
export const suppliers = (tx: Tx) =>
  tx.supplier.findMany({
    include: {
      categories: {
        include: { category: { select: { name: true } } },
        orderBy: { categoryId: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });

export const startPreview = (tx: Tx) =>
  tx.$executeRaw(Prisma.sql`SAVEPOINT data_preview`);
export const rewindPreview = (tx: Tx) =>
  tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT data_preview`);
export const startRow = (tx: Tx) =>
  tx.$executeRaw(Prisma.sql`SAVEPOINT data_row`);
export const rewindRow = (tx: Tx) =>
  tx.$executeRaw(Prisma.sql`ROLLBACK TO SAVEPOINT data_row`);
export const finishRow = (tx: Tx) =>
  tx.$executeRaw(Prisma.sql`RELEASE SAVEPOINT data_row`);
