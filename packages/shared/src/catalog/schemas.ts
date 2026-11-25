import { z } from 'zod';

import { id, pagination, pathId } from '../access.js';
import { amount } from '../lifecycle/model.js';

import { normalizeArabic } from './normalize.js';

const text = z.string().refine((value) => !value.includes('\0'));
const name = text.trim().min(1).max(200);
const description = text.trim().max(2000);
const contactPerson = text.trim().max(200);
const active = z.enum(['true', 'false']).transform((value) => value === 'true');
const codePrefix = z.string().regex(/^[A-Z]{2,5}$/);
const iconKey = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
  .max(60);
const uniqueIds = z.array(id).refine((ids) => new Set(ids).size === ids.length);
const changes = (input: object) => Object.keys(input).length > 0;

const catalogPagination = pagination.extend({
  page: pathId
    .pipe(z.number().max(Math.floor(2147483647 / 100) + 1))
    .default(1),
});
export const catalogListFilters = catalogPagination.extend({
  active: active.optional(),
});
export const nodeListFilters = z.strictObject({ active: active.optional() });
export const itemVisibility = z.strictObject({
  includeInactive: active.default(false),
});
export const browseItemFilters = catalogListFilters.extend(
  itemVisibility.shape,
);
export const catalogSearchFilters = browseItemFilters.extend({
  categoryId: pathId,
  q: text.max(200).transform(normalizeArabic).pipe(z.string().min(1)),
});

export const createCategory = z.strictObject({ name, codePrefix, iconKey });
export const createGroup = z.strictObject({ name, parentId: id });
export const editCatalogNode = z
  .strictObject({
    name: name.optional(),
    codePrefix: codePrefix.optional(),
    iconKey: iconKey.optional(),
    isActive: z.literal(true).optional(),
  })
  .refine(changes);
export const reorderCatalogNodes = z.strictObject({
  parentId: id.nullable(),
  ids: uniqueIds,
});
export const moveCatalogNode = z.strictObject({ parentId: id });

export const attributeType = z.enum(['TEXT', 'NUMBER', 'SELECT']);
const optionLabels = z
  .array(name)
  .refine((options) => new Set(options).size === options.length);
const unitLabel = name.nullable();
const clientVisible = z.boolean().optional();
export const imageOrder = z.strictObject({
  ids: z
    .array(id)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length),
});

export const createAttribute = z.discriminatedUnion('type', [
  z.strictObject({ name, type: z.literal('TEXT'), clientVisible }),
  z.strictObject({
    name,
    type: z.literal('NUMBER'),
    clientVisible,
    unitLabel: unitLabel.optional(),
  }),
  z.strictObject({
    name,
    type: z.literal('SELECT'),
    options: optionLabels,
    clientVisible,
  }),
]);
export const editAttribute = z
  .strictObject({
    name: name.optional(),
    type: attributeType.optional(),
    clientVisible,
    unitLabel: unitLabel.optional(),
    isActive: z.literal(true).optional(),
  })
  .refine(changes);
export const createAttributeOption = z.strictObject({ label: name });
export const editAttributeOption = z
  .strictObject({
    label: name.optional(),
    isActive: z.literal(true).optional(),
  })
  .refine(changes);
export const reorderAttributeOptions = z.strictObject({ ids: uniqueIds });
export const setNodeAttributes = z.strictObject({ attributeIds: uniqueIds });

export const createUnit = z.strictObject({ name });
export const editUnit = z
  .strictObject({
    name: name.optional(),
    isActive: z.literal(true).optional(),
  })
  .refine(changes);

const itemValue = z.strictObject({
  attributeId: id,
  value: z.union([description.min(1), id]),
});
const attributeValues = z
  .array(itemValue)
  .refine(
    (values) =>
      new Set(values.map(({ attributeId }) => attributeId)).size ===
      values.length,
  );
export const catalogAttributeNumber = z
  .string()
  .regex(/^[+-]?[0-9]{1,26}(?:\.[0-9]{1,12})?$/);
// A manually entered reference price in EGP, a Decimal(14,2) string. Null means "not set" and
// stays distinct from an explicit "0.00". It never feeds quotations, rounds or order totals.
export const catalogUnitPrice = amount.nullable();
export const createCatalogItem = z.strictObject({
  name,
  nodeId: id,
  unitId: id,
  description: description.default(''),
  attributeValues: attributeValues.default([]),
  unitPrice: catalogUnitPrice.optional(),
  isActive: z.literal(false).optional(),
});
const catalogItemEdit = z.strictObject({
  name: name.optional(),
  unitId: id.optional(),
  description: description.optional(),
  attributeValues: attributeValues.optional(),
  unitPrice: catalogUnitPrice.optional(),
  isActive: z.literal(true).optional(),
});
export const editCatalogItem = catalogItemEdit.refine(changes);
export const editCatalogItemInEditor = catalogItemEdit
  .extend({ nodeId: id.optional(), isActive: z.boolean().optional() })
  .refine(changes);
export const moveCatalogItem = z.strictObject({ nodeId: id });

export const createSupplier = z.strictObject({
  name,
  contactPerson: contactPerson.default(''),
  whatsappNumber: z.string().max(100),
  categoryIds: uniqueIds.refine((ids) => ids.length > 0),
  notes: description.default(''),
  isActive: z.literal(false).optional(),
});
export const editSupplier = createSupplier
  .partial()
  .extend({
    contactPerson: contactPerson.optional(),
    notes: description.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(changes);
export const supplierFilters = catalogListFilters
  .extend({ categoryId: pathId.optional() })
  .refine(
    ({ categoryId, active }) => categoryId === undefined || active !== false,
  );
