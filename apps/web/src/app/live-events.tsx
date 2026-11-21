import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

import { ApiError } from '../lib/api/client.js';
import { roundKey } from '../lib/api/fulfilment.js';
import { inboxKey, liveApi, notificationsKey } from '../lib/api/live.js';
import { purchasingKey } from '../lib/api/purchasing.js';
import { requestKey, timelineKey } from '../lib/api/requests.js';

import { useSession } from './session.js';

export function LiveEvents() {
  const { profile } = useSession();
  const userId = profile?.user.id;
  const client = useQueryClient();
  useEffect(() => {
    if (userId === undefined || typeof EventSource === 'undefined') return;
    const controller = new AbortController();
    let stream: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let cursor: string | undefined;
    let delay = 500;

    function refresh(queryKey: QueryKey) {
      // TanStack reuses an unfinished first fetch even when invalidated.
      // Start a fresh read so a push during initial loading cannot be missed.
      void client
        .cancelQueries({
          queryKey,
          predicate: (query) => query.state.data === undefined,
        })
        .then(() => client.invalidateQueries({ queryKey }));
    }
    function invalidateNotifications() {
      refresh(notificationsKey);
    }
    function invalidateRequests(id?: number) {
      const keys =
        id === undefined
          ? [['requests'], ['purchasing']]
          : [
              requestKey(id),
              timelineKey(id),
              purchasingKey(id),
              roundKey(id),
              ['requests', 'list'],
              ['requests', 'recent'],
            ];
      for (const queryKey of [...keys, inboxKey]) refresh(queryKey);
    }
    function resume(event: MessageEvent<string>) {
      if (event.lastEventId) cursor = event.lastEventId;
      invalidateNotifications();
    }

    function reconnect() {
      stream?.close();
      if (controller.signal.aborted) return;
      clearTimeout(retry);
      retry = setTimeout(() => void connect(), delay);
      delay = Math.min(delay * 2, 15_000);
    }

    async function connect() {
      try {
        const { ticket } = await liveApi.ticket(controller.signal);
        if (controller.signal.aborted) return;
        stream = liveApi.stream(ticket, cursor);
        stream.onerror = reconnect;
        stream.addEventListener('ready', (event: MessageEvent<string>) => {
          delay = 500;
          resume(event);
          invalidateRequests();
        });
        stream.addEventListener('notification', resume);
        stream.addEventListener('notifications.read', invalidateNotifications);
        stream.addEventListener(
          'request.changed',
          (event: MessageEvent<string>) => {
            const { requestId } = JSON.parse(event.data) as {
              requestId: unknown;
            };
            if (typeof requestId === 'number') invalidateRequests(requestId);
          },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          void client.invalidateQueries({ queryKey: ['session', 'me'] });
          return;
        }
        reconnect();
      }
    }

    void connect();
    return () => {
      controller.abort();
      stream?.close();
      clearTimeout(retry);
    };
  }, [client, userId]);
  return null;
}
