import type { Prisma } from '@prisma/client';
import { inSite } from '@purchasing-plus/shared/lifecycle';

import { allowed, type Viewer } from '../../middleware/access.js';

export const priceDetails = {
  id: true,
  unitPrice: true,
  source: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  request: { select: { number: true, siteId: true } },
} satisfies Prisma.CatalogItemPriceSelect;
export type PriceRecord = Prisma.CatalogItemPriceGetPayload<{
  select: typeof priceDetails;
}>;

export function toPriceDto(price: PriceRecord | null, viewer: Viewer) {
  if (!price) return null;
  return {
    unitPrice: price.unitPrice.toFixed(2),
    source: price.source,
    createdAt: price.createdAt,
    ...(inSite(viewer, price.request.siteId)
      ? { requestNumber: price.request.number }
      : {}),
    ...(allowed(viewer, 'requests.viewSupplierNames')
      ? { supplier: price.supplier }
      : {}),
  };
}
