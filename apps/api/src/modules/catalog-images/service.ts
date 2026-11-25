import { randomUUID } from 'node:crypto';

import type { CatalogItemImage } from '@prisma/client';
import type { ImageCrop } from '@purchasing-plus/shared';

import type { StorageDriver } from '../../lib/storage.js';
import { missing } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';

import { assertCropBounds, type variants } from './pipeline.js';
import * as repo from './repo.js';

function savedCrop({
  cropX,
  cropY,
  cropSize,
}: CatalogItemImage): ImageCrop | null {
  return cropX === null || cropY === null || cropSize === null
    ? null
    : { x: cropX, y: cropY, size: cropSize };
}

function cropColumns(crop: ImageCrop | null) {
  return {
    cropX: crop?.x ?? null,
    cropY: crop?.y ?? null,
    cropSize: crop?.size ?? null,
  };
}

export async function imageUrls(row: CatalogItemImage, storage: StorageDriver) {
  const [thumbUrl, displayUrl] = await Promise.all([
    storage.url(row.thumbKey),
    storage.url(row.displayKey),
  ]);
  return {
    id: row.id,
    thumbUrl,
    displayUrl,
    width: row.width,
    height: row.height,
    crop: savedCrop(row),
    order: row.sortOrder,
    isCover: row.isCover,
  };
}
async function listResponse(ctx: Context, itemId: number) {
  const storage: StorageDriver = ctx.req.app.locals.storage;
  return Promise.all(
    (await repo.itemImages(ctx.tx, itemId)).map((image) =>
      imageUrls(image, storage),
    ),
  );
}
export async function uploadImage(
  ctx: Context,
  itemId: number,
  image: Awaited<ReturnType<typeof variants>> & { crop: ImageCrop | null },
) {
  await repo.assertItem(ctx.tx, itemId);
  const current = await repo.itemImages(ctx.tx, itemId);
  if (current.length >= 10)
    throw new AppError(
      409,
      'IMAGE_LIMIT',
      'الصنف وصل للحد الأقصى من الصور',
      'احذف صورة قبل ما ترفع واحدة جديدة.',
    );
  const storage: StorageDriver = ctx.req.app.locals.storage;
  const prefix = `catalog/${itemId}/${randomUUID()}`;
  const thumbKey = prefix + '-thumb.webp',
    displayKey = prefix + '-display.webp';
  for (const [key, bytes] of [
    [thumbKey, image.thumb],
    [displayKey, image.display],
  ] as const) {
    ctx.onRollback(() => storage.delete(key));
    await storage.put(key, bytes, 'image/webp');
  }
  const row = await repo.addImage(ctx.tx, {
    itemId,
    thumbKey,
    displayKey,
    width: image.width,
    height: image.height,
    ...cropColumns(image.crop),
    sortOrder: (current.at(-1)?.sortOrder ?? -1) + 1,
    isCover: !current.length,
  });
  await ctx.audit('catalogImage.upload', 'CatalogItem', itemId, null, {
    imageId: row.id,
    crop: image.crop,
  });
  return listResponse(ctx, itemId);
}
export async function updateCrop(
  ctx: Context,
  itemId: number,
  id: number,
  crop: ImageCrop | null,
) {
  const image = await repo.findImage(ctx.tx, itemId, id);
  if (image.pendingDelete) throw missing();
  assertCropBounds(crop, image);
  const old = savedCrop(image);
  if (old?.x !== crop?.x || old?.y !== crop?.y || old?.size !== crop?.size) {
    await repo.updateImage(ctx.tx, id, cropColumns(crop));
    await ctx.audit(
      'catalogImage.crop',
      'CatalogItem',
      itemId,
      { imageId: id, crop: old },
      { imageId: id, crop },
    );
  }
  return listResponse(ctx, itemId);
}
export async function reorderImages(
  ctx: Context,
  itemId: number,
  ids: number[],
) {
  await repo.assertItem(ctx.tx, itemId);
  const current = await repo.itemImages(ctx.tx, itemId);
  const known = new Set(current.map((image) => image.id));
  if (ids.length !== current.length || ids.some((id) => !known.has(id)))
    throw new AppError(
      409,
      'IMAGE_ORDER_CHANGED',
      'ترتيب الصور اتغير',
      'حدّث الصور وجرّب تاني.',
    );
  for (const [sortOrder, id] of ids.entries())
    await repo.updateImage(ctx.tx, id, { sortOrder });
  await ctx.audit(
    'catalogImage.reorder',
    'CatalogItem',
    itemId,
    current.map((image) => image.id),
    ids,
  );
  return listResponse(ctx, itemId);
}
export async function setCover(ctx: Context, itemId: number, id: number) {
  const current = await repo.itemImages(ctx.tx, itemId);
  if (!current.some((image) => image.id === id)) throw missing();
  const old = current.find((image) => image.isCover);
  if (old?.id !== id) {
    if (old) await repo.updateImage(ctx.tx, old.id, { isCover: false });
    await repo.updateImage(ctx.tx, id, { isCover: true });
    await ctx.audit('catalogImage.cover', 'CatalogItem', itemId, old?.id, id);
  }
  return listResponse(ctx, itemId);
}
export async function deleteImage(ctx: Context, itemId: number, id: number) {
  const image = await repo.findImage(ctx.tx, itemId, id);
  const storage: StorageDriver = ctx.req.app.locals.storage;
  if (!image.pendingDelete) {
    await repo.updateImage(ctx.tx, id, { pendingDelete: true, isCover: false });
    if (image.isCover) {
      const first = (await repo.itemImages(ctx.tx, itemId))[0];
      if (first) await repo.updateImage(ctx.tx, first.id, { isCover: true });
    }
    await ctx.audit('catalogImage.delete', 'CatalogItem', itemId, {
      imageId: id,
    });
  }
  ctx.onCommit(async () => {
    const results = await Promise.allSettled([
      storage.delete(image.thumbKey),
      storage.delete(image.displayKey),
    ]);
    if (results.some((result) => result.status === 'rejected'))
      throw new AppError(
        503,
        'IMAGE_CLEANUP',
        'تعذّر حذف ملفات الصورة',
        'جرّب الحذف تاني.',
      );
    await repo.finalizeDelete(ctx.req.app.locals.db, id);
  });
  return listResponse(ctx, itemId);
}
