import type {
  ActionInput,
  ActionName,
} from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { Router } from 'express';
import type { z } from 'zod';

import { endpoint, type Context } from '../access/endpoint.js';

import * as schemas from './schemas.js';
import * as service from './service.js';

export const requests = Router();
const id = (ctx: Context) => schemas.pathId.parse(ctx.req.params.id);
const read = (
  keys: PermissionKey[],
  handler: (ctx: Context) => Promise<unknown>,
) => endpoint(keys, handler);
requests.get('/options', ...read(['requests.view'], service.options));
const write = (
  key: PermissionKey,
  handler: (ctx: Context) => Promise<unknown>,
  status = 200,
) => endpoint([key], handler, status, undefined, undefined, true);
function command<A extends ActionName>(
  action: A,
  key: PermissionKey,
  schema: z.ZodType<ActionInput<A> & { version: number }>,
  status = 200,
) {
  return write(
    key,
    (ctx) =>
      service.runTransition(
        ctx,
        id(ctx),
        action,
        () => schema.parse(ctx.req.body),
        (_state, command) => ({ command }),
      ),
    status,
  );
}
requests.get(
  '/recent-items',
  ...read(['requests.create', 'catalog.view'], (ctx) =>
    service.recent(
      ctx,
      schemas.recentRequestItemsInput.parse(ctx.req.query).categoryId,
    ),
  ),
);
requests.get(
  '/',
  ...read(['requests.view'], (ctx) =>
    service.list(ctx, schemas.requestListInput.parse(ctx.req.query)),
  ),
);
requests.get(
  '/:id',
  ...read(['requests.view'], (ctx) => service.getRequest(ctx, id(ctx))),
);
requests.get(
  '/:id/timeline',
  ...read(['requests.viewTimeline'], (ctx) =>
    service.getTimeline(ctx, id(ctx)),
  ),
);
requests.post(
  '/',
  ...write(
    'requests.create',
    (ctx) =>
      service.createDraft(ctx, schemas.createRequestInput.parse(ctx.req.body)),
    201,
  ),
);
requests.patch(
  '/:id/draft',
  ...write('requests.create', (ctx) =>
    service.save(ctx, id(ctx), () =>
      schemas.saveDraftInput.parse(ctx.req.body),
    ),
  ),
);
requests.delete(
  '/:id',
  ...command('deleteDraft', 'requests.create', schemas.deleteDraftInput, 204),
);
requests.post(
  '/:id/submit',
  ...write('requests.create', (ctx) =>
    service.submit(ctx, id(ctx), () =>
      schemas.requestVersion.parse(ctx.req.body),
    ),
  ),
);
requests.post(
  '/:id/resubmit',
  ...command('resubmit', 'requests.create', schemas.requestVersion),
);
requests.post(
  '/:id/approve',
  ...command('approve', 'requests.approve', schemas.requestVersion),
);
requests.post(
  '/:id/reject',
  ...command('reject', 'requests.reject', schemas.requestReasonInput),
);
requests.post(
  '/:id/return',
  ...command(
    'returnForEdit',
    'requests.returnForEdit',
    schemas.requestReasonInput,
  ),
);
requests.post(
  '/:id/urgency',
  ...command(
    'raiseUrgency',
    'requests.raiseUrgency',
    schemas.requestUrgencyInput,
  ),
);
requests.patch(
  '/:id/quantities',
  ...command(
    'editQuantities',
    'requests.editQuantities',
    schemas.requestQuantitiesInput,
  ),
);
requests.patch(
  '/:id',
  ...write('requests.create', (ctx) =>
    service.edit(ctx, id(ctx), () =>
      schemas.editRequestInput.parse(ctx.req.body),
    ),
  ),
);
requests.post(
  '/:id/copy',
  ...write(
    'requests.create',
    (ctx) =>
      service.copy(ctx, id(ctx), () =>
        schemas.copyRequestInput.parse(ctx.req.body),
      ),
    201,
  ),
);
// Catalog writes use the same exclusive lock as the catalog editor and tree mutations.
requests.post(
  '/:id/items/:itemId/add-to-catalog',
  ...endpoint(['catalog.create', 'requests.view'], (ctx) =>
    service.convert(
      ctx,
      id(ctx),
      schemas.pathId.parse(ctx.req.params.itemId),
      () => schemas.addRequestItemToCatalogInput.parse(ctx.req.body),
    ),
  ),
);
