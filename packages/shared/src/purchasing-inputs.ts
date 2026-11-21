import { z } from 'zod';

import { id, pagination, pathId } from './access.js';
import { amount, quantity } from './lifecycle/model.js';
import { requestVersion } from './request-inputs.js';

const ids = z.array(id).min(1).max(250);
const message = z.string().trim().min(1).max(65536);
export const createRfqInput = requestVersion.extend({
  itemIds: ids,
  supplierIds: ids,
  message,
});
export const editRfqMessageInput = requestVersion.extend({ message });
export const repriceRemainingInput = requestVersion.extend({
  supplierId: id,
  lineTotal: quantity,
});
export const receiptInput = requestVersion.extend({
  note: z.string().trim().max(4000).optional(),
  lines: z
    .array(
      z.strictObject({
        itemId: id,
        quantity,
        note: z.string().trim().max(4000).optional(),
      }),
    )
    .min(1)
    .max(250),
});
export const priceRequestItemInput = z.union([
  repriceRemainingInput,
  requestVersion.extend({ supplierId: z.null(), lineTotal: z.null() }),
]);
export const itemAvailabilityInput = requestVersion.extend({
  note: z.string().trim().max(4000).optional(),
});
export const deliveryFeeInput = requestVersion.extend({
  deliveryFee: amount.nullable(),
});
export const purchasingViewInput = z.strictObject({
  itemIds: z
    .string()
    .max(3000)
    .transform((value) => (value ? value.split(',') : []))
    .pipe(z.array(pathId).max(250))
    .optional(),
});
export const purchasingSupplierInput = pagination.extend({
  q: z.string().trim().max(100).optional(),
});
