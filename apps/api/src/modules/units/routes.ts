import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import * as service from './service.js';

export const units = Router();
units.get(
  '/',
  ...endpoint(['units.view'], ({ tx, req }) => {
    const { page, pageSize, active } = s.catalogListFilters.parse(req.query);
    return service.listUnits(tx, page, pageSize, active);
  }),
);
units.get(
  '/:id',
  ...endpoint(['units.view'], ({ tx, req }) =>
    service.getUnit(tx, s.pathId.parse(req.params.id)),
  ),
);
units.post(
  '/',
  ...endpoint(
    ['units.create'],
    (ctx) => service.addUnit(ctx, s.createUnit.parse(ctx.req.body).name),
    201,
  ),
);
units.patch(
  '/:id',
  ...endpoint(['units.edit'], (ctx) =>
    service.editUnit(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editUnit.parse(ctx.req.body),
    ),
  ),
);
units.post(
  '/:id/deactivate',
  ...endpoint(['units.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.editUnit(ctx, s.pathId.parse(ctx.req.params.id), {
      isActive: false,
    });
  }),
);
units.delete(
  '/:id',
  ...endpoint(['units.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.removeUnit(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
