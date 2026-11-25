import {
  wasSupplyOrderSent,
  type ActionInput,
  type ActionName,
} from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
import { Router } from 'express';

import { endpoint, type Context } from '../access/endpoint.js';
import { assertActivePricingSupplier } from '../purchasing/service.js';
import { runTransition } from '../requests/service.js';

import * as schemas from './schemas.js';
import * as service from './service.js';

export const fulfilment = Router({ mergeParams: true });
const param = (ctx: Context, key: string) =>
  schemas.pathId.parse(ctx.req.params[key]);
const version = (ctx: Context) => schemas.requestVersion.parse(ctx.req.body);
const reason = (ctx: Context) => schemas.requestReasonInput.parse(ctx.req.body);
const order = (ctx: Context) => ({ ...version(ctx), orderNo: param(ctx, 'n') });

const write = (
  key: PermissionKey,
  handler: (ctx: Context) => Promise<unknown>,
) => endpoint([key], handler, 200, undefined, undefined, true);
function command<A extends ActionName>(
  action: A,
  key: PermissionKey,
  read: (ctx: Context) => ActionInput<A> & { version: number },
) {
  return write(key, (ctx) =>
    runTransition(
      ctx,
      param(ctx, 'id'),
      action,
      () => read(ctx),
      (_state, command) => ({ command }),
    ),
  );
}

// Read-only pricing history. Submitted pricing goes straight to receipt, so there is nothing
// left to approve or reject here.
fulfilment.get(
  '/rounds/:n',
  ...endpoint(['requests.view', 'requests.viewPrices'], (ctx) =>
    service.getRound(ctx, param(ctx, 'id'), () => param(ctx, 'n')),
  ),
);
fulfilment.get(
  '/supply-orders',
  ...endpoint(['purchasing.sendSupplyOrder'], (ctx) =>
    service.listOrders(ctx, param(ctx, 'id')),
  ),
);
fulfilment.patch(
  '/supply-orders/:n',
  ...write('purchasing.sendSupplyOrder', (ctx) =>
    service.editMessage(ctx, param(ctx, 'id'), () => ({
      ...schemas.orderMessageInput.parse(ctx.req.body),
      orderNo: param(ctx, 'n'),
    })),
  ),
);
fulfilment.post(
  '/supply-orders/:n/sent',
  ...write('purchasing.sendSupplyOrder', (ctx) =>
    runTransition(
      ctx,
      param(ctx, 'id'),
      'markSupplyOrderSent',
      () => order(ctx),
      (_state, command) => ({ command }),
      (state, input) => wasSupplyOrderSent(state, input.orderNo),
    ),
  ),
);
fulfilment.post(
  '/receipts',
  ...command('recordReceipt', 'receipt.record', (ctx) =>
    schemas.receiptInput.parse(ctx.req.body),
  ),
);
fulfilment.post(
  '/items/:itemId/still-coming',
  ...command('stillComing', 'purchasing.handleRemaining', (ctx) => ({
    ...version(ctx),
    itemId: param(ctx, 'itemId'),
  })),
);
fulfilment.post(
  '/items/:itemId/reprice',
  ...write('purchasing.handleRemaining', (ctx) =>
    runTransition(
      ctx,
      param(ctx, 'id'),
      'repriceRemaining',
      () => ({
        ...schemas.repriceRemainingInput.parse(ctx.req.body),
        itemId: param(ctx, 'itemId'),
      }),
      async (_state, command) => {
        await assertActivePricingSupplier(ctx, command.supplierId);
        return { command };
      },
    ),
  ),
);
fulfilment.post(
  '/items/:itemId/resolve-externally',
  ...command('resolveExternally', 'items.resolveExternally', (ctx) => ({
    ...schemas.itemAvailabilityInput.parse(ctx.req.body),
    itemId: param(ctx, 'itemId'),
  })),
);
fulfilment.post(
  '/cancel',
  ...command('cancel', 'requests.cancelAnyStage', reason),
);
