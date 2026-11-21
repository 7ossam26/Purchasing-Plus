import { z } from 'zod';

import { id, pagination, pathId } from './access.js';
import { createCatalogItem } from './catalog/schemas.js';
import {
  displayedStages,
  quantity,
  requestStatuses,
  urgencies,
} from './lifecycle/model.js';

const header = z.strictObject({
  siteId: id,
  urgency: z.enum(urgencies).optional(),
  unitOrClient: z.string().max(300).nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
});
export const createRequestInput = header.extend({ categoryId: id });

const itemFields = { id: id.optional(), specs: z.string().max(4000), quantity };
const line = z.union([
  z.strictObject({ ...itemFields, catalogItemId: id, unitId: id.optional() }),
  z.strictObject({
    ...itemFields,
    catalogItemId: z.null().optional(),
    nodeId: id,
    unitId: id,
    otherName: z.string().trim().min(1).max(200),
  }),
]);
const items = z.array(line).max(250);
export type RequestLineInput = z.infer<typeof line>;

export const requestVersion = z.strictObject({
  version: z.number().int().nonnegative(),
});
export const saveDraftInput = header
  .partial()
  .extend({ ...requestVersion.shape, items });
export const editRequestInput = saveDraftInput
  .omit({ siteId: true })
  .partial({ items: true });
export const deleteDraftInput = requestVersion.extend({
  confirm: z.literal(true),
});
export const requestReasonInput = requestVersion.extend({
  reason: z.string().trim().min(1).max(4000),
});
export const requestUrgencyInput = requestVersion.extend({
  urgency: z.enum(urgencies),
});
export const requestQuantitiesInput = requestVersion.extend({
  lines: z
    .array(z.strictObject({ itemId: id, quantity }))
    .min(1)
    .max(250),
});
export const copyRequestInput = requestVersion.extend({
  siteId: id.optional(),
  itemIds: z.array(id).min(1).max(250).optional(),
});
export const addRequestItemToCatalogInput = createCatalogItem
  .omit({ isActive: true })
  .partial({ name: true, nodeId: true, unitId: true })
  .extend(requestVersion.shape);

const time = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
export const requestListInput = pagination.extend({
  status: z.enum(requestStatuses).optional(),
  stage: z.enum(displayedStages).optional(),
  siteId: pathId.optional(),
  categoryId: pathId.optional(),
  createdById: pathId.optional(),
  urgency: z.enum(urgencies).optional(),
  q: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z\d-]*$/i)
    .optional(),
  from: time.optional(),
  to: time.optional(),
});
export const recentRequestItemsInput = z.strictObject({ categoryId: pathId });
