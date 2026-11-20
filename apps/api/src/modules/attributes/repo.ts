import type { Prisma } from '@prisma/client';

import type { Tx } from '../access/repo.js';

const withOptions = {
  options: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.AttributeDefinitionInclude;

export function findAttribute(tx: Tx, id: number) {
  return tx.attributeDefinition.findUniqueOrThrow({
    where: { id },
    include: withOptions,
  });
}

export function findAttributes(tx: Tx, ids: number[]) {
  return tx.attributeDefinition.findMany({
    where: { id: { in: ids } },
    include: withOptions,
  });
}

export async function listAttributes(
  tx: Tx,
  page: number,
  pageSize: number,
  active?: boolean,
) {
  const where = { isActive: active };
  const items = await tx.attributeDefinition.findMany({
    where,
    include: withOptions,
    orderBy: { name: 'asc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  return {
    items,
    total: await tx.attributeDefinition.count({ where }),
    page,
    pageSize,
  };
}

export function createAttribute(
  tx: Tx,
  data: Prisma.AttributeDefinitionCreateInput,
) {
  return tx.attributeDefinition.create({ data, include: withOptions });
}

export function updateAttribute(
  tx: Tx,
  id: number,
  data: Prisma.AttributeDefinitionUpdateInput,
) {
  return tx.attributeDefinition.update({
    where: { id },
    data,
    include: withOptions,
  });
}

export function attributeReferences(tx: Tx, id: number) {
  return tx.attributeDefinition.findUniqueOrThrow({
    where: { id },
    select: {
      _count: { select: { values: true, nodes: true, options: true } },
    },
  });
}

export function deleteAttribute(tx: Tx, id: number) {
  return tx.attributeDefinition.delete({ where: { id }, include: withOptions });
}

export function optionValueCount(
  tx: Tx,
  attributeId: number,
  optionId: number,
) {
  return tx.catalogItemAttributeValue.count({
    where: { attributeId, optionId },
  });
}

export function createOption(
  tx: Tx,
  data: Prisma.AttributeOptionUncheckedCreateInput,
) {
  return tx.attributeOption.create({ data });
}

export function updateOption(
  tx: Tx,
  attributeId: number,
  id: number,
  data: Prisma.AttributeOptionUpdateInput,
) {
  return tx.attributeOption.update({
    where: { attributeId_id: { attributeId, id } },
    data,
  });
}

export function deleteOption(tx: Tx, attributeId: number, id: number) {
  return tx.attributeOption.delete({
    where: { attributeId_id: { attributeId, id } },
  });
}

export function nodeDefaults(tx: Tx, nodeIds: number[]) {
  return tx.nodeAttribute.findMany({
    where: { nodeId: { in: nodeIds } },
    orderBy: [{ sortOrder: 'asc' }, { attributeId: 'asc' }],
    include: { attribute: { include: withOptions } },
  });
}

export async function replaceDefaults(
  tx: Tx,
  nodeId: number,
  attributeIds: number[],
) {
  await tx.nodeAttribute.deleteMany({ where: { nodeId } });
  await tx.nodeAttribute.createMany({
    data: attributeIds.map((attributeId, sortOrder) => ({
      nodeId,
      attributeId,
      sortOrder,
    })),
  });
  return nodeDefaults(tx, [nodeId]);
}
