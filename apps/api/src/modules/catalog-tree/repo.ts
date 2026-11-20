import { Prisma, type CatalogNode } from '@prisma/client';

import type { Tx } from '../access/repo.js';

export const siblingOrder = [{ sortOrder: 'asc' }, { id: 'asc' }] as const;

export function pathIds(path: string) {
  return path.slice(1, -1).split('/').map(Number);
}

export function visiblePath(path: Prisma.Sql) {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "CatalogNode" a
    WHERE a.id = ANY(string_to_array(trim(both '/' from ${path}), '/')::int[])
      AND NOT a."isActive"
  )`;
}

export async function breadcrumbs(tx: Tx, paths: string[]) {
  const ids = [...new Set(paths.flatMap(pathIds))];
  const rows = await tx.catalogNode.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, isActive: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (path: string) => pathIds(path).map((id) => byId.get(id)!);
}

export function findNode(tx: Tx, id: number) {
  return tx.catalogNode.findUniqueOrThrow({ where: { id } });
}

export function siblings(tx: Tx, parentId: number | null) {
  return tx.catalogNode.findMany({
    where: { parentId },
    orderBy: [...siblingOrder],
  });
}

export function listFolders(
  tx: Tx,
  parent: CatalogNode | null,
  active: boolean | undefined,
  picker: boolean,
) {
  const parentFilter = parent
    ? Prisma.sql`c."parentId" = ${parent.id}`
    : Prisma.sql`c."parentId" IS NULL`;
  const subtree = parent
    ? Prisma.sql`n.path LIKE ${parent.path + '%'}`
    : Prisma.sql`TRUE`;
  const childPosition = (parent?.depth ?? -1) + 3;
  const status =
    active === undefined
      ? Prisma.empty
      : Prisma.sql`AND c."isActive" = ${active}`;
  const groups = picker ? Prisma.sql`AND g."isActive"` : Prisma.empty;
  const items = picker
    ? Prisma.sql`AND i."isActive" AND ${visiblePath(Prisma.sql`n.path`)}`
    : Prisma.empty;
  return tx.$queryRaw<
    (CatalogNode & { childGroupCount: number; subtreeItemCount: number })[]
  >(Prisma.sql`
    WITH item_counts AS (
      SELECT nullif(split_part(n.path, '/', ${childPosition}::int), '')::int AS folder_id,
             count(*)::int AS total
      FROM "CatalogNode" n JOIN "CatalogItem" i ON n.id = i."nodeId"
      WHERE ${subtree} ${items}
      GROUP BY 1
    )
    SELECT c.*,
      (SELECT count(*)::int FROM "CatalogNode" g WHERE g."parentId" = c.id ${groups}) AS "childGroupCount",
      coalesce(item_counts.total, 0) AS "subtreeItemCount"
    FROM "CatalogNode" c
    LEFT JOIN item_counts ON item_counts.folder_id = c.id
    WHERE ${parentFilter} ${status}
    ORDER BY c."sortOrder", c.id
  `);
}

export async function nextSiblingOrder(tx: Tx, parentId: number | null) {
  const { _max } = await tx.catalogNode.aggregate({
    where: { parentId },
    _max: { sortOrder: true },
  });
  return (_max.sortOrder ?? -1) + 1;
}

export async function insertNode(
  tx: Tx,
  data: { name: string; codePrefix?: string; iconKey?: string },
  parent: CatalogNode | null,
  sortOrder: number,
) {
  const prefix = parent?.path ?? '/';
  const node = await tx.catalogNode.create({
    data: {
      ...data,
      depth: parent ? parent.depth + 1 : 0,
      parentId: parent?.id,
      sortOrder,
      path: prefix,
    },
  });
  return updateNode(tx, node.id, { path: `${prefix}${node.id}/` });
}

export function updateNode(
  tx: Tx,
  id: number,
  data: Prisma.CatalogNodeUncheckedUpdateInput,
) {
  return tx.catalogNode.update({ where: { id }, data });
}

export async function moveSubtree(
  tx: Tx,
  node: CatalogNode,
  parent: CatalogNode,
  sortOrder: number,
) {
  const path = `${parent.path}${node.id}/`;
  const shift = parent.depth + 1 - node.depth;
  await tx.$executeRaw(Prisma.sql`
    UPDATE "CatalogNode"
    SET path = ${path} || substring(path FROM ${node.path.length + 1}::int),
        depth = depth + ${shift}::int,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE path LIKE ${node.path + '%'}
  `);
  return updateNode(tx, node.id, { parentId: parent.id, sortOrder });
}

export function subtreeHasItems(tx: Tx, path: string) {
  return tx.catalogItem.findFirst({
    where: { node: { path: { startsWith: path } } },
    select: { id: true },
  });
}

export function nodeReferences(tx: Tx, id: number) {
  return tx.catalogNode.findUniqueOrThrow({
    where: { id },
    select: {
      _count: { select: { children: true, items: true, suppliers: true } },
    },
  });
}

export function deleteNode(tx: Tx, id: number) {
  return tx.catalogNode.delete({ where: { id } });
}

export async function claimCatalogSeed(tx: Tx) {
  const result = await tx.settings.updateMany({
    where: { id: 1, catalogSeededAt: null },
    data: { catalogSeededAt: new Date() },
  });
  return result.count > 0;
}
