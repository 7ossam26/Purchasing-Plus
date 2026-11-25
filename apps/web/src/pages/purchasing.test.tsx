import { defaultSettings } from '@purchasing-plus/shared';
import {
  ar,
  purchasingUi as copy,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import {
  itemStates,
  statusMap,
  type DisplayedStage,
  type RequestStatus,
} from '@purchasing-plus/shared/lifecycle';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { createQueryClient } from '../app/query.js';
import { routes } from '../app/routes.js';
import type { RequestDto } from '../lib/api/requests.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const site = { id: 5, name: 'المعادي', isActive: true };
// Every status except FULFILMENT is also its displayed stage; FULFILMENT rows pass one.
function row(
  id: number,
  status: RequestStatus,
  displayedStage = status as DisplayedStage,
): RequestDto {
  return {
    id,
    number: status === 'DRAFT' ? null : 'PR-2026-0000' + id,
    status,
    displayedStage,
    urgency: 'NORMAL',
    isModified: false,
    siteId: site.id,
    site,
    category: { id: 1, name: 'كهربا', isActive: true },
    creator: { id: 7, name: 'مينا' },
    stageStartedAt: '2026-11-20T10:00:00.000Z',
    stateCounts: Object.fromEntries(itemStates.map((state) => [state, 0])),
    items: [],
  } as unknown as RequestDto;
}
const rows = [
  row(1, 'DRAFT'),
  row(2, 'AWAITING_MANAGER'),
  row(3, 'RETURNED'),
  row(4, 'AT_PURCHASING'),
  row(6, 'FULFILMENT', 'AWAITING_RECEIPT'),
  row(8, 'COMPLETED'),
];
const page = (items: RequestDto[]) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
});

function setup(list: (params: URLSearchParams) => RequestDto[] = () => rows) {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input, 'http://localhost');
    if (url.pathname === '/api/v1/me')
      return Response.json({
        user: { id: 8, name: 'نور', username: 'buyer' },
        isSuperadmin: false,
        siteScope: 'ASSIGNED',
        sites: [site],
        permissions: ['requests.view', 'purchasing.sendRfq'],
      });
    if (url.pathname === '/api/v1/settings')
      return Response.json(defaultSettings);
    if (url.pathname === '/api/v1/requests')
      return Response.json(page(list(url.searchParams)));
    throw new Error('Unexpected GET ' + url.pathname);
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, {
    initialEntries: ['/purchasing'],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const lists = () =>
    fetch.mock.calls
      .map(([input]) => new URL(input, 'http://localhost'))
      .filter((url) => url.pathname === '/api/v1/requests');
  return { fetch, router, lists };
}

it('opens on every lifecycle state with each request’s current status', async () => {
  const { lists } = setup();
  const draft = await screen.findByRole('link', {
    name: new RegExp(statusMap.DRAFT.label),
  });
  expect(draft.getAttribute('href')).toBe('/requests/1');
  const links = screen.getAllByRole('link', { name: /PR-2026|مسودة/ });
  expect(links).toHaveLength(rows.length);
  // Each row carries its status chip. A draft also uses «مسودة» in place of its number.
  rows.forEach((request, index) =>
    expect(
      within(links[index]!).getAllByText(
        statusMap[request.displayedStage].label,
      ),
    ).toHaveLength(request.number ? 1 : 2),
  );
  // Only requests in a purchasing queue status open straight on the purchasing tab.
  expect(
    links.map((link) => link.getAttribute('href')?.endsWith('?tab=purchasing')),
  ).toEqual([false, false, false, true, true, false]);
  const [first] = lists();
  expect(first?.searchParams.get('workspace')).toBe('purchasing');
  expect(first?.searchParams.has('queue')).toBe(false);
  expect(first?.searchParams.has('stage')).toBe(false);
  expect(
    screen.getByRole('tab', { name: copy.allRequests, selected: true }),
  ).toBeTruthy();
  expect((await axe(document.body)).violations).toEqual([]);
});

it('narrows to actionable work or one stage and recovers from an empty filter', async () => {
  const { lists, router } = setup((params) =>
    params.get('queue')
      ? [rows[3]!]
      : params.get('stage') === 'RETURNED'
        ? [rows[2]!]
        : params.get('stage')
          ? []
          : rows,
  );
  await screen.findAllByRole('link', { name: /PR-2026|مسودة/ });
  fireEvent.click(screen.getByRole('tab', { name: copy.needsAction }));
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: /PR-2026/ })).toHaveLength(1),
  );
  expect(lists().at(-1)?.searchParams.get('queue')).toBe('purchasing');
  expect(lists().at(-1)?.searchParams.get('workspace')).toBe('purchasing');
  expect(router.state.location.search).toBe('?view=action');
  fireEvent.click(screen.getByRole('tab', { name: copy.allRequests }));
  fireEvent.change(await screen.findByLabelText(requestUi.stage), {
    target: { value: 'RETURNED' },
  });
  await waitFor(() =>
    expect(screen.getAllByRole('link', { name: /PR-2026/ })).toHaveLength(1),
  );
  expect(lists().at(-1)?.searchParams.get('stage')).toBe('RETURNED');
  expect(lists().at(-1)?.searchParams.has('queue')).toBe(false);
  fireEvent.change(screen.getByLabelText(requestUi.stage), {
    target: { value: 'COMPLETED' },
  });
  expect(await screen.findByText(requestUi.noMatches)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: ar.common.resetFilters }));
  expect(
    await screen.findAllByRole('link', { name: /PR-2026|مسودة/ }),
  ).toHaveLength(rows.length);
});

it('explains an empty workspace and an empty action queue separately', async () => {
  setup(() => []);
  expect(await screen.findByText(copy.emptyWorkspace)).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: copy.needsAction }));
  expect(await screen.findByText(copy.emptyQueue)).toBeTruthy();
});
