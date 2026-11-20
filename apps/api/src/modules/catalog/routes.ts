import * as s from '@purchasing-plus/shared';
import { Router } from 'express';

import { endpoint } from '../access/endpoint.js';
import { listFolders, nodeWithBreadcrumb } from '../catalog-tree/service.js';

import * as service from './service.js';

export const catalog = Router();
catalog.get(
  '/categories',
  ...endpoint(['catalog.view'], (ctx) => {
    const { includeInactive } = s.itemVisibility.parse(ctx.req.query);
    service.assertInactiveAccess(ctx.viewer, includeInactive);
    return listFolders(ctx, null, undefined, !includeInactive);
  }),
);
catalog.get(
  '/nodes/:id',
  ...endpoint(['catalog.view'], ({ tx, req, viewer }) => {
    const { includeInactive } = s.itemVisibility.parse(req.query);
    service.assertInactiveAccess(viewer, includeInactive);
    return nodeWithBreadcrumb(
      tx,
      s.pathId.parse(req.params.id),
      !includeInactive,
    );
  }),
);
catalog.get(
  '/nodes/:id/children',
  ...endpoint(['catalog.view'], (ctx) => {
    const { includeInactive } = s.itemVisibility.parse(ctx.req.query);
    service.assertInactiveAccess(ctx.viewer, includeInactive);
    return listFolders(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      undefined,
      !includeInactive,
    );
  }),
);
catalog.get(
  '/nodes/:id/editor-choices',
  ...endpoint(['catalog.view', 'masterData.view'], (ctx) => {
    const { page, pageSize } = s.pagination.parse(ctx.req.query);
    return service.editorChoices(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      page,
      pageSize,
    );
  }),
);
catalog.get(
  '/nodes/:id/items',
  ...endpoint(['catalog.view'], (ctx) =>
    service.listItems(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.browseItemFilters.parse(ctx.req.query),
    ),
  ),
);
catalog.get(
  '/items/:id',
  ...endpoint(['catalog.view'], (ctx) =>
    service.getItem(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.itemVisibility.parse(ctx.req.query).includeInactive,
    ),
  ),
);
catalog.get(
  '/search',
  ...endpoint(['catalog.view'], (ctx) =>
    service.search(ctx, s.catalogSearchFilters.parse(ctx.req.query)),
  ),
);
catalog.post(
  '/items',
  ...endpoint(
    ['catalog.create'],
    (ctx) => service.addItem(ctx, s.createCatalogItem.parse(ctx.req.body)),
    201,
  ),
);
catalog.patch(
  '/items/:id',
  ...endpoint(['catalog.edit'], (ctx) =>
    service.editItem(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editCatalogItem.parse(ctx.req.body),
    ),
  ),
);
catalog.post(
  '/items/:id/move',
  ...endpoint(['catalog.edit'], (ctx) =>
    service.moveItem(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.moveCatalogItem.parse(ctx.req.body).nodeId,
    ),
  ),
);
catalog.patch(
  '/items/:id/editor',
  ...endpoint(['catalog.edit'], (ctx) =>
    service.editItem(
      ctx,
      s.pathId.parse(ctx.req.params.id),
      s.editCatalogItemInEditor.parse(ctx.req.body),
    ),
  ),
);
catalog.delete(
  '/items/:id',
  ...endpoint(['catalog.delete'], (ctx) => {
    s.emptyInput.parse(ctx.req.body ?? {});
    return service.deactivateItem(ctx, s.pathId.parse(ctx.req.params.id));
  }),
);
