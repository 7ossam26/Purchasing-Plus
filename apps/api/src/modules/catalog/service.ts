import {
  catalogAttributeNumber,
  type browseItemFilters,
  type catalogSearchFilters,
  type createCatalogItem,
  type editCatalogItemInEditor,
} from '@purchasing-plus/shared';
import type { z } from 'zod';

import {
  allowed,
  forbidden,
  missing,
  type Viewer,
} from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';
import { findAttributes } from '../attributes/repo.js';
import { effectiveAttributes, listAttributes } from '../attributes/service.js';
import { breadcrumbs, findNode, pathIds } from '../catalog-tree/repo.js';
import { activeNode, nodeWithBreadcrumb } from '../catalog-tree/service.js';
import { activeUnit } from '../units/repo.js';
import { listUnits } from '../units/service.js';

import * as repo from './repo.js';

type NewItem = z.infer<typeof createCatalogItem>;
type ItemEdit = z.infer<typeof editCatalogItemInEditor>;
type Breadcrumb = ReturnType<Awaited<ReturnType<typeof breadcrumbs>>>;

function toDto(row: repo.ItemRecord, nodePath: Breadcrumb) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    nodeId: row.nodeId,
    nodePath,
    unitId: row.unitId,
    unit: row.unit,
    attributeValues: row.attributeValues.map((value) => ({
      attributeId: value.attributeId,
      attribute: value.attribute,
      value: repo.itemValue(value),
      option: value.option,
    })),
  };
}

async function toDtos(tx: Tx, rows: repo.ItemRecord[]) {
  const crumb = await breadcrumbs(
    tx,
    rows.map((row) => row.node.path),
  );
  return rows.map((row) => toDto(row, crumb(row.node.path)));
}

export function assertInactiveAccess(viewer: Viewer, includeInactive: boolean) {
  if (includeInactive && !allowed(viewer, 'masterData.view')) throw forbidden();
}

export async function editorChoices(
  { tx, viewer }: Context,
  nodeId: number,
  page: number,
  pageSize: number,
) {
  if (!allowed(viewer, 'catalog.create') && !allowed(viewer, 'catalog.edit'))
    throw forbidden();
  if (page > 1) await findNode(tx, nodeId);
  const defaults = page === 1 ? await effectiveAttributes(tx, nodeId) : [];
  const attributes = await listAttributes(tx, page, pageSize, true);
  const units = await listUnits(tx, page, pageSize, true);
  return { attributes, units, defaults };
}

export async function getItem(
  { tx, viewer }: Context,
  id: number,
  includeInactive: boolean,
) {
  assertInactiveAccess(viewer, includeInactive);
  const [item] = await toDtos(tx, [await repo.findItem(tx, id)]);
  if (
    !includeInactive &&
    (!item!.isActive || item!.nodePath.some((node) => !node.isActive))
  )
    throw missing();
  return {
    ...item!,
    ...(allowed(viewer, 'requests.viewPrices') ? { latestPrice: null } : {}),
  };
}

export async function listItems(
  { tx, viewer }: Context,
  id: number,
  {
    page,
    pageSize,
    includeInactive,
    active,
  }: z.infer<typeof browseItemFilters>,
) {
  assertInactiveAccess(viewer, includeInactive);
  await nodeWithBreadcrumb(tx, id, !includeInactive);
  const result = await repo.listItems(
    tx,
    id,
    page,
    pageSize,
    includeInactive,
    active,
  );
  return { ...result, items: await toDtos(tx, result.items) };
}

export async function search(
  { tx, viewer }: Context,
  input: z.infer<typeof catalogSearchFilters>,
) {
  assertInactiveAccess(viewer, input.includeInactive);
  const category = await nodeWithBreadcrumb(
    tx,
    input.categoryId,
    !input.includeInactive,
  );
  if (category.parentId !== null)
    throw new AppError(422, 'CATEGORY_REQUIRED', 'اختر فئة للبحث داخلها');
  const result = await repo.searchItems(
    tx,
    category.path,
    input.q,
    input.page,
    input.pageSize,
    input.includeInactive,
    input.active,
  );
  return { ...result, items: await toDtos(tx, result.items) };
}

async function validateUnit(tx: Tx, id: number) {
  if (!(await activeUnit(tx, id)))
    throw new AppError(422, 'INVALID_UNIT', 'اختر وحدة موجودة ونشطة');
}

async function validateValues(
  tx: Tx,
  values: NewItem['attributeValues'],
  previous?: repo.ItemRecord,
) {
  const definitions = await findAttributes(
    tx,
    values.map(({ attributeId }) => attributeId),
  );
  const byId = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );
  const existing = new Map(
    previous?.attributeValues.map((value) => [
      value.attributeId,
      repo.itemValue(value),
    ]),
  );
  return values.map(({ attributeId, value }): repo.ItemValue => {
    const definition = byId.get(attributeId);
    const unchanged = existing.get(attributeId) === value;
    if (!definition || (!definition.isActive && !unchanged))
      throw new AppError(422, 'INVALID_ATTRIBUTE', 'اختر خاصية موجودة ونشطة');
    if (definition.type === 'SELECT') {
      const option = definition.options.find(
        (candidate) => candidate.id === value,
      );
      if (!option || (!option.isActive && !unchanged))
        throw new AppError(
          422,
          'INVALID_OPTION',
          'اختر خيارًا نشطًا من خيارات الخاصية',
        );
      return { attributeId, optionId: option.id };
    }
    if (definition.type === 'NUMBER') {
      const number = catalogAttributeNumber.safeParse(value);
      if (!number.success)
        throw new AppError(
          422,
          'INVALID_ATTRIBUTE_NUMBER',
          'اكتب قيمة رقمية للخاصية',
        );
      return { attributeId, numberValue: number.data };
    }
    if (typeof value !== 'string')
      throw new AppError(
        422,
        'INVALID_ATTRIBUTE_TEXT',
        'اكتب قيمة نصية للخاصية',
      );
    return { attributeId, textValue: value };
  });
}

export async function addItem(
  ctx: Context,
  { attributeValues, ...input }: NewItem,
) {
  if (input.isActive === false && !allowed(ctx.viewer, 'catalog.delete'))
    throw forbidden();
  const node = await activeNode(ctx.tx, input.nodeId);
  const categoryId = pathIds(node.path)[0]!;
  const category = await nodeWithBreadcrumb(ctx.tx, categoryId);
  await validateUnit(ctx.tx, input.unitId);
  const values = await validateValues(ctx.tx, attributeValues);
  const seq = await repo.nextCodeNumber(ctx.tx, categoryId);
  const code = `${category.codePrefix}-${String(seq).padStart(4, '0')}`;
  const row = await repo.createItem(ctx.tx, { ...input, code }, values);
  const after = toDto(row, node.breadcrumb);
  await ctx.audit('catalogItem.create', 'CatalogItem', row.id, null, after);
  return after;
}

async function auditChange(
  ctx: Context,
  action: string,
  before: repo.ItemRecord,
  after: repo.ItemRecord,
) {
  const [oldDto, newDto] = await toDtos(ctx.tx, [before, after]);
  await ctx.audit(
    `catalogItem.${action}`,
    'CatalogItem',
    after.id,
    oldDto,
    newDto,
  );
  return newDto!;
}

export async function editItem(
  ctx: Context,
  id: number,
  { attributeValues, ...input }: ItemEdit,
) {
  if (input.isActive === false && !allowed(ctx.viewer, 'catalog.delete'))
    throw forbidden();
  const before = await repo.findItem(ctx.tx, id);
  if (input.nodeId !== undefined && input.nodeId !== before.nodeId)
    await validateMove(ctx.tx, before.node.path, input.nodeId);
  if (input.unitId !== undefined && input.unitId !== before.unitId)
    await validateUnit(ctx.tx, input.unitId);
  const values =
    attributeValues && (await validateValues(ctx.tx, attributeValues, before));
  const after = await repo.updateItem(ctx.tx, id, input, values);
  return auditChange(
    ctx,
    input.isActive !== undefined && input.isActive !== before.isActive
      ? input.isActive
        ? 'activate'
        : 'deactivate'
      : 'update',
    before,
    after,
  );
}

export async function moveItem(ctx: Context, id: number, nodeId: number) {
  const before = await repo.findItem(ctx.tx, id);
  await validateMove(ctx.tx, before.node.path, nodeId);
  const after = await repo.updateItem(ctx.tx, id, { nodeId });
  return auditChange(ctx, 'move', before, after);
}

async function validateMove(tx: Tx, sourcePath: string, nodeId: number) {
  const target = await activeNode(tx, nodeId);
  if (pathIds(sourcePath)[0] !== pathIds(target.path)[0])
    throw new AppError(
      409,
      'CROSS_CATEGORY_MOVE',
      'النقل متاح داخل الفئة نفسها فقط',
    );
}

export async function deactivateItem(ctx: Context, id: number) {
  const before = await repo.findItem(ctx.tx, id);
  const after = await repo.updateItem(ctx.tx, id, { isActive: false });
  return auditChange(ctx, 'deactivate', before, after);
}
