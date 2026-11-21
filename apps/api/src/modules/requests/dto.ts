import { ar } from '@purchasing-plus/shared';
import {
  availableActions,
  eventPayloadSchemas,
  inSite,
  isFinal,
  stateCounts,
  unitPrice,
} from '@purchasing-plus/shared/lifecycle';

import { allowed, type Viewer } from '../../middleware/access.js';

import { toState, type RequestRecord } from './repo.js';

export function toRequestDto(row: RequestRecord, viewer: Viewer) {
  const state = toState(row);
  const { deliveryFee, items, copiedFromId } = state;
  const prices = allowed(viewer, 'requests.viewPrices');
  const suppliers = allowed(viewer, 'requests.viewSupplierNames');
  const supplierNames = suppliers
    ? new Map(row.items.map((item) => [item.id, item.supplier?.name ?? null]))
    : null;
  const returned =
    row.status === 'RETURNED' && row.createdById === viewer.userId
      ? eventPayloadSchemas.RETURNED_FOR_EDIT.safeParse(row.events[0]?.payload)
      : null;
  return {
    id: state.id,
    number: state.number,
    siteId: state.siteId,
    categoryId: state.categoryId,
    createdById: state.createdById,
    status: state.status,
    version: state.version,
    urgency: state.urgency,
    urgencyLocked: state.urgencyLocked,
    isModified: state.isModified,
    unitOrClient: state.unitOrClient,
    note: state.note,
    pausedById: state.pausedById,
    pauser: row.pauser,
    pausedAt: state.pausedAt,
    pauseReason: state.pauseReason,
    approvedById: state.approvedById,
    ...(returned?.success ? { returnReason: returned.data.reason } : {}),
    ...(prices ? { deliveryFee } : {}),
    ...(row.copiedFrom && inSite(viewer, row.copiedFrom.siteId)
      ? { copiedFromId }
      : {}),
    items: items
      .filter((item) => item.state !== 'REMOVED')
      .map(({ supplierId, lineTotal, pricedQuantity, ...item }) => ({
        ...item,
        isOther: item.catalogItemId === null,
        ...(prices
          ? {
              lineTotal,
              pricedQuantity,
              unitPrice:
                lineTotal === null
                  ? null
                  : unitPrice(lineTotal, pricedQuantity ?? item.quantity),
            }
          : {}),
        ...(supplierNames
          ? { supplierId, supplierName: supplierNames.get(item.id) }
          : {}),
      })),
    site: row.site,
    category: row.category,
    creator: row.creator,
    approver: row.approver,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    displayedStage: row.displayedStage,
    stageStartedAt: isFinal(row.status) ? null : row.stageStartedAt,
    stateCounts: stateCounts(state),
    availableActions: availableActions(state, viewer),
  };
}

const amountKeys = new Set([
  'lineTotal',
  'unitPrice',
  'roundTotal',
  'deliveryFee',
  'pricedQuantity',
]);
const supplierKeys = new Set([
  'supplierId',
  'supplierIds',
  'previousSupplierId',
]);
export function timelinePayload(
  type: string,
  payload: unknown,
  viewer: Viewer,
  visibleLinks: Set<number>,
) {
  const prices = allowed(viewer, 'requests.viewPrices');
  const suppliers = allowed(viewer, 'requests.viewSupplierNames');
  if (type === 'DELIVERY_FEE_CHANGED' && !prices) return {};
  if (
    (type === 'COPIED_TO' || type === 'COPIED_FROM') &&
    !visibleLinks.has((payload as { requestId: number }).requestId)
  )
    return {};
  function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        if (
          (!prices && amountKeys.has(key)) ||
          (!suppliers && supplierKeys.has(key))
        )
          return [];
        if (
          !suppliers &&
          (key === 'supplierName' || key === 'previousSupplierName')
        )
          return [[key, ar.requests.supplier]];
        // Snapshot attributes are catalog data with arbitrary display labels as keys.
        return [[key, key === 'attributes' ? child : redact(child)]];
      }),
    );
  }
  return redact(payload);
}
