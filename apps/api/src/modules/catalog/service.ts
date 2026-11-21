import {
  catalogAttributeNumber,
  type browseItemFilters,
  type catalogSearchFilters,
  type createCatalogItem,
  type editCatalogItemInEditor,
} from '@purchasing-plus/shared';
import type { z } from 'zod';

import type { StorageDriver } from '../../lib/storage.js';
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
import { imageUrls } from '../catalog-images/service.js';
import { breadcrumbs, findNode, pathIds } from '../catalog-tree/repo.js';
import { activeNode, nodeWithBreadcrumb } from '../catalog-tree/service.js';
import { activeUnit } from '../units/repo.js';
import { listUnits } from '../units/service.js';

import { toPriceDto } from './prices.js';
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
    categoryIcon: nodePath[0]?.iconKey ?? null,
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

async function attachImages<T>(
  dto: T,
  row: repo.ItemRecord,
  storage: StorageDriver,
) {
  return {
    ...dto,
    images: await Promise.all(
      row.images.map((image) => imageUrls(image, storage)),
    ),
  };
}

async function toDtos(tx: Tx, rows: repo.ItemRecord[]) {
  const crumb = await breadcrumbs(
    tx,
    rows.map((row) => row.node.path),
  );
  return rows.map((row) => toDto(row, crumb(row.node.path)));
}

export async function itemsByIds(ctx: Context, ids: number[]) {
  const records = await repo.findItemsByIds(ctx.tx, ids);
  const dtos = await toDtos(ctx.tx, records);
  const byId = new Map(
    records.map((row, index) => [row.id, { row, dto: dtos[index]! }]),
  );
  return Promise.all(
    ids.flatMap((id) => {
      const entry = byId.get(id);
      return entry
        ? [attachImages(entry.dto, entry.row, ctx.req.app.locals.storage)]
        : [];
    }),
  );
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
  { tx, viewer, req }: Context,
  id: number,
  includeInactive: boolean,
) {
  assertInactiveAccess(viewer, includeInactive);
  const row = await repo.findItem(tx, id);
  const [item] = await toDtos(tx, [row]);
  if (
    !includeInactive &&
    (!item!.isActive || item!.nodePath.some((node) => !node.isActive))
  )
    throw missing();
  return {
    ...(await attachImages(item!, row, req.app.locals.storage)),
    ...(allowed(viewer, 'requests.viewPrices')
      ? {
          latestPrice: toPriceDto(
            (await repo.latestPrices(tx, [id])).get(id) ?? null,
            viewer,
          ),
        }
      : {}),
  };
}

export async function listItems(
  { tx, viewer, req }: Context,
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
  const items = await toDtos(tx, result.items);
  return {
    ...result,
    items: await Promise.all(
      result.items.map((row, index) =>
        attachImages(items[index]!, row, req.app.locals.storage),
      ),
    ),
  };
}

export async function search(
  { tx, viewer, req }: Context,
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
  const items = await toDtos(tx, result.items);
  return {
    ...result,
    items: await Promise.all(
      result.items.map((row, index) =>
        attachImages(items[index]!, row, req.app.locals.storage),
      ),
    ),
  };
}

async function validateUnit(tx: Tx, id: number) {
  assertAvailableUnit(await activeUnit(tx, id));
}

export function assertAvailableUnit(unit: { isActive: boolean } | null) {
  if (!unit?.isActive)
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
    return validateItemValue(
      byId.get(attributeId),
      { attributeId, value },
      existing.get(attributeId),
    );
  });
}

export function validateItemValue(
  definition: Awaited<ReturnType<typeof findAttributes>>[number] | undefined,
  { attributeId, value }: NewItem['attributeValues'][number],
  previous?: string | number,
): repo.ItemValue {
  const unchanged = previous === value;
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
    throw new AppError(422, 'INVALID_ATTRIBUTE_TEXT', 'اكتب قيمة نصية للخاصية');
  return { attributeId, textValue: value };
}

export async function addItem(
  ctx: Context,
  { attributeValues, ...input }: NewItem,
  deactivatePermission: 'catalog.delete' | 'data.import' = 'catalog.delete',
) {
  if (input.isActive === false && !allowed(ctx.viewer, deactivatePermission))
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
  return attachImages(after, row, ctx.req.app.locals.storage);
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
  return attachImages(newDto!, after, ctx.req.app.locals.storage);
}

export async function editItem(
  ctx: Context,
  id: number,
  { attributeValues, ...input }: ItemEdit,
  deactivatePermission: 'catalog.delete' | 'data.import' = 'catalog.delete',
) {
  if (input.isActive === false && !allowed(ctx.viewer, deactivatePermission))
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
  assertSameCategory(sourcePath, target.path);
}

export function assertSameCategory(sourcePath: string, targetPath: string) {
  if (pathIds(sourcePath)[0] !== pathIds(targetPath)[0])
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
