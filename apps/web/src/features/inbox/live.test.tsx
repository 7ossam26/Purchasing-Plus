import { ar, liveUi as copy } from '@purchasing-plus/shared/i18n/ar';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';

import { createQueryClient } from '../../app/query.js';
import { AppProviders } from '../../app/routes.js';
import { requestKey } from '../../lib/api/requests.js';

import { NotificationBell } from './bell.js';
import { HomeInbox } from './home-inbox.js';

class FakeStream extends EventTarget {
  static instances: FakeStream[] = [];
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    super();
    FakeStream.instances.push(this);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeStream.instances = [];
});

it('updates the inbox and bell on push, opens and reads the notification, and reopens with a fresh ticket and cursor', async () => {
  vi.stubGlobal('EventSource', FakeStream);
  const site = { id: 1, name: 'موقع شرق', isActive: true };
  const profile = {
    user: { id: 9, name: 'هبة', username: 'user' },
    siteScope: 'ASSIGNED',
    sites: [site],
    permissions: ['requests.view', 'requests.create', 'requests.approve'],
  };
  const request = {
    id: 41,
    number: 'PR-2026-000041',
    urgency: 'URGENT',
    isModified: true,
    displayedStage: 'AWAITING_MANAGER',
    stageStartedAt: '2026-01-01T10:00:00Z',
    site,
    category: { id: 2, name: 'كهربا' },
    creator: { id: 3, name: 'عمرو' },
    stateCounts: { OPEN: 3 },
  };
  const notice = {
    id: 72,
    requestId: 41,
    number: request.number,
    type: 'SUBMITTED',
    createdAt: '2026-01-01T10:00:00Z',
    readAt: null,
  };
  let count = 0;
  let tickets = 0;
  let notificationFetches = 0;
  let finishFirstFetch!: () => void;
  const firstFetch = new Promise<void>((resolve) => {
    finishFirstFetch = resolve;
  });
  let items: (Omit<typeof notice, 'readAt'> & { readAt: string | null })[] = [];
  const fetch = vi.fn(async (path: string) => {
    switch (path) {
      case '/api/v1/me':
        return Response.json(profile);
      case '/api/v1/settings':
        return Response.json({ agingDays: 3 });
      case '/api/v1/events/ticket':
        return Response.json(
          { ticket: 'ticket-' + ++tickets },
          { status: 201 },
        );
      case '/api/v1/inbox':
        return Response.json({
          queues: [
            { id: 'drafts', count: 0, items: [] },
            { id: 'manager', count, items: count ? [request] : [] },
          ],
        });
      case '/api/v1/notifications?page=1': {
        const response = Response.json({
          page: 1,
          pageSize: 30,
          total: items.length,
          items,
          unread: items.filter((entry) => !entry.readAt).length,
        });
        if (++notificationFetches === 1) await firstFetch;
        return response;
      }
      case '/api/v1/notifications/72/read':
      case '/api/v1/notifications/read-all':
        items = items.map((entry) => ({
          ...entry,
          readAt: new Date().toISOString(),
        }));
        return Response.json({ count: 1 });
      default:
        throw new Error('Unexpected endpoint ' + path);
    }
  });
  vi.stubGlobal('fetch', fetch);
  const client = createQueryClient();
  client.setQueryData(requestKey(41), {});
  client.setQueryData(requestKey(44), {});
  const router = createMemoryRouter([
    {
      element: <AppProviders />,
      children: [
        {
          path: '/',
          element: (
            <>
              <NotificationBell />
              <HomeInbox />
            </>
          ),
        },
        { path: '/requests/41', element: <NotificationBell /> },
      ],
    },
  ]);
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole('tab', { name: /مسوداتي/ });
  expect(
    within(screen.getByRole('tabpanel', { name: /مسوداتي/ })).getByText(
      copy.emptyInbox,
    ),
  ).toBeTruthy();
  await waitFor(() => expect(FakeStream.instances).toHaveLength(1));
  const [stream] = FakeStream.instances;
  expect(stream!.url).toContain('ticket=ticket-1');
  await waitFor(() => expect(notificationFetches).toBe(1));

  items = [notice];
  count = 1;
  act(() => {
    stream!.dispatchEvent(
      new MessageEvent('request.changed', {
        data: JSON.stringify({ requestId: 41 }),
      }),
    );
    stream!.dispatchEvent(
      new MessageEvent('notification', { data: '{}', lastEventId: '72' }),
    );
  });
  expect(await screen.findByText(copy.unread('1'))).toBeTruthy();
  finishFirstFetch();
  expect(await screen.findByText(request.number)).toBeTruthy();
  expect(
    screen
      .getByRole('tab', { name: /بانتظار موافقتي/ })
      .getAttribute('aria-selected'),
  ).toBe('true');
  expect(client.getQueryState(requestKey(41))?.isInvalidated).toBe(true);
  expect(client.getQueryState(requestKey(44))?.isInvalidated).toBe(false);

  fireEvent.click(
    screen.getByRole('button', { name: ar.navigation.notifications }),
  );
  const menu = screen.getByRole('region', {
    name: ar.navigation.notifications,
  });
  fireEvent.click(
    within(menu).getByRole('link', {
      name: new RegExp(ar.lifecycle.events.SUBMITTED),
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/requests/41'),
  );
  expect(await screen.findByText(copy.unread('0'))).toBeTruthy();
  expect(
    fetch.mock.calls.some(([path]) => path.endsWith('/notifications/72/read')),
  ).toBe(true);
  expect(FakeStream.instances).toHaveLength(1);

  items = [{ ...notice, id: 73 }];
  act(() =>
    stream!.dispatchEvent(
      new MessageEvent('notification', { data: '{}', lastEventId: '73' }),
    ),
  );
  expect(await screen.findByText(copy.unread('1'))).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: ar.navigation.notifications }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: copy.markAllRead }),
  );
  expect(await screen.findByText(copy.unread('0'))).toBeTruthy();

  act(() => stream!.onerror?.());
  await waitFor(() => expect(FakeStream.instances).toHaveLength(2), {
    timeout: 2_000,
  });
  expect(stream!.close).toHaveBeenCalledOnce();
  expect(FakeStream.instances[1]!.url).toContain('ticket=ticket-2&after=73');
});
