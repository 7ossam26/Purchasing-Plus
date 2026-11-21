import {
  ar,
  type RequestLineInput,
  type createRfqInput,
  type editRfqMessageInput,
  type priceRequestItemInput,
  type editPausedRequestInput,
  type purchasingSupplierInput,
} from '@purchasing-plus/shared';
import {
  pricingDraftAction,
  wasBatchSent,
  type RequestItem,
} from '@purchasing-plus/shared/lifecycle';
import type { z } from 'zod';

import { allowed, forbidden, missing } from '../../middleware/access.js';
import { AppError } from '../../middleware/errors.js';
import type { Context } from '../access/endpoint.js';
import { hydrateLines, invalidLine } from '../requests/catalog.js';
import { loadRequestInScope, reserveIds } from '../requests/repo.js';
import { runTransition } from '../requests/service.js';

import { supplierDto, toBatchDto, toPurchasingDto } from './dto.js';
import * as repo from './repo.js';

export async function getPurchasing(
  ctx: Context,
  id: number,
  read: () => number[],
) {
  const row = await loadRequestInScope(ctx.tx, id, ctx.viewer);
  const itemIds = read();
  const itemSet = new Set(
    row.items.filter((item) => item.state !== 'REMOVED').map((item) => item.id),
  );
  if (itemIds.some((id) => !itemSet.has(id)))
    throw new AppError(
      422,
      'INVALID_RFQ_SELECTION',
      ar.purchasing.invalidSelection,
    );
  const batches = await repo.listBatches(ctx.tx, id);
  const suppliers = allowed(ctx.viewer, 'requests.viewSupplierNames')
    ? await repo.activeSuppliers(ctx.tx, { categoryId: row.categoryId })
    : [];
  return toPurchasingDto(row, batches, suppliers, itemIds, ctx.viewer);
}
export async function searchSuppliers(
  ctx: Context,
  id: number,
  read: () => z.output<typeof purchasingSupplierInput>,
) {
  if (
    !allowed(ctx.viewer, 'purchasing.price') &&
    !allowed(ctx.viewer, 'purchasing.handleRemaining')
  )
    throw forbidden();
  await loadRequestInScope(ctx.tx, id, ctx.viewer);
  const { page, pageSize, q } = read();
  const result = await repo.searchSuppliers(ctx.tx, page, pageSize, q);
  return { ...result, items: result.items.map(supplierDto) };
}

export async function createBatch(
  ctx: Context,
  requestId: number,
  read: () => z.output<typeof createRfqInput>,
) {
  let batchId = 0;
  const request = await runTransition(
    ctx,
    requestId,
    'createBatch',
    read,
    async (state, { version, itemIds, supplierIds, message }) => {
      const distinctIds = [...new Set(supplierIds)];
      const suppliers = await repo.activeSuppliers(ctx.tx, {
        categoryId: state.categoryId,
        ids: distinctIds,
      });
      if (suppliers.length !== distinctIds.length)
        throw new AppError(
          422,
          'INVALID_RFQ_SUPPLIERS',
          ar.purchasing.categorySuppliers,
        );
      const [reserved] = await reserveIds(ctx.tx, 'RfqBatch', 1);
      batchId = reserved!;
      return {
        command: { version, batchId, itemIds, supplierIds },
        persist: () =>
          repo.addBatch(ctx.tx, {
            id: batchId,
            requestId,
            createdAt: ctx.now,
            createdById: ctx.viewer.userId,
            message,
            itemIds,
            supplierIds,
          }),
      };
    },
  );
  return batchResult(ctx, requestId, batchId, request!.version);
}

async function batchResult(
  ctx: Context,
  requestId: number,
  batchId: number,
  version: number,
) {
  const row = await repo.findBatch(ctx.tx, requestId, batchId);
  return { version, batch: toBatchDto(row, ctx.viewer) };
}
export async function editMessage(
  ctx: Context,
  requestId: number,
  batchId: number,
  supplierId: number,
  read: () => z.output<typeof editRfqMessageInput>,
) {
  const request = await runTransition(
    ctx,
    requestId,
    'editBatchMessage',
    read,
    (_state, input) => ({
      command: { ...input, batchId, supplierId },
      persist: async () => {
        const batch = await repo.findBatch(ctx.tx, requestId, batchId);
        const before = batch.suppliers.find(
          (row) => row.supplierId === supplierId,
        )!;
        const after = await repo.setSupplierMessage(
          ctx.tx,
          batchId,
          supplierId,
          input.message,
        );
        await ctx.audit(
          'rfqBatchSupplier.message',
          'RfqBatch',
          batchId,
          { supplierId, message: before.message },
          { supplierId, message: after.message },
        );
      },
    }),
  );
  return batchResult(ctx, requestId, batchId, request!.version);
}
export async function markSent(
  ctx: Context,
  requestId: number,
  batchId: number,
  supplierId: number,
  read: () => { version: number },
) {
  const request = await runTransition(
    ctx,
    requestId,
    'markBatchSent',
    read,
    (_state, input) => ({
      command: { ...input, batchId, supplierId },
      persist: () =>
        repo.setSent(ctx.tx, batchId, supplierId, ctx.now, ctx.viewer.userId),
    }),
    (state) => wasBatchSent(state, batchId, supplierId),
  );
  return batchResult(ctx, requestId, batchId, request!.version);
}

export async function assertActivePricingSupplier(ctx: Context, id: number) {
  if (!(await repo.activeSuppliers(ctx.tx, { ids: [id] })).length)
    throw new AppError(
      422,
      'INVALID_PRICING_SUPPLIER',
      ar.purchasing.activeSupplier,
    );
}

export function priceItem(
  ctx: Context,
  requestId: number,
  itemId: number,
  read: () => z.output<typeof priceRequestItemInput>,
) {
  return runTransition(
    ctx,
    requestId,
    (state, input) =>
      pricingDraftAction(state, itemId, input.supplierId !== null),
    read,
    async (_state, input) => {
      if (input.supplierId !== null)
        await assertActivePricingSupplier(ctx, input.supplierId);
      return { command: { ...input, itemId } };
    },
  );
}

type PausedEdit = z.output<typeof editPausedRequestInput>;
function changeInput(
  item: RequestItem,
  fields: NonNullable<PausedEdit['change']>[number]['fields'],
): RequestLineInput {
  const catalogItemId =
    fields.catalogItemId === undefined
      ? item.catalogItemId
      : fields.catalogItemId;
  const basics = {
    id: item.id,
    quantity: fields.quantity ?? item.quantity,
    specs: fields.specs ?? item.specs,
  };
  if (catalogItemId !== null) {
    if (fields.nodeId !== undefined || fields.otherName !== undefined)
      throw invalidLine();
    return {
      ...basics,
      catalogItemId,
      unitId:
        fields.unitId ??
        (catalogItemId === item.catalogItemId ? item.unitId : undefined),
    };
  }
  const otherName = fields.otherName ?? item.otherName;
  if (otherName === null) throw invalidLine();
  return {
    ...basics,
    catalogItemId: null,
    otherName,
    unitId: fields.unitId ?? item.unitId,
    nodeId: fields.nodeId ?? item.nodeId,
  };
}

export function editPaused(
  ctx: Context,
  requestId: number,
  read: () => PausedEdit,
) {
  return runTransition(
    ctx,
    requestId,
    'editWhilePaused',
    read,
    async (state, { version, fields, remove, add = [], change = [] }) => {
      const items = new Map(state.items.map((item) => [item.id, item]));
      const edits = change.map(({ itemId, fields }) => {
        const item = items.get(itemId);
        if (!item || item.state === 'REMOVED') throw missing();
        return changeInput(item, fields);
      });
      const lines = await hydrateLines(
        ctx.tx,
        state.categoryId,
        [...add, ...edits],
        state.items,
      );
      return {
        command: {
          version,
          fields,
          remove,
          add: lines.slice(0, add.length),
          change: lines
            .slice(add.length)
            .map(({ id, ...fields }) => ({ itemId: id, fields })),
        },
      };
    },
  );
}
