import {
  defaultSettings,
  type RequestLineInput,
} from '@purchasing-plus/shared';
import {
  ar,
  masterData,
  requestUi as copy,
} from '@purchasing-plus/shared/i18n/ar';
import { itemStates, statusMap } from '@purchasing-plus/shared/lifecycle';
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

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type { CatalogItem, Folder } from '../../lib/api/catalog.js';
import type {
  RequestDto,
  RequestEdit,
  RequestLine,
} from '../../lib/api/requests.js';

import { StageRail } from './summary.js';

const site = { id: 5, name: 'المعادي', isActive: true };
const unit = { id: 8, name: 'متر', isActive: true };
const substitute = { id: 9, name: 'قطعة', isActive: true };
const category: Folder = {
  id: 1,
  name: 'كهربا',
  isActive: true,
  iconKey: 'zap',
  parentId: null,
  codePrefix: 'ELC',
  path: '/1/',
  childGroupCount: 1,
  subtreeItemCount: 1,
  coverThumbs: [],
};
const group: Folder = {
  ...category,
  id: 2,
  name: 'الأسلاك',
  path: '/1/2/',
  parentId: 1,
  childGroupCount: 0,
  iconKey: null,
};
const item: CatalogItem = {
  id: 11,
  name: 'سلك نحاس',
  code: 'ELC-0011',
  description: '',
  nodeId: 2,
  nodePath: [category, group],
  isActive: true,
  unitId: unit.id,
  unit,
  images: [],
  attributeValues: [
    {
      attributeId: 1,
      attribute: {
        id: 1,
        name: 'اللون',
        isActive: true,
        type: 'TEXT',
        unitLabel: null,
      },
      value: 'أبيض مط',
      option: null,
    },
  ],
};
const page = <T,>(items: T[]) => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 25,
});
const draftActions: RequestDto['availableActions'] = [
  { action: 'saveDraft', hint: 'secondary' },
  { action: 'deleteDraft', hint: 'danger' },
];
const creator = { id: 7, name: 'منى' };
const initial: RequestDto = {
  id: 10,
  number: null,
  version: 1,
  createdById: creator.id,
  siteId: site.id,
  categoryId: category.id,
  status: 'DRAFT',
  displayedStage: 'DRAFT',
  stageStartedAt: null,
  urgency: 'NORMAL',
  urgencyLocked: false,
  isModified: false,
  unitOrClient: null,
  note: null,
  site,
  category,
  creator,
  stateCounts: Object.fromEntries(
    itemStates.map((state) => [state, 0]),
  ) as RequestDto['stateCounts'],
  items: [],
  availableActions: draftActions,
};
const basePermissions = [
  'requests.view',
  'requests.create',
  'catalog.view',
  'requests.viewTimeline',
];
const path = '/api/v1/requests';
const detail = path + '/10';
function requestLine(input: RequestLineInput, index: number): RequestLine {
  const other = 'otherName' in input;
  const unitId = input.unitId ?? unit.id;
  return {
    id: input.id ?? index + 100,
    lineNo: index + 1,
    catalogItemId: input.catalogItemId ?? null,
    nodeId: other ? input.nodeId : item.nodeId,
    unitId,
    isOther: other,
    otherName: other ? input.otherName : null,
    quantity: input.quantity,
    specs: input.specs,
    state: 'OPEN',
    receivedQty: '0',
    snapshot: {
      name: other ? input.otherName : item.name,
      code: other ? null : item.code,
      unitName: unitId === unit.id ? unit.name : substitute.name,
      attributes: {},
      nodePath: [category.name, group.name],
      coverImageKey: null,
    },
    unavailableNote: null,
    needsRepricing: false,
    modifiedAfterSend: false,
  };
}
function setup(
  url: string,
  settings: {
    initial?: RequestDto;
    permissions?: string[];
    failSave?: boolean;
    conflict?: boolean;
  } = {},
) {
  let record = settings.initial ?? initial;
  let didFail = false;
  const saved: RequestEdit[] = [];
  const sent: { verb: string; body: object }[] = [];
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const route = new URL(input, 'http://localhost').pathname;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (route === '/api/v1/me')
      return Response.json({
        user: { ...creator, username: 'engineer' },
        isSuperadmin: false,
        siteScope: 'ASSIGNED',
        sites: [site],
        permissions: settings.permissions ?? basePermissions,
      });
    if (route === '/api/v1/settings') return Response.json(defaultSettings);
    if (route === path && method === 'POST') {
      sent.push({ verb: 'create', body });
      return Response.json(record);
    }
    if (route === path) return Response.json(page([]));
    if (route === path + '/options')
      return Response.json({
        sites: [site],
        categories: [category],
        units: [unit, substitute],
      });
    if (route === path + '/recent-items')
      return Response.json({ items: [item] });
    if (route === detail) return Response.json(record);
    if (route === detail + '/timeline') return Response.json({ items: [] });
    if (route === detail + '/draft') {
      saved.push(body);
      if (settings.failSave && !didFail) {
        didFail = true;
        return Response.json(
          {
            message: 'فشل الحفظ التجريبي',
            error: 'SAVE_FAILED',
            fix: 'جرّب تاني',
          },
          { status: 422 },
        );
      }
      const items = (body as RequestEdit).items!.map(requestLine);
      record = {
        ...record,
        items,
        version: record.version + 1,
        availableActions: items.length
          ? [{ action: 'submit', hint: 'primary' }, ...draftActions]
          : draftActions,
      };
      return Response.json(record);
    }
    if (route.startsWith(detail + '/')) {
      const verb = route.split('/').at(-1)!;
      sent.push({ verb, body });
      if (settings.conflict) {
        record = {
          ...record,
          availableActions: [],
          version: record.version + 1,
          status: 'AT_PURCHASING',
          displayedStage: 'AT_PURCHASING',
        };
        return Response.json(
          {
            error: 'VERSION_CONFLICT',
            message: ar.lifecycle.errors.VERSION_CONFLICT,
          },
          { status: 409 },
        );
      }
      const status = verb === 'submit' ? 'AWAITING_MANAGER' : 'REJECTED';
      record = {
        ...record,
        version: record.version + 1,
        number: 'PR-2026-00001',
        status,
        displayedStage: status,
        availableActions: [],
      };
      return Response.json(record);
    }
    if (route === '/api/v1/catalog/categories')
      return Response.json([category]);
    if (route === '/api/v1/catalog/nodes/1')
      return Response.json({ ...category, breadcrumb: [category] });
    if (route === '/api/v1/catalog/nodes/2')
      return Response.json({ ...group, breadcrumb: [category, group] });
    if (route === '/api/v1/catalog/nodes/1/children')
      return Response.json([group]);
    if (route === '/api/v1/catalog/nodes/2/children') return Response.json([]);
    if (route === '/api/v1/catalog/nodes/1/items')
      return Response.json(page([]));
    if (route === '/api/v1/catalog/nodes/2/items')
      return Response.json(page([item]));
    throw new Error('Unexpected API ' + method + ' ' + route);
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, { initialEntries: [url] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetch, saved, sent, router };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('creates a draft, browses a folder, adds a catalog item, reviews and submits the exact saved version', async () => {
  const { sent, saved } = setup('/requests');
  fireEvent.click(await screen.findByRole('button', { name: copy.newRequest }));
  const create = screen.getByRole('dialog', { name: copy.newRequest });
  expect(within(create).queryByRole('group', { name: copy.site })).toBeNull();
  fireEvent.click(
    await within(create).findByRole('button', { name: category.name }),
  );
  await waitFor(() =>
    expect(sent[0]).toEqual({
      verb: 'create',
      body: { siteId: site.id, categoryId: category.id },
    }),
  );
  expect(
    await screen.findByRole('heading', { name: copy.recent }),
  ).toBeTruthy();
  fireEvent.click(
    await screen.findByRole('link', { name: new RegExp(group.name) }),
  );
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(item.name) }),
  );
  const sheet = screen.getByRole('dialog', { name: item.name });
  expect(within(sheet).getByLabelText<HTMLInputElement>(copy.specs).value).toBe(
    'أبيض مط',
  );
  fireEvent.change(within(sheet).getByLabelText(copy.quantity), {
    target: { value: '2.25' },
  });
  fireEvent.change(within(sheet).getByLabelText(copy.unit), {
    target: { value: String(substitute.id) },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: copy.addItem }));
  expect(screen.getByText(copy.basket('1'))).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: copy.review }));
  expect(
    await screen.findByRole('heading', { name: copy.reviewTitle }),
  ).toBeTruthy();
  expect(screen.getByText('أبيض مط', { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: copy.submit }));
  expect(
    await screen.findByRole('heading', { name: 'PR-2026-00001' }),
  ).toBeTruthy();
  expect(saved[0]?.items).toEqual([
    {
      catalogItemId: item.id,
      unitId: substitute.id,
      quantity: '2.25',
      specs: 'أبيض مط',
    },
  ]);
  expect(sent.at(-1)).toEqual({ verb: 'submit', body: { version: 2 } });
});

it('offers to combine an identical material and sends a decimal sum', async () => {
  const { saved } = setup('/requests/10/add/node/2', {
    initial: {
      ...initial,
      items: [
        requestLine(
          { catalogItemId: item.id, quantity: '1.25', specs: 'أبيض مط' },
          0,
        ),
      ],
    },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(item.name) }),
  );
  const sheet = screen.getByRole('dialog');
  fireEvent.change(within(sheet).getByLabelText(copy.quantity), {
    target: { value: '0.25' },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: copy.addItem }));
  expect(within(sheet).getByText(copy.duplicate)).toBeTruthy();
  fireEvent.click(
    within(sheet).getByRole('button', { name: copy.increaseExisting }),
  );
  expect(screen.getByText(copy.basket('1'))).toBeTruthy();
  await waitFor(
    () =>
      expect(saved[0]?.items?.[0]).toMatchObject({ id: 100, quantity: '1.50' }),
    { timeout: 2400 },
  );
});

it('uses the open folder for Other, debounces autosave and preserves failed entries for retry', async () => {
  const { saved } = setup('/requests/10/add/node/2', { failSave: true });
  fireEvent.click(
    await screen.findByRole('button', { name: masterData.other }),
  );
  const sheet = screen.getByRole('dialog', { name: copy.addOther });
  fireEvent.change(await within(sheet).findByLabelText(copy.itemName), {
    target: { value: 'عينة خاصة' },
  });
  fireEvent.change(within(sheet).getByLabelText(copy.unit), {
    target: { value: String(unit.id) },
  });
  fireEvent.click(within(sheet).getByRole('button', { name: copy.addItem }));
  fireEvent.click(screen.getByRole('link', { name: copy.review }));
  await screen.findByRole('heading', { name: copy.reviewTitle });
  fireEvent.change(screen.getByLabelText(copy.client), {
    target: { value: 'وحدة 2' },
  });
  expect(saved).toHaveLength(0);
  expect(
    await screen.findByText('فشل الحفظ التجريبي', {}, { timeout: 2400 }),
  ).toBeTruthy();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    unitOrClient: 'وحدة 2',
    items: [{ nodeId: group.id, unitId: unit.id, otherName: 'عينة خاصة' }],
  });
  fireEvent.click(
    within(screen.getByRole('alert')).getByRole('button', {
      name: ar.common.retry,
    }),
  );
  expect(await screen.findByText(copy.saved, { exact: true })).toBeTruthy();
  expect(saved).toHaveLength(2);
});

const waiting: RequestDto = {
  ...initial,
  status: 'AWAITING_MANAGER',
  number: 'PR-2026-00001',
  displayedStage: 'AWAITING_MANAGER',
  items: [requestLine({ catalogItemId: item.id, quantity: '2', specs: '' }, 0)],
  availableActions: [
    { action: 'reject', hint: 'danger' },
    { action: 'raiseUrgency', hint: 'secondary' },
  ],
};
it('uses only the DTO actions, requires a rejection reason and refetches on a version conflict', async () => {
  const { sent, fetch } = setup('/requests/10', {
    initial: waiting,
    conflict: true,
    permissions: [
      ...basePermissions,
      'requests.approve',
      'requests.reject',
      'requests.raiseUrgency',
    ],
  });
  await screen.findByRole('heading', { name: waiting.number! });
  for (const label of [
    copy.approve,
    copy.edit,
    copy.deleteDraft,
    copy.resubmit,
    copy.copy,
  ])
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: ar.common.more }));
  const overflow = screen.getByRole('dialog', { name: ar.common.more });
  expect(
    within(overflow).getByRole('button', { name: copy.raiseUrgency }),
  ).toBeTruthy();
  fireEvent.click(within(overflow).getByRole('button', { name: copy.reject }));
  const reason = screen.getByRole('dialog', { name: copy.reject });
  const submit = within(reason).getByRole<HTMLButtonElement>('button', {
    name: copy.reject,
  });
  expect(submit.disabled).toBe(true);
  fireEvent.change(within(reason).getByLabelText(ar.dialogs.reason), {
    target: { value: 'راجع البنود' },
  });
  fireEvent.click(submit);
  expect(
    await screen.findByText(ar.lifecycle.errors.VERSION_CONFLICT),
  ).toBeTruthy();
  expect(sent).toEqual([
    { verb: 'reject', body: { version: 1, reason: 'راجع البنود' } },
  ]);
  await waitFor(() =>
    expect(
      fetch.mock.calls.filter(([url]) => url === detail).length,
    ).toBeGreaterThan(1),
  );
  expect(screen.queryByRole('button', { name: ar.common.more })).toBeNull();
});

it('shows only the higher urgency choice after a lock', async () => {
  const { sent } = setup('/requests/10', {
    initial: {
      ...waiting,
      urgency: 'URGENT',
      urgencyLocked: true,
      availableActions: [{ action: 'raiseUrgency', hint: 'secondary' }],
    },
  });
  fireEvent.click(await screen.findByRole('button', { name: ar.common.more }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: copy.raiseUrgency,
    }),
  );
  const dialog = screen.getByRole('dialog', { name: copy.raiseUrgency });
  expect(
    within(dialog).queryByRole('button', { name: statusMap.NORMAL.label }),
  ).toBeNull();
  expect(
    within(dialog).queryByRole('button', {
      name: statusMap.URGENT.label,
    }),
  ).toBeNull();
  fireEvent.click(
    within(dialog).getByRole('button', { name: statusMap.VERY_URGENT.label }),
  );
  fireEvent.click(
    within(dialog).getByRole('button', { name: copy.raiseUrgency }),
  );
  await waitFor(() =>
    expect(sent).toEqual([
      { verb: 'urgency', body: { version: 1, urgency: 'VERY_URGENT' } },
    ]),
  );
});

it('marks completed, current and future rail segments with a returned marker on the manager step', () => {
  render(<StageRail stage="RETURNED" at={null} />);
  const segments = screen.getAllByRole('listitem');
  expect(segments).toHaveLength(6);
  expect(segments.map((item) => item.dataset.state)).toEqual([
    'completed',
    'current',
    'future',
    'future',
    'future',
    'future',
  ]);
  expect(segments[1]?.getAttribute('aria-current')).toBe('step');
  expect(segments[1]?.querySelector('.rotate-45')).toBeTruthy();
  expect(screen.getByText(statusMap.RETURNED.label)).toBeTruthy();
});

it('goes from purchasing straight to receipt on the rail, with no pricing approval step', () => {
  render(<StageRail stage="AWAITING_RECEIPT" at={null} />);
  const segments = screen.getAllByRole('listitem');
  expect(segments.map((item) => item.getAttribute('aria-label'))).toEqual(
    [
      'DRAFT',
      'AWAITING_MANAGER',
      'AT_PURCHASING',
      'AWAITING_RECEIPT',
      'REMAINING',
      'COMPLETED',
    ].map((id) => expect.stringContaining(statusMap[id as 'DRAFT'].label)),
  );
  expect(segments[3]?.getAttribute('aria-current')).toBe('step');
  expect(screen.queryByText(statusMap.AWAITING_APPROVAL.label)).toBeNull();
  cleanup();
  // A request rejected at the former approval step ends the rail at purchasing.
  render(
    <StageRail stage="REJECTED" at={null} terminalFrom="AWAITING_APPROVAL" />,
  );
  expect(
    screen.getAllByRole('listitem').map((item) => item.dataset.state),
  ).toEqual(['completed', 'completed', 'current']);
});

it('opens someone else’s draft read-only for a stakeholder who follows the site', async () => {
  const { router, saved, sent } = setup('/requests/10', {
    initial: {
      ...initial,
      createdById: 99,
      creator: { id: 99, name: 'مهندس الموقع' },
      items: [
        requestLine(
          { catalogItemId: item.id, quantity: '3', specs: 'أبيض مط' },
          0,
        ),
      ],
      availableActions: [],
    },
    permissions: [
      'requests.view',
      'requests.viewPrices',
      'requests.viewSupplierNames',
      'requests.viewTimeline',
    ],
  });
  expect(
    await screen.findByRole('heading', { name: statusMap.DRAFT.label }),
  ).toBeTruthy();
  expect(
    screen.getByRole('heading', { name: item.name, level: 2 }),
  ).toBeTruthy();
  expect(screen.getByText('مهندس الموقع', { exact: false })).toBeTruthy();
  expect(screen.getByRole('tab', { name: copy.timeline })).toBeTruthy();
  for (const label of [
    copy.continueDraft,
    copy.deleteDraft,
    copy.submit,
    copy.edit,
    copy.copy,
  ])
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  expect(screen.queryByRole('button', { name: ar.common.more })).toBeNull();
  expect(router.state.location.pathname).toBe('/requests/10');
  expect(saved).toEqual([]);
  expect(sent).toEqual([]);
});

it('shows a returned note to the creator while keeping the timeline hidden without the key', async () => {
  setup('/requests/10', {
    initial: {
      ...waiting,
      status: 'RETURNED',
      displayedStage: 'RETURNED',
      returnReason: 'الكمية تحتاج مراجعة',
      availableActions: [{ action: 'resubmit', hint: 'primary' }],
    },
    permissions: ['requests.view', 'requests.create'],
  });
  expect(await screen.findByText('الكمية تحتاج مراجعة')).toBeTruthy();
  expect(screen.queryByRole('tab', { name: copy.timeline })).toBeNull();
  expect(screen.getByRole('button', { name: copy.resubmit })).toBeTruthy();
});

it('checks accessibility on the populated request page', async () => {
  setup('/requests/10', { initial: waiting });
  await screen.findByRole('heading', { name: waiting.number! });
  expect((await axe(document.body)).violations).toEqual([]);
});
