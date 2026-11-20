import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import * as service from './service.js';

export const attributes = Router();
attributes.get(
  '/attributes',
  ...endpoint(['attributes.view'], ({ tx, req }) => {
    const { page, pageSize, active } = s.catalogListFilters.parse(req.query);
    return service.listAttributes(tx, page, pageSize, active);
  }),
);
attributes.get(
  '/attributes/:id',
  ...endpoint(['attributes.view'], ({ tx, req }) =>
    service.getAttribute(tx, s.pathId.parse(req.params.id)),
  ),
);
attributes.post(
  '/attributes',
  ...endpoint(
    ['attributes.create'],
    (ctx) => service.addAttribute(ctx, s.createAttribute.parse(ctx.req.body)),
    201,
  ),
);
attributes.patch(
  '/attributes/:id',
  ...endpoint(['attributes.edit'], (ctx) =>
    service.updateAttribute(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editAttribute.parse(ctx.req.body),
    ),
  ),
);
attributes.post(
  '/attributes/:id/deactivate',
  ...endpoint(['attributes.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.deactivateAttribute(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
attributes.delete(
  '/attributes/:id',
  ...endpoint(['attributes.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.removeAttribute(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
attributes.post(
  '/attributes/:id/options',
  ...endpoint(
    ['attributes.edit'],
    (ctx) =>
      service.addOption(
        ctx,
        s.pathId.parse(ctx.req.params.id),
        s.createAttributeOption.parse(ctx.req.body).label,
      ),
    201,
  ),
);
attributes.put(
  '/attributes/:id/options/order',
  ...endpoint(['attributes.edit'], (ctx) =>
    service.reorderOptions(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.reorderAttributeOptions.parse(ctx.req.body).ids,
    ),
  ),
);
attributes.patch(
  '/attributes/:id/options/:optionId',
  ...endpoint(['attributes.edit'], (ctx) =>
    service.updateOption(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.pathId.parse(ctx.req.params.optionId),
      s.editAttributeOption.parse(ctx.req.body),
    ),
  ),
);
attributes.post(
  '/attributes/:id/options/:optionId/deactivate',
  ...endpoint(['attributes.edit'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.updateOption(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.pathId.parse(ctx.req.params.optionId),
      { isActive: false },
    );
  }),
);
attributes.delete(
  '/attributes/:id/options/:optionId',
  ...endpoint(['attributes.edit'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.removeOption(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.pathId.parse(ctx.req.params.optionId),
    );
  }),
);
attributes.get(
  '/nodes/:id/attributes',
  ...endpoint(['attributes.view'], ({ tx, req }) =>
    service.ownAttributes(tx, s.pathId.parse(req.params.id)),
  ),
);
attributes.get(
  '/nodes/:id/effective-attributes',
  ...endpoint(['attributes.view'], ({ tx, req }) =>
    service.effectiveAttributes(tx, s.pathId.parse(req.params.id)),
  ),
);
attributes.put(
  '/nodes/:id/attributes',
  ...endpoint(['attributes.edit'], (ctx) =>
    service.setDefaults(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.setNodeAttributes.parse(ctx.req.body).attributeIds,
    ),
  ),
);
