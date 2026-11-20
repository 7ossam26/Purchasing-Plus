import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';

import * as service from './service.js';

export const catalogTree = Router();
catalogTree.get(
  '/categories',
  ...endpoint(['catalogTree.view'], (ctx) =>
    service.listFolders(
      ctx,
      null,
      s.nodeListFilters.parse(ctx.req.query).active,
    ),
  ),
);
catalogTree.get(
  '/nodes/:id',
  ...endpoint(['catalogTree.view'], ({ tx, req }) =>
    service.nodeWithBreadcrumb(tx, s.pathId.parse(req.params.id)),
  ),
);
catalogTree.get(
  '/nodes/:id/children',
  ...endpoint(['catalogTree.view'], (ctx) =>
    service.listFolders(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.nodeListFilters.parse(ctx.req.query).active,
    ),
  ),
);
catalogTree.post(
  '/categories',
  ...endpoint(
    ['catalogTree.create'],
    (ctx) =>
      service.createCategoryNode(ctx, s.createCategory.parse(ctx.req.body)),
    201,
  ),
);
catalogTree.post(
  '/nodes',
  ...endpoint(
    ['catalogTree.create'],
    (ctx) => service.createGroupNode(ctx, s.createGroup.parse(ctx.req.body)),
    201,
  ),
);
catalogTree.put(
  '/nodes/order',
  ...endpoint(['catalogTree.edit'], (ctx) =>
    service.reorderNodes(ctx, s.reorderCatalogNodes.parse(ctx.req.body)),
  ),
);
catalogTree.patch(
  '/nodes/:id',
  ...endpoint(['catalogTree.edit'], (ctx) =>
    service.editNode(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editCatalogNode.parse(ctx.req.body),
    ),
  ),
);
catalogTree.post(
  '/nodes/:id/move',
  ...endpoint(['catalogTree.edit'], (ctx) =>
    service.moveNode(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.moveCatalogNode.parse(ctx.req.body).parentId,
    ),
  ),
);
catalogTree.post(
  '/nodes/:id/deactivate',
  ...endpoint(['catalogTree.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.deactivateNode(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
catalogTree.delete(
  '/nodes/:id',
  ...endpoint(['catalogTree.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.removeNode(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
