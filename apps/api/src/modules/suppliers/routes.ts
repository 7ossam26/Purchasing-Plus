import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import * as service from './service.js';

export const suppliers = Router();
suppliers.get(
  '/',
  ...endpoint(['suppliers.view'], ({ tx, req }) =>
    service.listSuppliers(tx, s.supplierFilters.parse(req.query)),
  ),
);
suppliers.get(
  '/:id',
  ...endpoint(['suppliers.view'], ({ tx, req }) =>
    service.getSupplier(tx, s.pathId.parse(req.params.id)),
  ),
);
suppliers.post(
  '/',
  ...endpoint(
    ['suppliers.create'],
    (ctx) => service.addSupplier(ctx, s.createSupplier.parse(ctx.req.body)),
    201,
  ),
);
suppliers.patch(
  '/:id',
  ...endpoint(['suppliers.edit'], (ctx) =>
    service.editSupplier(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editSupplier.parse(ctx.req.body),
    ),
  ),
);
suppliers.post(
  '/:id/deactivate',
  ...endpoint(['suppliers.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.editSupplier(ctx, s.pathId.parse(ctx.req.params.id), {
      isActive: false,
    });
  }),
);
suppliers.delete(
  '/:id',
  ...endpoint(['suppliers.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.removeSupplier(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
