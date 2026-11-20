import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { assertSiteInScope } from '../../middleware/access.js';
import { endpoint } from '../access/endpoint.js';

import { createSite, listSites, updateSite } from './repo.js';
export const sites = Router();
sites.get(
  '/',
  ...endpoint(['sites.view'], async ({ tx, req, viewer }) => {
    const filters = s.siteFilters.parse(req.query);
    return listSites(
      tx,
      viewer.siteScope === 'ALL' ? undefined : viewer.siteIds,
      filters,
    );
  }),
);
sites.post(
  '/',
  ...endpoint(
    ['sites.create'],
    async ({ tx, req, audit }) => {
      const data = s.createSite.parse(req.body);
      const row = await createSite(tx, data);

      await audit('site.create', 'Site', row.id, null, row);
      return row;
    },
    201,
  ),
);
for (const deactivate of [false, true]) {
  const handlers = endpoint(
    [deactivate ? 'sites.delete' : 'sites.edit'],
    async ({ tx, req, viewer, audit }) => {
      const id = s.pathId.parse(req.params.id);
      assertSiteInScope(viewer, id);
      if (deactivate) s.emptyInput.parse(req.body ?? {});
      const data = deactivate
        ? { isActive: false }
        : s.editSite.parse(req.body);
      const { before: old, after: row } = await updateSite(tx, id, data);
      await audit(
        deactivate ? 'site.deactivate' : 'site.update',
        'Site',
        id,
        old,
        row,
      );
      return row;
    },
  );
  if (deactivate) sites.delete('/:id', ...handlers);
  else sites.patch('/:id', ...handlers);
}
