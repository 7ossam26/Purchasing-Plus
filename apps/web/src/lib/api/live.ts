import type { EventType } from '@purchasing-plus/shared/events';
import type { Queue } from '@purchasing-plus/shared/lifecycle';

import { api } from './client.js';
import type { RecordPage } from './records.js';
import type { RequestSummary } from './requests.js';

export const inboxKey = ['inbox'] as const;
export const notificationsKey = ['notifications'] as const;
export type InboxQueue = { id: Queue; count: number; items: RequestSummary[] };
export type Notification = {
  id: number;
  requestId: number;
  number: string | null;
  type: EventType;
  createdAt: string;
  readAt: string | null;
};

export const liveApi = {
  inbox: (signal: AbortSignal) =>
    api<{ queues: InboxQueue[] }>('/inbox', { signal }),
  notifications: (page: number, signal: AbortSignal) =>
    api<RecordPage<Notification> & { unread: number }>(
      '/notifications?' + new URLSearchParams({ page: String(page) }),
      { signal },
    ),
  markRead: (id?: number) =>
    api<{ count: number }>(
      id === undefined
        ? '/notifications/read-all'
        : '/notifications/' + id + '/read',
      { method: 'POST', body: {} },
    ),
  ticket: (signal: AbortSignal) =>
    api<{ ticket: string }>('/events/ticket', {
      method: 'POST',
      body: {},
      signal,
    }),
  stream: (ticket: string, cursor: string | undefined) =>
    new EventSource(
      '/api/v1/events/stream?' +
        new URLSearchParams({
          ticket,
          ...(cursor === undefined ? {} : { after: cursor }),
        }),
    ),
};
