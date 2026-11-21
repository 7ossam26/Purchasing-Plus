import { createSite } from '@purchasing-plus/shared';

import type { Viewer } from '../../middleware/access.js';
import { createSite as insertSite, updateSite } from '../sites/repo.js';

import * as repo from './repo.js';
import {
  activeCell,
  checkDuplicate,
  namedRows,
  normalizedName,
  type Definition,
} from './schemas.js';

function assignedIds(viewer: Viewer) {
  return viewer.isSuperadmin || viewer.siteScope === 'ALL'
    ? undefined
    : viewer.siteIds;
}

export const sites: Definition = {
  mainColumn: 'name',
  example: {
    name: 'موقع المعادي',
    address: 'شارع النصر',
    active: activeCell(true),
  },
  exportRows: async ({ tx, viewer }) =>
    (await repo.sites(tx, assignedIds(viewer))).map(
      ({ name, address, isActive }) => ({
        name,
        address,
        active: activeCell(isActive),
      }),
    ),
  prepare: async ({ tx, viewer }) => {
    const ids = assignedIds(viewer);
    const match = await namedRows((db) => repo.sites(db, ids))(tx);
    const seen = new Set<string | number>();
    return async (row) => {
      const name = row.text('name');
      const isActive = row.active();
      const input = row.parse(createSite, {
        name,
        address: row.text('address'),
      });
      if (!input) return;
      const existing = match(name);
      checkDuplicate(seen, existing?.id ?? normalizedName(name), row, 'name');
      if (ids && !existing) {
        row.issue(
          'name',
          'الموقع مش ضمن المواقع المتاحة ليك.',
          'استخدم اسم موقع من ملف التصدير أو راجع المسؤول.',
        );
        return;
      }
      return {
        kind: existing ? 'update' : 'create',
        run: async () => {
          const site = existing ?? (await insertSite(tx, input));
          if (
            site.address !== input.address ||
            (isActive !== undefined && site.isActive !== isActive)
          )
            await updateSite(tx, site.id, { address: input.address, isActive });
        },
      };
    };
  },
};
