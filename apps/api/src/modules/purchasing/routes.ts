import type {
  ActionInput,
  ActionName,
} from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { Router } from 'express';
import type { z } from 'zod';

import { endpoint, type Context } from '../access/endpoint.js';
import { runTransition } from '../requests/service.js';

import * as schemas from './schemas.js';
import * as service from './service.js';

export const purchasing = Router({ mergeParams: true });
const id = (ctx: Context) => schemas.pathId.parse(ctx.req.params.id);
const write = (
  key: PermissionKey,
  handler: (ctx: Context) => Promise<unknown>,
  status = 200,
) => endpoint([key], handler, status, undefined, undefined, true);

function command<A extends ActionName>(
  action: A,
  select: (ctx: Context) => ActionInput<A> & { version: number },
) {
  return write('purchasing.price', (ctx) =>
    runTransition(
      ctx,
      id(ctx),
      action,
      () => select(ctx),
      (_state, command) => ({ command }),
    ),
  );
}
function parse<S extends z.ZodType>(schema: S, ctx: Context): z.output<S> {
  return schema.parse(ctx.req.body);
}

purchasing.get(
  '/',
  ...endpoint(['requests.view'], (ctx) =>
    service.getPurchasing(
      ctx,
      id(ctx),
      () => schemas.purchasingViewInput.parse(ctx.req.query).itemIds ?? [],
    ),
  ),
);
purchasing.get(
  '/suppliers',
  ...endpoint(['purchasing.price', 'requests.viewSupplierNames'], (ctx) =>
    service.searchSuppliers(ctx, id(ctx), () =>
      schemas.purchasingSupplierInput.parse(ctx.req.query),
    ),
  ),
);
purchasing.post(
  '/batches',
  ...write(
    'purchasing.sendRfq',
    (ctx) =>
      service.createBatch(ctx, id(ctx), () =>
        parse(schemas.createRfqInput, ctx),
      ),
    201,
  ),
);
purchasing.patch(
  '/batches/:batchId/suppliers/:supplierId',
  ...write('purchasing.sendRfq', (ctx) =>
    service.editMessage(
      ctx,
      id(ctx),
      schemas.pathId.parse(ctx.req.params.batchId),
      schemas.pathId.parse(ctx.req.params.supplierId),
      () => parse(schemas.editRfqMessageInput, ctx),
    ),
  ),
);
purchasing.post(
  '/batches/:batchId/suppliers/:supplierId/sent',
  ...write('purchasing.sendRfq', (ctx) =>
    service.markSent(
      ctx,
      id(ctx),
      schemas.pathId.parse(ctx.req.params.batchId),
      schemas.pathId.parse(ctx.req.params.supplierId),
      () => parse(schemas.requestVersion, ctx),
    ),
  ),
);
purchasing.patch(
  '/items/:itemId/pricing',
  ...write('purchasing.price', (ctx) =>
    service.priceItem(
      ctx,
      id(ctx),
      schemas.pathId.parse(ctx.req.params.itemId),
      () => parse(schemas.priceRequestItemInput, ctx),
    ),
  ),
);
const availability = (ctx: Context) => ({
  ...parse(schemas.itemAvailabilityInput, ctx),
  itemId: schemas.pathId.parse(ctx.req.params.itemId),
});
purchasing.post(
  '/items/:itemId/unavailable',
  ...command('markUnavailable', availability),
);
purchasing.delete(
  '/items/:itemId/unavailable',
  ...command('markAvailable', availability),
);
purchasing.put(
  '/delivery-fee',
  ...command('editDeliveryFee', (ctx) => parse(schemas.deliveryFeeInput, ctx)),
);
purchasing.post(
  '/submit-pricing',
  ...command('submitPricing', (ctx) => parse(schemas.requestVersion, ctx)),
);
