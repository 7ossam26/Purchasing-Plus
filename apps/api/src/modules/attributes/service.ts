import type {
  createAttribute,
  editAttribute,
  editAttributeOption,
} from '@purchasing-plus/shared';
import type { z } from 'zod';

import { missing } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';
import { refreshOptionSearchText } from '../catalog/repo.js';
import { findNode, pathIds } from '../catalog-tree/repo.js';

import * as repo from './repo.js';

export const { findAttribute: getAttribute, listAttributes } = repo;

export async function addAttribute(
  ctx: Context,
  input: z.infer<typeof createAttribute>,
) {
  const { name, type } = input;
  const row = await repo.createAttribute(ctx.tx, {
    name,
    type,
    clientVisible: input.clientVisible,
    unitLabel: type === 'NUMBER' ? input.unitLabel : null,
    options:
      type === 'SELECT'
        ? {
            create: input.options.map((label, sortOrder) => ({
              label,
              sortOrder,
            })),
          }
        : undefined,
  });
  await ctx.audit('attribute.create', 'AttributeDefinition', row.id, null, row);
  return row;
}

export async function updateAttribute(
  ctx: Context,
  id: number,
  input: z.infer<typeof editAttribute>,
) {
  const before = await repo.findAttribute(ctx.tx, id);
  const type = input.type ?? before.type;
  if (type !== 'NUMBER' && input.unitLabel != null)
    throw new AppError(
      422,
      'UNIT_LABEL_NOT_ALLOWED',
      'رمز الوحدة متاح للخصائص الرقمية فقط',
    );
  if (before.type !== type) {
    const { _count } = await repo.attributeReferences(ctx.tx, id);
    if (_count.values || _count.options)
      throw new AppError(
        409,
        'ATTRIBUTE_TYPE_IN_USE',
        'لا يمكن تغيير النوع مع وجود قيم أو خيارات',
      );
  }
  const after = await repo.updateAttribute(ctx.tx, id, {
    ...input,
    unitLabel: type === 'NUMBER' ? input.unitLabel : null,
  });
  await ctx.audit(
    input.isActive ? 'attribute.activate' : 'attribute.update',
    'AttributeDefinition',
    id,
    before,
    after,
  );
  return after;
}

export async function deactivateAttribute(ctx: Context, id: number) {
  const before = await repo.findAttribute(ctx.tx, id);
  const after = await repo.updateAttribute(ctx.tx, id, { isActive: false });
  await ctx.audit(
    'attribute.deactivate',
    'AttributeDefinition',
    id,
    before,
    after,
  );
  return after;
}

export async function removeAttribute(ctx: Context, id: number) {
  const { _count } = await repo.attributeReferences(ctx.tx, id);
  if (_count.values || _count.nodes)
    throw new AppError(
      409,
      'ATTRIBUTE_IN_USE',
      'الخاصية مستخدمة',
      'أوقف الخاصية بدلًا من حذفها.',
    );
  const before = await repo.deleteAttribute(ctx.tx, id);
  await ctx.audit('attribute.delete', 'AttributeDefinition', id, before);
  return { id };
}

async function selectOptions(tx: Tx, attributeId: number) {
  const attribute = await repo.findAttribute(tx, attributeId);
  if (attribute.type !== 'SELECT')
    throw new AppError(
      422,
      'OPTIONS_NOT_ALLOWED',
      'الخيارات متاحة لخصائص الاختيار فقط',
    );
  return attribute.options;
}

async function findOption(tx: Tx, attributeId: number, id: number) {
  const option = (await selectOptions(tx, attributeId)).find(
    (row) => row.id === id,
  );
  if (!option) throw missing();
  return option;
}

export async function addOption(
  ctx: Context,
  attributeId: number,
  label: string,
) {
  const options = await selectOptions(ctx.tx, attributeId);
  const sortOrder = (options.at(-1)?.sortOrder ?? -1) + 1;
  const row = await repo.createOption(ctx.tx, {
    attributeId,
    label,
    sortOrder,
  });
  await ctx.audit(
    'attributeOption.create',
    'AttributeOption',
    row.id,
    null,
    row,
  );
  return row;
}

export async function updateOption(
  ctx: Context,
  attributeId: number,
  id: number,
  input: z.infer<typeof editAttributeOption> | { isActive: false },
) {
  const before = await findOption(ctx.tx, attributeId, id);
  const after = await repo.updateOption(ctx.tx, attributeId, id, input);
  if (before.label !== after.label)
    await refreshOptionSearchText(ctx.tx, attributeId, id);
  const action =
    input.isActive === undefined
      ? 'update'
      : input.isActive
        ? 'activate'
        : 'deactivate';
  await ctx.audit(
    `attributeOption.${action}`,
    'AttributeOption',
    id,
    before,
    after,
  );
  return after;
}

export async function reorderOptions(
  ctx: Context,
  attributeId: number,
  ids: number[],
) {
  const before = (await selectOptions(ctx.tx, attributeId)).map(({ id }) => id);
  const optionIds = new Set(before);
  if (ids.length !== optionIds.size || ids.some((id) => !optionIds.has(id)))
    throw new AppError(
      422,
      'INVALID_OPTIONS',
      'أرسل جميع خيارات الخاصية بالترتيب المطلوب',
    );
  const after = [];
  for (const [sortOrder, id] of ids.entries()) {
    after.push(await repo.updateOption(ctx.tx, attributeId, id, { sortOrder }));
  }
  await ctx.audit(
    'attributeOption.reorder',
    'AttributeDefinition',
    attributeId,
    before,
    ids,
  );
  return after;
}

export async function removeOption(
  ctx: Context,
  attributeId: number,
  id: number,
) {
  await findOption(ctx.tx, attributeId, id);
  if (await repo.optionValueCount(ctx.tx, attributeId, id))
    throw new AppError(
      409,
      'OPTION_IN_USE',
      'الخيار مستخدم',
      'أوقف الخيار بدلًا من حذفه.',
    );
  const before = await repo.deleteOption(ctx.tx, attributeId, id);
  await ctx.audit('attributeOption.delete', 'AttributeOption', id, before);
  return { id };
}

export async function ownAttributes(tx: Tx, id: number) {
  await findNode(tx, id);
  return (await repo.nodeDefaults(tx, [id])).map(({ attribute }) => attribute);
}

export async function effectiveAttributes(tx: Tx, id: number) {
  const node = await findNode(tx, id);
  const ancestors = pathIds(node.path);
  const depthById = new Map(ancestors.map((nodeId, depth) => [nodeId, depth]));
  const assignments = await repo.nodeDefaults(tx, ancestors);
  const effective = new Map<
    number,
    (typeof assignments)[number]['attribute']
  >();
  assignments.sort(
    (a, b) => depthById.get(a.nodeId)! - depthById.get(b.nodeId)!,
  );
  for (const { attribute } of assignments) {
    if (attribute.isActive && !effective.has(attribute.id))
      effective.set(attribute.id, {
        ...attribute,
        options: attribute.options.filter((option) => option.isActive),
      });
  }
  return [...effective.values()];
}

export async function setDefaults(ctx: Context, id: number, ids: number[]) {
  const before = await ownAttributes(ctx.tx, id);
  const existing = new Set(before.map((attribute) => attribute.id));
  const definitions = await repo.findAttributes(ctx.tx, ids);
  if (
    definitions.length !== ids.length ||
    definitions.some(
      (attribute) => !attribute.isActive && !existing.has(attribute.id),
    )
  )
    throw new AppError(422, 'INVALID_ATTRIBUTES', 'اختر خصائص موجودة ونشطة');
  const after = await repo.replaceDefaults(ctx.tx, id, ids);
  await ctx.audit(
    'nodeAttribute.set',
    'CatalogNode',
    id,
    before.map((attribute) => attribute.id),
    ids,
  );
  return after.map(({ attribute }) => attribute);
}
