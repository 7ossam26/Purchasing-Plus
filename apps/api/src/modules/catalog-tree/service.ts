import {
  ar,
  type createCategory,
  type createGroup,
  type editCatalogNode,
  type reorderCatalogNodes,
} from '@purchasing-plus/shared';
import type { z } from 'zod';

import { missing } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';

import * as repo from './repo.js';

export async function nodeWithBreadcrumb(tx: Tx, id: number, picker = false) {
  const node = await repo.findNode(tx, id);
  const breadcrumb = (await repo.breadcrumbs(tx, [node.path]))(node.path);
  if (picker && breadcrumb.some((crumb) => !crumb.isActive)) throw missing();
  return { ...node, breadcrumb };
}

export async function listFolders(
  ctx: Context,
  parentId: number | null,
  active?: boolean,
  picker = false,
) {
  const { tx } = ctx;
  const parent =
    parentId === null ? null : await nodeWithBreadcrumb(tx, parentId, picker);
  const storage: import('../../lib/storage.js').StorageDriver =
    ctx.req.app.locals.storage;
  const folders = await repo.listFolders(
    tx,
    parent,
    picker ? true : active,
    picker,
  );
  return Promise.all(
    folders.map(async ({ coverKeys, ...folder }) => ({
      ...folder,
      coverThumbs: await Promise.all(coverKeys.map((key) => storage.url(key))),
    })),
  );
}

export async function activeNode(tx: Tx, id: number) {
  const node = await nodeWithBreadcrumb(tx, id);
  if (node.breadcrumb.some((crumb) => !crumb.isActive))
    throw new AppError(
      422,
      'INACTIVE_NODE',
      'المجلد موقوف',
      'اختر مجلدًا نشطًا.',
    );
  return node;
}

export async function createCategoryNode(
  ctx: Context,
  input: z.infer<typeof createCategory>,
) {
  const row = await repo.insertNode(
    ctx.tx,
    input,
    null,
    await repo.nextSiblingOrder(ctx.tx, null),
  );
  await ctx.audit('catalogNode.create', 'CatalogNode', row.id, null, row);
  return row;
}

export async function createGroupNode(
  ctx: Context,
  { name, parentId }: z.infer<typeof createGroup>,
) {
  const parent = await activeNode(ctx.tx, parentId);
  const row = await repo.insertNode(
    ctx.tx,
    { name },
    parent,
    await repo.nextSiblingOrder(ctx.tx, parentId),
  );
  await ctx.audit('catalogNode.create', 'CatalogNode', row.id, null, row);
  return row;
}

export async function editNode(
  ctx: Context,
  id: number,
  input: z.infer<typeof editCatalogNode>,
) {
  const before = await repo.findNode(ctx.tx, id);
  if (before.parentId !== null && (input.codePrefix || input.iconKey))
    throw new AppError(
      422,
      'CATEGORY_FIELDS',
      'الكود والأيقونة متاحان للفئات فقط',
    );
  if (
    input.codePrefix &&
    before.codePrefix !== input.codePrefix &&
    (await repo.subtreeHasItems(ctx.tx, before.path))
  )
    throw new AppError(
      409,
      'PREFIX_IN_USE',
      'لا يمكن تغيير بادئة فئة تحتوي على أصناف',
    );
  const after = await repo.updateNode(ctx.tx, id, input);
  await ctx.audit(
    input.isActive ? 'catalogNode.activate' : 'catalogNode.update',
    'CatalogNode',
    id,
    before,
    after,
  );
  return after;
}

export async function reorderNodes(
  ctx: Context,
  { parentId, ids }: z.infer<typeof reorderCatalogNodes>,
) {
  if (parentId !== null) await repo.findNode(ctx.tx, parentId);
  const before = await repo.siblings(ctx.tx, parentId);
  const siblings = new Set(before.map(({ id }) => id));
  if (ids.length !== siblings.size || ids.some((id) => !siblings.has(id)))
    throw new AppError(
      422,
      'INVALID_SIBLINGS',
      'أرسل جميع المجلدات من المستوى نفسه بالترتيب المطلوب',
    );
  const after = [];
  for (const [sortOrder, id] of ids.entries()) {
    after.push(await repo.updateNode(ctx.tx, id, { sortOrder }));
  }
  await ctx.audit(
    'catalogNode.reorder',
    'CatalogNode',
    parentId,
    before.map(({ id }) => id),
    ids,
  );
  return after;
}

export async function moveNode(ctx: Context, id: number, parentId: number) {
  const before = await repo.findNode(ctx.tx, id);
  const parent = await activeNode(ctx.tx, parentId);
  if (before.parentId === null)
    throw new AppError(409, 'CATEGORY_MOVE', 'لا يمكن نقل الفئة إلى مجلد آخر');
  if (repo.pathIds(before.path)[0] !== repo.pathIds(parent.path)[0])
    throw new AppError(
      409,
      'CROSS_CATEGORY_MOVE',
      'النقل متاح داخل الفئة نفسها فقط',
    );
  if (parent.path.startsWith(before.path))
    throw new AppError(
      409,
      'CYCLIC_MOVE',
      'اختر مجلدًا خارج المجموعة المراد نقلها',
    );
  const after =
    before.parentId === parentId
      ? before
      : await repo.moveSubtree(
          ctx.tx,
          before,
          parent,
          await repo.nextSiblingOrder(ctx.tx, parentId),
        );
  await ctx.audit('catalogNode.move', 'CatalogNode', id, before, after);
  return after;
}

export async function deactivateNode(ctx: Context, id: number) {
  const before = await repo.findNode(ctx.tx, id);
  const after = await repo.updateNode(ctx.tx, id, { isActive: false });
  await ctx.audit('catalogNode.deactivate', 'CatalogNode', id, before, after);
  return after;
}

export async function removeNode(ctx: Context, id: number) {
  const { _count } = await repo.nodeReferences(ctx.tx, id);
  if (_count.children || _count.items)
    throw new AppError(
      409,
      'NODE_NOT_EMPTY',
      'المجلد يحتوي على مجموعات أو أصناف',
      'أوقف المجلد بدلًا من حذفه.',
    );
  if (_count.suppliers)
    throw new AppError(
      409,
      'CATEGORY_HAS_SUPPLIERS',
      'الفئة مرتبطة بموردين',
      'عدّل فئات الموردين أولًا.',
    );
  if (_count.requests || _count.requestItems)
    throw new AppError(409, 'NODE_HAS_REQUESTS', ar.requests.nodeInUse);
  const before = await repo.deleteNode(ctx.tx, id);
  await ctx.audit('catalogNode.delete', 'CatalogNode', id, before);
  return { id };
}
