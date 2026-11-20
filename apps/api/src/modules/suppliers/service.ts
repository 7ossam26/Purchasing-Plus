import {
  formatEgyptianMobile,
  normalizeEgyptianMobile,
  type createSupplier,
  type editSupplier as editSupplierSchema,
  type supplierFilters,
} from '@purchasing-plus/shared';
import type { z } from 'zod';

import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import type { Tx } from '../access/repo.js';

import * as repo from './repo.js';

function toDto({ categories, ...row }: repo.SupplierRecord) {
  return {
    ...row,
    whatsappDisplay: formatEgyptianMobile(row.whatsappNumber),
    categoryIds: categories.map(({ categoryId }) => categoryId),
  };
}

async function validateCategories(tx: Tx, ids: number[]) {
  if ((await repo.topLevelCount(tx, ids)) !== ids.length)
    throw new AppError(422, 'INVALID_CATEGORIES', 'اختر فئات رئيسية موجودة');
}

async function validatePhone(tx: Tx, phone: string, id?: number) {
  const result = normalizeEgyptianMobile(phone);
  if (!result.ok)
    throw new AppError(
      422,
      result.error,
      'اكتب رقم موبايل مصري، مثال: 01012345678',
    );
  const duplicate = await repo.findByPhone(tx, result.digits);
  if (duplicate && duplicate.id !== id)
    throw new AppError(
      409,
      'DUPLICATE_WHATSAPP_NUMBER',
      'رقم الواتساب مستخدم لدى مورد آخر',
    );
  return result.digits;
}

export async function listSuppliers(
  tx: Tx,
  { page, pageSize, active, categoryId }: z.infer<typeof supplierFilters>,
) {
  if (categoryId) await validateCategories(tx, [categoryId]);
  const result = await repo.listSuppliers(
    tx,
    page,
    pageSize,
    active,
    categoryId,
  );
  return { ...result, items: result.items.map(toDto) };
}

export async function getSupplier(tx: Tx, id: number) {
  return toDto(await repo.findSupplier(tx, id));
}

export async function addSupplier(
  ctx: Context,
  { whatsappNumber, categoryIds, ...input }: z.infer<typeof createSupplier>,
) {
  await validateCategories(ctx.tx, categoryIds);
  const phone = await validatePhone(ctx.tx, whatsappNumber);
  const after = toDto(
    await repo.createSupplier(
      ctx.tx,
      { ...input, whatsappNumber: phone },
      categoryIds,
    ),
  );
  await ctx.audit('supplier.create', 'Supplier', after.id, null, after);
  return after;
}

export async function editSupplier(
  ctx: Context,
  id: number,
  {
    whatsappNumber,
    categoryIds,
    ...input
  }: Omit<z.infer<typeof editSupplierSchema>, 'isActive'> & { isActive?: boolean },
) {
  const before = await getSupplier(ctx.tx, id);
  if (categoryIds) await validateCategories(ctx.tx, categoryIds);
  const phone =
    whatsappNumber === undefined
      ? undefined
      : await validatePhone(ctx.tx, whatsappNumber, id);
  const after = toDto(
    await repo.updateSupplier(
      ctx.tx,
      id,
      { ...input, whatsappNumber: phone },
      categoryIds,
    ),
  );
  const action =
    input.isActive === undefined
      ? 'update'
      : input.isActive
        ? 'activate'
        : 'deactivate';
  await ctx.audit(`supplier.${action}`, 'Supplier', id, before, after);
  return after;
}

export async function removeSupplier(ctx: Context, id: number) {
  if (await repo.supplierPriceCount(ctx.tx, id))
    throw new AppError(
      409,
      'SUPPLIER_IN_USE',
      'المورد مرتبط بسجل أسعار',
      'أوقف المورد بدلًا من حذفه.',
    );
  const before = toDto(await repo.deleteSupplier(ctx.tx, id));
  await ctx.audit('supplier.delete', 'Supplier', id, before);
  return { id };
}
