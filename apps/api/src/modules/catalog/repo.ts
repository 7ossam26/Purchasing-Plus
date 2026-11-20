import { Prisma } from '@prisma/client';
import { normalizeArabic } from '@purchasing-plus/shared';

import type { Tx } from '../access/repo.js';
import { visiblePath } from '../catalog-tree/repo.js';

const itemInclude = {
  node: { select: { path: true } },
  unit: { select: { id: true, name: true, isActive: true } },
  attributeValues: {
    orderBy: { attributeId: 'asc' },
    include: {
      attribute: {
        select: {
          id: true,
          name: true,
          type: true,
          unitLabel: true,
          isActive: true,
        },
      },
      option: { select: { id: true, label: true, isActive: true } },
    },
  },
} satisfies Prisma.CatalogItemInclude;

export type ItemRecord = Prisma.CatalogItemGetPayload<{
  include: typeof itemInclude;
}>;
export type ItemValue =
  Prisma.CatalogItemAttributeValueUncheckedCreateWithoutItemInput;

export function itemValue(record: ItemRecord['attributeValues'][number]) {
  return record.optionId ?? record.numberValue?.toFixed() ?? record.textValue!;
}

export function findItem(tx: Tx, id: number) {
  return tx.catalogItem.findUniqueOrThrow({
    where: { id },
    include: itemInclude,
  });
}

export async function nextCodeNumber(tx: Tx, categoryId: number) {
  const [sequence] = await tx.$queryRaw<{ lastValue: number }[]>(Prisma.sql`
    INSERT INTO "CodeSequence" ("categoryId", "lastValue", "updatedAt")
    VALUES (${categoryId}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("categoryId") DO UPDATE
    SET "lastValue" = "CodeSequence"."lastValue" + 1, "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "lastValue"
  `);
  return sequence!.lastValue;
}

export async function createItem(
  tx: Tx,
  data: Omit<Prisma.CatalogItemUncheckedCreateInput, 'searchText'>,
  values: ItemValue[],
) {
  const row = await tx.catalogItem.create({
    data: { ...data, searchText: '', attributeValues: { create: values } },
    include: itemInclude,
  });
  return setSearchText(tx, row);
}

export async function updateItem(
  tx: Tx,
  id: number,
  data: Prisma.CatalogItemUncheckedUpdateInput,
  values?: ItemValue[],
) {
  if (values) {
    await tx.catalogItemAttributeValue.deleteMany({ where: { itemId: id } });
    await tx.catalogItemAttributeValue.createMany({
      data: values.map((value) => ({ ...value, itemId: id })),
    });
  }
  const row = await tx.catalogItem.update({
    where: { id },
    data,
    include: itemInclude,
  });
  return values || data.name !== undefined ? setSearchText(tx, row) : row;
}

function searchText(row: ItemRecord) {
  return normalizeArabic(
    [
      row.name,
      row.code,
      ...row.attributeValues.map(
        (record) => record.option?.label ?? itemValue(record),
      ),
    ].join(' '),
  );
}

async function setSearchText(tx: Tx, row: ItemRecord) {
  const text = searchText(row);
  if (text === row.searchText) return row;
  const saved = await tx.catalogItem.update({
    where: { id: row.id },
    data: { searchText: text },
    select: { updatedAt: true },
  });
  return { ...row, ...saved, searchText: text };
}

export async function refreshOptionSearchText(
  tx: Tx,
  attributeId: number,
  optionId: number,
) {
  const rows = await tx.catalogItem.findMany({
    where: { attributeValues: { some: { attributeId, optionId } } },
    include: itemInclude,
  });
  for (const row of rows) await setSearchText(tx, row);
}

export async function listItems(
  tx: Tx,
  nodeId: number,
  page: number,
  pageSize: number,
  includeInactive: boolean,
) {
  const where = { nodeId, isActive: includeInactive ? undefined : true };
  const items = await tx.catalogItem.findMany({
    where,
    include: itemInclude,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    items,
    total: await tx.catalogItem.count({ where }),
    page,
    pageSize,
  };
}

export async function searchItems(
  tx: Tx,
  path: string,
  q: string,
  page: number,
  pageSize: number,
  includeInactive: boolean,
) {
  // LIKE can use the trigram index. Escape wildcard characters so user input stays literal.
  const pattern = '%' + q.replace(/[!%_]/g, '!$&') + '%';
  const visible = includeInactive
    ? Prisma.empty
    : Prisma.sql`AND i."isActive" AND ${visiblePath(Prisma.sql`n.path`)}`;
  const matches = Prisma.sql`
    FROM "CatalogItem" i
    JOIN "CatalogNode" n ON n.id = i."nodeId"
    WHERE n.path LIKE ${path + '%'} AND i."searchText" ILIKE ${pattern} ESCAPE '!'
      ${visible}
  `;
  const ids = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`
    SELECT i.id ${matches}
    ORDER BY i.name, i.id
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const [count] = await tx.$queryRaw<{ total: number }[]>(
    Prisma.sql`SELECT count(*)::int AS total ${matches}`,
  );
  const items = await tx.catalogItem.findMany({
    where: { id: { in: ids.map(({ id }) => id) } },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    include: itemInclude,
  });
  return { items, total: count!.total, page, pageSize };
}
