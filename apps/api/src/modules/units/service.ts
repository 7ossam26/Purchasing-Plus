import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';

import * as repo from './repo.js';

export const { findUnit: getUnit, listUnits } = repo;

export async function addUnit(ctx: Context, name: string) {
  const row = await repo.createUnit(ctx.tx, name);
  await ctx.audit('unit.create', 'Unit', row.id, null, row);
  return row;
}

export async function editUnit(
  ctx: Context,
  id: number,
  input: { name?: string; isActive?: boolean },
) {
  const before = await repo.findUnit(ctx.tx, id);
  const after = await repo.updateUnit(ctx.tx, id, input);
  const action =
    input.isActive === undefined
      ? 'update'
      : input.isActive
        ? 'activate'
        : 'deactivate';
  await ctx.audit(`unit.${action}`, 'Unit', id, before, after);
  return after;
}

export async function removeUnit(ctx: Context, id: number) {
  if (await repo.unitUsage(ctx.tx, id))
    throw new AppError(
      409,
      'UNIT_IN_USE',
      'الوحدة مستخدمة',
      'أوقف الوحدة بدلًا من حذفها.',
    );
  const before = await repo.deleteUnit(ctx.tx, id);
  await ctx.audit('unit.delete', 'Unit', id, before);
  return { id };
}
