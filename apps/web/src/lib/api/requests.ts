import type {
  addRequestItemToCatalogInput,
  createRequestInput,
  RequestLineInput,
} from '@purchasing-plus/shared';
import type {
  ActionHint,
  ActionName,
  DisplayedStage,
  EventDraft,
  EventType,
  ItemState,
  RequestItem,
  RequestStatus,
  Urgency,
} from '@purchasing-plus/shared/lifecycle';

import type { CatalogItem, NamedRecord } from './catalog.js';
import { api } from './client.js';
import type {
  ActorSnapshot,
  Receipt,
  RoundSummary,
  SupplyOrder,
} from './fulfilment.js';
import { recordPath, type RecordPage } from './records.js';

type Named = Pick<NamedRecord, 'id' | 'name'>;
export type RequestLine = Omit<
  RequestItem,
  'supplierId' | 'lineTotal' | 'pricedQuantity'
> & {
  isOther: boolean;
  supplierId?: number | null;
  supplierName?: string | null;
  lineTotal?: string | null;
  unitPrice?: string | null;
  pricedQuantity?: string | null;
  outstanding?: string;
  resolvedBy?: ActorSnapshot;
};
export type RequestDto = {
  id: number;
  number: string | null;
  version: number;
  createdById: number;
  siteId: number;
  categoryId: number;
  status: RequestStatus;
  urgency: Urgency;
  urgencyLocked: boolean;
  isModified: boolean;
  unitOrClient: string | null;
  note: string | null;
  returnReason?: string;
  pauser?: Named | null;
  pausedAt?: string | null;
  pauseReason?: string | null;
  deliveryFee?: string | null;
  site: Named;
  category: Named;
  creator: Named;
  displayedStage: DisplayedStage;
  stageStartedAt: string | null;
  stateCounts: Record<ItemState, number>;
  rounds?: RoundSummary[];
  supplyOrders?: SupplyOrder[];
  receipts?: Receipt[];
  items: RequestLine[];
  availableActions: { action: ActionName; hint: ActionHint }[];
};
export type RequestSummary = Pick<
  RequestDto,
  | 'id'
  | 'number'
  | 'urgency'
  | 'isModified'
  | 'displayedStage'
  | 'stageStartedAt'
  | 'site'
  | 'category'
  | 'creator'
  | 'stateCounts'
>;
export type RequestEvent = {
  [T in EventType]: Omit<EventDraft<T>, 'payload'> & {
    payload: Partial<EventDraft<T>['payload']>;
  };
}[EventType] & {
  batch?: {
    lineNos: number[];
    suppliers: { name: string; sentAt: string | null }[];
  };
  id: number;
  actorName: string | null;
  actorRoleName: string | null;
};
export type RequestOptions = {
  sites: NamedRecord[];
  categories: (NamedRecord & { iconKey: string | null })[];
  units: NamedRecord[];
};
export type RequestEdit = {
  version: number;
  urgency?: Urgency;
  unitOrClient?: string | null;
  note?: string | null;
  items?: RequestLineInput[];
};
export type RequestCommand =
  | 'submit'
  | 'resubmit'
  | 'approve'
  | 'reject'
  | 'return'
  | 'urgency'
  | 'copy'
  | 'cancel'
  | 'pause'
  | 'resume'
  | 'purchasing-return';
const path = (id: number) => '/requests/' + id;
export const requestKey = (id: number) => ['requests', 'detail', id] as const;
export const timelineKey = (id: number) =>
  ['requests', 'timeline', id] as const;
export const requestApi = {
  list: (
    filters: Record<string, string | number | undefined>,
    signal: AbortSignal,
  ) =>
    api<RecordPage<RequestDto>>(recordPath('/requests', filters), { signal }),
  get: (id: number, signal?: AbortSignal) =>
    api<RequestDto>(path(id), { signal }),
  options: (signal: AbortSignal) =>
    api<RequestOptions>('/requests/options', { signal }),
  create: (body: ReturnType<typeof createRequestInput.parse>) =>
    api<RequestDto>('/requests', { method: 'POST', body }),
  save: (id: number, body: RequestEdit, draft: boolean) =>
    api<RequestDto>(path(id) + (draft ? '/draft' : ''), {
      method: 'PATCH',
      body,
    }),
  command: (
    id: number,
    command: RequestCommand,
    body: {
      version: number;
      reason?: string;
      urgency?: Urgency;
      siteId?: number;
      itemIds?: number[];
      roundNo?: number;
    },
  ) => api<RequestDto>(path(id) + '/' + command, { method: 'POST', body }),
  remove: (id: number, version: number) =>
    api<void>(path(id), { method: 'DELETE', body: { version, confirm: true } }),
  quantities: (
    id: number,
    version: number,
    lines: { itemId: number; quantity: string }[],
  ) =>
    api<RequestDto>(path(id) + '/quantities', {
      method: 'PATCH',
      body: { version, lines },
    }),
  convert: (
    id: number,
    lineId: number,
    body: ReturnType<typeof addRequestItemToCatalogInput.parse>,
  ) =>
    api<RequestDto>(path(id) + '/items/' + lineId + '/add-to-catalog', {
      method: 'POST',
      body,
    }),
  timeline: (id: number, signal?: AbortSignal) =>
    api<{ items: RequestEvent[] }>(path(id) + '/timeline', { signal }),
  recent: (categoryId: number, signal?: AbortSignal) =>
    api<{ items: CatalogItem[] }>(
      recordPath('/requests/recent-items', { categoryId }),
      { signal },
    ),
};
