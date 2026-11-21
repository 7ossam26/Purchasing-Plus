import { Prisma } from '@prisma/client';
import type { DataEntity, DataPreview } from '@purchasing-plus/shared';

import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';

import { attributes } from './attributes.js';
import { catalogItems } from './catalog-items.js';
import { catalogTree } from './catalog-tree.js';
import { makeWorkbook, type DataFile } from './files.js';
import * as repo from './repo.js';
import { Row, type Definition } from './schemas.js';
import { sites } from './sites.js';
import { suppliers } from './suppliers.js';
import { units } from './units.js';

const definitions: Record<DataEntity, Definition> = {
  units,
  sites,
  attributes,
  'catalog-tree': catalogTree,
  'catalog-items': catalogItems,
  suppliers,
};

export function template(entity: DataEntity) {
  return makeWorkbook(entity, [definitions[entity].example]);
}

export async function exportData(ctx: Context, entity: DataEntity) {
  return makeWorkbook(entity, await definitions[entity].exportRows(ctx));
}

function reportRowError(row: Row, definition: Definition, error: unknown) {
  if (
    error instanceof AppError &&
    (error.status === 422 || error.status === 409)
  ) {
    row.serviceError(
      error,
      definition.errorColumns?.[error.code] ?? definition.mainColumn,
    );
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = String(
      error.meta?.target ?? error.meta?.driverAdapterError ?? '',
    );
    const column =
      target.includes('codePrefix') || definition === catalogTree
        ? 'codePrefix'
        : definition.mainColumn;
    row.issue(
      column,
      'القيمة مستخدمة بالفعل.',
      'استخدم قيمة مختلفة أو حدّث السجل الموجود.',
    );
    return;
  }
  throw error;
}

export async function importData(
  ctx: Context,
  entity: DataEntity,
  file: DataFile,
  commit: boolean,
): Promise<DataPreview> {
  const { tx } = ctx;
  const definition = definitions[entity];
  const result: DataPreview = {
    create: 0,
    update: 0,
    errors: [...file.errors],
  };
  const invalidRows = new Set(file.errors.map(({ row }) => row));
  // Exercise the regular services against the same database constraints during preview.
  // Row savepoints let validation continue after a rejected row (including a SQL constraint).
  if (!commit) await repo.startPreview(tx);
  const prepare = await definition.prepare({
    ...ctx,
    audit: async () => undefined,
  });
  for (const fileRow of file.rows) {
    const row = new Row(fileRow, result.errors);
    const before = result.errors.length;
    let change;
    try {
      change = await prepare(row);
    } catch (error) {
      reportRowError(row, definition, error);
    }
    if (
      !change ||
      before !== result.errors.length ||
      invalidRows.has(row.number)
    )
      continue;
    await repo.startRow(tx);
    try {
      await change.run();
      result[change.kind]++;
    } catch (error) {
      await repo.rewindRow(tx);
      reportRowError(row, definition, error);
    }
    await repo.finishRow(tx);
  }
  result.errors.sort((a, b) => a.row - b.row);
  if (!commit) await repo.rewindPreview(tx);
  else if (result.errors.length)
    throw new AppError(
      422,
      'DATA_IMPORT_INVALID',
      'الملف فيه أخطاء تمنع الاستيراد.',
      'اعمل معاينة للملف، وصلّح الأخطاء، وحاول تاني.',
    );
  else if (result.create || result.update)
    await ctx.audit('data.import', entity, null, null, {
      create: result.create,
      update: result.update,
    });
  return result;
}
