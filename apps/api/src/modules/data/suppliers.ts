import {
  createSupplier,
  editSupplier as editSupplierSchema,
} from '@purchasing-plus/shared';

import { AppError } from '../../middleware/errors.js';
import {
  addSupplier,
  editSupplier,
  validatePhone,
} from '../suppliers/service.js';

import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  joinNames,
  matchName,
  namedRows,
  normalizedName,
  splitNames,
  type Definition,
} from './schemas.js';

export const suppliers: Definition = {
  mainColumn: 'name',
  errorColumns: {
    INVALID_CATEGORIES: 'categories',
    INVALID_EGYPTIAN_MOBILE: 'whatsappNumber',
    DUPLICATE_WHATSAPP_NUMBER: 'whatsappNumber',
  },
  example: {
    name: 'مورد الكهرباء',
    contactPerson: 'أحمد',
    whatsappNumber: '01012345678',
    categories: 'كهربا',
    active: activeCell(true),
  },
  exportRows: async ({ tx }) =>
    (await repo.suppliers(tx)).map((supplier) => ({
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      whatsappNumber: supplier.whatsappNumber,
      categories: joinNames(
        supplier.categories.map(({ category }) => category.name),
        '،',
      ),
      active: activeCell(supplier.isActive),
      notes: supplier.notes,
    })),
  prepare: async (ctx) => {
    const match = await namedRows(repo.suppliers)(ctx.tx);
    const categories = (await repo.nodes(ctx.tx)).filter(
      ({ parentId }) => parentId === null,
    );
    const seenNames = new Set<string | number>();
    const seenPhones = new Set<string | number>();
    return async (row) => {
      const name = row.text('name');
      const existing = row.check('name', () => match(name));
      if (name)
        checkDuplicate(
          seenNames,
          existing?.id ?? normalizedName(name),
          row,
          'name',
        );
      const categoryIds = splitNames(row.text('categories'), '،').flatMap(
        (label) => {
          const match = row.check(
            'categories',
            () => matchName(categories, label, ({ name }) => name) ?? null,
          );
          if (match === null)
            row.issue(
              'categories',
              'الفئة مش موجودة.',
              'استخدم أسماء الفئات الرئيسية.',
            );
          return match ? [match.id] : [];
        },
      );
      const isActive = row.active();
      const whatsappNumber = row.text('whatsappNumber');
      try {
        const phone = await validatePhone(ctx.tx, whatsappNumber, existing?.id);
        checkDuplicate(seenPhones, phone, row, 'whatsappNumber');
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        row.serviceError(error, 'whatsappNumber');
      }
      const input = row.parse(
        createSupplier,
        {
          name,
          whatsappNumber,
          notes: row.text('notes'),
          contactPerson: row.text('contactPerson'),
          categoryIds,
          isActive: isActive === false ? false : undefined,
        },
        { categoryIds: 'categories' },
      );
      if (!input) return;
      return {
        kind: existing ? 'update' : 'create',
        run: () =>
          existing
            ? editSupplier(
                ctx,
                existing.id,
                editSupplierSchema.parse({ ...input, isActive }),
                'data.import',
              )
            : addSupplier(ctx, input, 'data.import'),
      };
    };
  },
};
