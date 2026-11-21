import { createUnit } from '@purchasing-plus/shared';

import { addUnit, editUnit } from '../units/service.js';

import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  namedRows,
  normalizedName,
  type Definition,
} from './schemas.js';

export const units: Definition = {
  mainColumn: 'name',
  example: { name: 'متر', active: activeCell(true) },
  exportRows: async ({ tx }) =>
    (await repo.units(tx)).map(({ name, isActive }) => ({
      name,
      active: activeCell(isActive),
    })),
  prepare: async (ctx) => {
    const match = await namedRows(repo.units)(ctx.tx);
    const seen = new Set<string | number>();
    return async (row) => {
      const name = row.text('name');
      const isActive = row.active();
      const input = row.parse(createUnit, { name });
      if (!input) return;
      const existing = match(name);
      checkDuplicate(seen, existing?.id ?? normalizedName(name), row, 'name');
      return {
        kind: existing ? 'update' : 'create',
        run: async () => {
          const unit = existing ?? (await addUnit(ctx, input.name));
          if (isActive !== undefined && isActive !== unit.isActive)
            await editUnit(ctx, unit.id, { isActive });
        },
      };
    };
  },
};
