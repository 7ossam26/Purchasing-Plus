import {
  buildWhatsAppUrl,
  defaultSettings,
  formatDateTime,
  formatMoney,
} from '@purchasing-plus/shared';
import {
  ar,
  fulfilmentUi as copy,
  purchasingUi as buying,
  requestUi,
} from '@purchasing-plus/shared/i18n/ar';
import {
  itemStates,
  openItem,
  statusMap,
  type ActionName,
} from '@purchasing-plus/shared/lifecycle';
import type { PermissionKey } from '@purchasing-plus/shared/permissions';
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

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type {
  Round,
  RoundSummary,
  SupplyOrder,
} from '../../lib/api/fulfilment.js';
import type { RequestDto, RequestLine } from '../../lib/api/requests.js';

const date = '2026-11-21T12:00:00.000Z';
const actor = { id: 12, name: 'محمود عادل', roleName: 'مراجع الجولة' };
const site = { id: 5, name: 'المعادي', isActive: true };
const category = { id: 3, name: 'الكهرباء' };
const supplier = {
  id: 4,
  name: 'شركة النور',
  whatsappNumber: '201001234567',
  whatsappDisplay: '01001234567',
};
const supplier2 = { ...supplier, id: 8, name: 'شركة أخرى' };
const path = '/api/v1/requests/10';
const line = (
  id: number,
  name: string,
  state: RequestLine['state'],
): RequestLine => ({
  ...openItem(
    {
      id,
      catalogItemId: 3,
      unitId: 1,
      nodeId: 6,
      otherName: null,
      specs: '',
      quantity: '2.00',
      snapshot: {
        name,
        code: 'CAT-02',
        unitName: 'متر',
        attributes: {},
        nodePath: [],
        coverImageKey: null,
      },
    },
    id,
  ),
  state,
  isOther: false,
  lineTotal: '44.00',
  outstanding: '2.00',
});
const first = line(1, 'سلك نحاس', 'AWAITING_APPROVAL');
const second = line(2, 'مفتاح', 'AWAITING_RECEIPT');
const pending: RoundSummary = {
  number: 1,
  status: 'PENDING',
  decidedAt: null,
  decidedBy: null,
  itemIds: [1],
  roundTotal: '44.00',
  deliveryFee: '5.00',
};
const round: Round = {
  ...pending,
  version: 9,
  items: [
    {
      ...first,
      itemId: first.id,
      supplier,
      lineTotal: '44.00',
      unitPrice: '22.00',
      lastPrice: { unitPrice: '20.00' },
      priceChange: { amount: '2.00', percent: '10.00' },
    },
  ],
};
const actions = (...names: ActionName[]): RequestDto['availableActions'] =>
  names.map((action) => ({
    action,
    hint:
      action === 'cancel' || action === 'rejectPricing'
        ? 'danger'
        : 'secondary',
  }));
function counts(items: RequestLine[]) {
  return Object.fromEntries(
    itemStates.map((state) => [
      state,
      items.filter((line) => line.state === state).length,
    ]),
  ) as RequestDto['stateCounts'];
}
function record(
  items: RequestLine[],
  overrides: Partial<RequestDto> = {},
): RequestDto {
  return {
    id: 10,
    number: 'PR-2026-00010',
    version: 9,
    createdById: actor.id,
    siteId: site.id,
    categoryId: category.id,
    status: 'FULFILMENT',
    urgency: 'NORMAL',
    urgencyLocked: true,
    isModified: false,
    unitOrClient: null,
    note: null,
    site,
    category,
    creator: { id: 18, name: 'كريم' },
    displayedStage: 'AWAITING_APPROVAL',
    stageStartedAt: date,
    deliveryFee: '5.00',
    stateCounts: counts(items),
    items,
    availableActions: [],
    rounds: [],
    receipts: [],
    supplyOrders: [],
    ...overrides,
  };
}
type Call = { suffix: string; method: string; body: Record<string, unknown> };
function setup(
  initial: RequestDto,
  permissions: PermissionKey[],
  update?: (call: Call, current: RequestDto) => RequestDto,
  tab = '',
) {
  let current = initial;
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const pathname = new URL(input, 'http://localhost').pathname;
    const method = init?.method ?? 'GET';
    if (pathname === '/api/v1/me')
      return Response.json({
        user: actor,
        isSuperadmin: false,
        siteScope: 'ASSIGNED',
        sites: [site],
        permissions: ['requests.view', ...permissions],
      });
    if (pathname === '/api/v1/settings') return Response.json(defaultSettings);
    if (pathname === '/api/v1/requests/options')
      return Response.json({
        sites: [site],
        units: [],
        categories: [category],
      });
    if (pathname === path) return Response.json(current);
    if (pathname === path + '/purchasing')
      return Response.json({
        ...current,
        batches: [],
        suppliers: [supplier, supplier2],
      });
    if (method === 'GET' && pathname.startsWith(path + '/rounds/')) {
      const summary = current.rounds?.find(
        (round) => String(round.number) === pathname.split('/').at(-1),
      );
      if (summary)
        return Response.json({
          ...round,
          ...summary,
          version: current.version,
        });
    }
    if (method === 'GET' && pathname === '/api/v1/requests/11')
      return Response.json(
        record([first], {
          id: 11,
          status: 'DRAFT',
          displayedStage: 'DRAFT',
          availableActions: actions('saveDraft'),
        }),
      );
    if (update && pathname.startsWith(path + '/') && method !== 'GET') {
      const call = {
        suffix: pathname.slice(path.length),
        method,
        body: JSON.parse(String(init?.body)),
      };
      calls.push(call);
      current = update(call, current);
      return Response.json(current);
    }
    throw new Error('Unexpected API ' + method + ' ' + pathname);
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, {
    initialEntries: ['/requests/10' + tab],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { calls, fetch, router };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});
const button = (name: string) =>
  screen.findByRole('button', { name }, { timeout: 5000 });
const dialog = (name: string) => within(screen.getByRole('dialog', { name }));

it('reviews a round, confirms approval, and renders the decision actor, role and date', async () => {
  const { calls } = setup(
    record([first], {
      rounds: [pending],
      availableActions: actions('approvePricing'),
    }),
    ['pricing.approve', 'requests.viewPrices', 'requests.viewSupplierNames'],
    (_call, current) =>
      record([{ ...first, state: 'AWAITING_RECEIPT' }], {
        version: current.version + 1,
        displayedStage: 'AWAITING_RECEIPT',
        rounds: [
          { ...pending, status: 'APPROVED', decidedAt: date, decidedBy: actor },
        ],
      }),
  );
  const approve = await button(copy.approve);
  expect(screen.getByText(supplier.name)).toBeTruthy();
  expect(screen.getByText('▲ 10%').className).toContain('text-danger-fg');
  expect(
    screen.getByText(new RegExp(buying.separateFee)).parentElement?.textContent,
  ).toContain(formatMoney('5.00'));
  fireEvent.click(approve);
  const confirm = dialog(copy.approveQuestion);
  expect(confirm.getByText(copy.approveConsequence)).toBeTruthy();
  fireEvent.click(confirm.getByRole('button', { name: copy.approve }));
  const attribution = (await screen.findByText(new RegExp(copy.approvedBy)))
    .parentElement;
  expect(attribution?.textContent).toContain(
    actor.name + ' (' + actor.roleName + ')',
  );
  expect(attribution?.textContent).toContain(formatDateTime(date));
  expect(calls).toEqual([
    { suffix: '/rounds/1/approve', method: 'POST', body: { version: 9 } },
  ]);
  expect(screen.getByText(copy.previousRounds)).toBeTruthy();
  expect(screen.queryByText('▲ 10%')).toBeNull();
});

it('requires a rejection reason and copies the struck-through rejected lines only', async () => {
  const { calls, router } = setup(
    record([first], {
      rounds: [pending],
      availableActions: actions('rejectPricing', 'copyRequest'),
    }),
    ['pricing.reject', 'requests.viewPrices', 'requests.create'],
    ({ suffix }, current) =>
      suffix === '/copy'
        ? record([first], {
            id: 11,
            status: 'DRAFT',
            displayedStage: 'DRAFT',
            availableActions: actions('saveDraft'),
          })
        : record([{ ...first, state: 'REJECTED' }], {
            version: current.version + 1,
            status: 'REJECTED',
            displayedStage: 'REJECTED',
            availableActions: actions('copyRequest'),
            rounds: [
              {
                ...pending,
                status: 'REJECTED',
                reason: 'السعر فوق الميزانية',
                decidedBy: actor,
                decidedAt: date,
              },
            ],
          }),
  );
  expect(screen.queryByRole('button', { name: copy.approve })).toBeNull();
  fireEvent.click(await button(copy.reject));
  const reject = dialog(copy.reject);
  expect(reject.getByText(copy.rejectFinalConsequence)).toBeTruthy();
  const confirm = reject.getByRole<HTMLButtonElement>('button', {
    name: copy.rejectFinal,
  });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(reject.getByRole('textbox', { name: ar.dialogs.reason }), {
    target: { value: 'السعر فوق الميزانية' },
  });
  fireEvent.click(confirm);
  expect(
    (await screen.findByText(new RegExp(copy.rejectedBy))).parentElement
      ?.textContent,
  ).toContain(actor.roleName);
  expect(
    screen.getByText('السعر فوق الميزانية', { exact: false }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole('heading', { name: first.snapshot.name })
      .closest('.line-through'),
  ).toBeTruthy();
  fireEvent.click(await button(copy.copyRejected));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/requests/11/review'),
  );
  expect(calls).toEqual([
    {
      method: 'POST',
      suffix: '/rounds/1/reject',
      body: { version: 9, reason: 'السعر فوق الميزانية' },
    },
    { method: 'POST', suffix: '/copy', body: { version: 10, itemIds: [1] } },
  ]);
});

it('lets the viewer decide a later pending pricing round independently', async () => {
  const round2 = { ...pending, number: 2, itemIds: [second.id] };
  const { calls } = setup(
    record([first, { ...second, state: 'AWAITING_APPROVAL' }], {
      rounds: [pending, round2],
      availableActions: actions('rejectPricing'),
    }),
    ['pricing.reject', 'requests.viewPrices'],
    (_call, current) => ({
      ...current,
      version: current.version + 1,
      rounds: [
        pending,
        { ...round2, status: 'REJECTED', decidedAt: date, decidedBy: actor },
      ],
    }),
  );
  const card = within(
    (await screen.findByRole('heading', { name: copy.round('2') })).closest(
      'section',
    )!,
  );
  fireEvent.click(await card.findByRole('button', { name: copy.reject }));
  const reject = dialog(copy.reject);
  expect(reject.getByText(copy.rejectConsequence)).toBeTruthy();
  fireEvent.change(reject.getByRole('textbox', { name: ar.dialogs.reason }), {
    target: { value: 'السعر اتغير' },
  });
  fireEvent.click(reject.getByRole('button', { name: copy.rejectRound }));
  await screen.findByText(new RegExp(copy.rejectedBy));
  expect(calls).toEqual([
    {
      method: 'POST',
      suffix: '/rounds/2/reject',
      body: { version: 9, reason: 'السعر اتغير' },
    },
  ]);
  expect(await button(copy.reject)).toBeTruthy();
});

it('validates partial quantities and records multiple receipt lines together', async () => {
  const items = [{ ...first, state: 'AWAITING_RECEIPT' as const }, second];
  const { calls } = setup(
    record(items, {
      displayedStage: 'AWAITING_RECEIPT',
      availableActions: actions('recordReceipt'),
    }),
    ['receipt.record'],
    (_call, current) =>
      record(
        [
          { ...items[0]!, state: 'RECEIVED', outstanding: '0.00' },
          { ...second, state: 'REMAINING', outstanding: '1.25' },
        ],
        {
          version: current.version + 1,
          displayedStage: 'REMAINING',
          receipts: [
            {
              id: 6,
              recordedAt: date,
              recordedBy: actor,
              note: null,
              lines: [
                { itemId: 1, quantity: '2.00' },
                { itemId: 2, quantity: '0.75', note: 'وصل جزء' },
              ],
            },
          ],
        },
      ),
    '?tab=receipt',
  );
  const row1 = within(
    await screen.findByRole('group', { name: first.snapshot.name }),
  );
  const row2 = within(
    screen.getByRole('group', { name: second.snapshot.name }),
  );
  const save = await screen.findByRole<HTMLButtonElement>('button', {
    name: copy.record,
  });
  expect(save.disabled).toBe(true);
  fireEvent.click(row1.getByRole('button', { name: copy.receiveAll }));
  expect(
    row1.getByRole<HTMLInputElement>('textbox', { name: copy.receiptQuantity })
      .value,
  ).toBe('2.00');
  const partial = row2.getByRole('textbox', { name: copy.receiptQuantity });
  for (const value of ['0', '2.01', '0.001']) {
    fireEvent.change(partial, { target: { value } });
    expect(partial.getAttribute('aria-invalid')).toBe('true');
    expect(save.disabled).toBe(true);
  }
  fireEvent.change(partial, { target: { value: '0.75' } });
  fireEvent.change(row2.getByRole('textbox', { name: requestUi.note }), {
    target: { value: 'وصل جزء' },
  });
  expect(screen.getByText(copy.partialReceipt)).toBeTruthy();
  fireEvent.click(save);
  const history = screen
    .getByRole('heading', { name: copy.receiptHistory })
    .closest('section')!;
  await within(history).findByText('وصل جزء');
  const header = screen
    .getByRole('heading', { name: 'PR-2026-00010' })
    .closest('header')!;
  expect(within(header).getByText(statusMap.RECEIVED.label).textContent).toBe(
    '1' + statusMap.RECEIVED.label,
  );
  expect(calls).toEqual([
    {
      suffix: '/receipts',
      method: 'POST',
      body: {
        version: 9,
        lines: [
          { itemId: 1, quantity: '2.00' },
          { itemId: 2, quantity: '0.75', note: 'وصل جزء' },
        ],
      },
    },
  ]);
});

it('handles same supplier, repricing and pricing a previously unavailable item', async () => {
  const backordered = {
    ...first,
    state: 'REMAINING' as const,
    outstanding: '1.00',
    supplierId: supplier.id,
    supplierName: supplier.name,
  };
  const reprice = {
    ...second,
    state: 'REMAINING' as const,
    outstanding: '1.00',
    supplierId: supplier.id,
    supplierName: supplier.name,
  };
  const unavailable = line(3, 'فيشة', 'UNAVAILABLE');
  const availableActions = actions(
    'stillComing',
    'repriceRemaining',
    'priceUnavailable',
    'resolveExternally',
  );
  const { calls } = setup(
    record([backordered, reprice, unavailable], {
      displayedStage: 'REMAINING',
      availableActions,
    }),
    [
      'purchasing.price',
      'purchasing.handleRemaining',
      'items.resolveExternally',
      'requests.viewPrices',
      'requests.viewSupplierNames',
    ],
    ({ suffix }, current) => {
      const id = Number(suffix.split('/').at(-2));
      const items = current.items.map((line): RequestLine =>
        line.id === id
          ? { ...line, state: id === 3 ? 'OPEN' : 'AWAITING_RECEIPT' }
          : line,
      );
      return record(items, {
        version: current.version + 1,
        displayedStage: 'AWAITING_RECEIPT',
        availableActions,
      });
    },
    '?tab=purchasing',
  );
  const card = async (item: RequestLine) => {
    const panel = within(
      await screen.findByRole('tabpanel', { name: buying.title }),
    );
    const heading = await panel.findByRole('heading', { name: copy.remaining });
    const section = within(heading.closest('section')!);
    return within(section.getByText(item.snapshot.name).closest('li')!);
  };
  const sameSupplier = await card(backordered);
  const stillComing = sameSupplier.getByRole('button', {
    name: copy.stillComing,
  });
  fireEvent.click(stillComing);
  await waitFor(() => expect(stillComing.isConnected).toBe(false));
  fireEvent.click(
    (await card(reprice)).getByRole('button', { name: copy.reprice }),
  );
  const pricing = dialog(copy.reprice);
  expect(pricing.getByText(copy.repriceHint)).toBeTruthy();
  fireEvent.click(pricing.getByRole('button', { name: buying.supplier }));
  fireEvent.click(
    dialog(buying.supplier).getByRole('button', { name: supplier2.name }),
  );
  fireEvent.change(pricing.getByRole('textbox', { name: copy.lineTotal }), {
    target: { value: '18.50' },
  });
  fireEvent.click(pricing.getByRole('button', { name: ar.common.save }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: copy.reprice })).toBeNull(),
  );
  fireEvent.click(
    (await card(unavailable)).getByRole('button', {
      name: copy.priceUnavailable,
    }),
  );
  const newPrice = dialog(copy.priceUnavailable);
  fireEvent.click(newPrice.getByRole('button', { name: buying.supplier }));
  fireEvent.click(
    dialog(buying.supplier).getByRole('button', { name: supplier.name }),
  );
  fireEvent.change(newPrice.getByRole('textbox', { name: copy.lineTotal }), {
    target: { value: '12.00' },
  });
  fireEvent.click(newPrice.getByRole('button', { name: ar.common.save }));
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: copy.remaining })).toBeNull(),
  );
  const header = screen
    .getByRole('heading', { name: 'PR-2026-00010' })
    .closest('header');
  expect(header?.textContent).toContain('2' + statusMap.AWAITING_RECEIPT.label);
  expect(calls).toEqual([
    { suffix: '/items/1/still-coming', method: 'POST', body: { version: 9 } },
    {
      suffix: '/items/2/reprice',
      method: 'POST',
      body: { version: 10, supplierId: supplier2.id, lineTotal: '18.50' },
    },
    {
      suffix: '/purchasing/items/3/pricing',
      method: 'PATCH',
      body: { version: 11, supplierId: supplier.id, lineTotal: '12.00' },
    },
  ]);
});

it('lets a viewer resolve an item without purchasing access and shows the actor and role', async () => {
  const remaining = { ...first, state: 'REMAINING' as const };
  const { calls } = setup(
    record([remaining], {
      displayedStage: 'REMAINING',
      availableActions: actions('resolveExternally'),
    }),
    ['items.resolveExternally'],
    (_call, current) =>
      record(
        [{ ...remaining, state: 'RESOLVED_EXTERNALLY', resolvedBy: actor }],
        {
          version: current.version + 1,
          status: 'COMPLETED',
          displayedStage: 'COMPLETED',
        },
      ),
  );
  fireEvent.click(await button(copy.resolve));
  const resolve = dialog(copy.resolve);
  const save = resolve.getByRole<HTMLButtonElement>('button', {
    name: copy.resolve,
  });
  expect(save.disabled).toBe(false);
  fireEvent.change(resolve.getByRole('textbox', { name: requestUi.note }), {
    target: { value: 'متوفر في الموقع' },
  });
  fireEvent.click(save);
  expect(
    (await screen.findByText(new RegExp(copy.resolvedBy))).textContent,
  ).toContain(actor.name + ' (' + actor.roleName + ')');
  expect(screen.getByText(statusMap.RESOLVED_EXTERNALLY.label)).toBeTruthy();
  expect(calls).toEqual([
    {
      suffix: '/items/1/resolve-externally',
      method: 'POST',
      body: { version: 9, note: 'متوفر في الموقع' },
    },
  ]);
});

it('puts cancellation in overflow and requires a reason with the consequence', async () => {
  const { calls } = setup(
    record([second], {
      displayedStage: 'AWAITING_RECEIPT',
      availableActions: actions('cancel'),
    }),
    ['requests.cancelAnyStage'],
    (_call, current) =>
      record([{ ...second, state: 'CANCELLED' }], {
        version: current.version + 1,
        status: 'CANCELLED',
        displayedStage: 'CANCELLED',
      }),
  );
  fireEvent.click(await button(ar.common.more));
  fireEvent.click(
    dialog(ar.common.more).getByRole('button', { name: copy.cancel }),
  );
  const cancel = dialog(copy.cancel);
  expect(cancel.getByText(copy.cancelConsequence)).toBeTruthy();
  const confirm = cancel.getByRole<HTMLButtonElement>('button', {
    name: copy.cancelConfirm,
  });
  expect(confirm.disabled).toBe(true);
  const reason = cancel.getByRole('textbox', { name: ar.dialogs.reason });
  fireEvent.change(reason, { target: { value: '   ' } });
  expect(confirm.disabled).toBe(true);
  fireEvent.change(reason, { target: { value: 'الموقع اتقفل' } });
  fireEvent.click(confirm);
  await waitFor(() =>
    expect(
      screen.getAllByText(statusMap.CANCELLED.label).length,
    ).toBeGreaterThan(0),
  );
  expect(calls).toEqual([
    {
      suffix: '/cancel',
      method: 'POST',
      body: { version: 9, reason: 'الموقع اتقفل' },
    },
  ]);
});

it('hides pricing controls, prices and the receipt tab from a read-only viewer', async () => {
  const { fetch } = setup(record([first], { rounds: [pending] }), []);
  await screen.findByRole('heading', { name: first.snapshot.name });
  expect(screen.queryByRole('button', { name: copy.approve })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.reject })).toBeNull();
  expect(screen.queryByRole('tab', { name: copy.receipt })).toBeNull();
  expect(screen.queryByText(formatMoney('44.00'))).toBeNull();
  expect(screen.queryByText(formatMoney('5.00'))).toBeNull();
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/rounds/1'))).toBe(
    false,
  );
});

it('edits, copies and marks a supplier order as sent', async () => {
  const message = 'يرجى توريد المفتاح';
  const edited = 'يرجى توريد المفتاح غدًا';
  const order: SupplyOrder = {
    id: 14,
    number: 1,
    supplier,
    sentAt: null,
    message,
    ...{ waUrl: buildWhatsAppUrl(supplier.whatsappNumber, message).url },
    items: [{ itemId: second.id, lineNo: second.lineNo, quantity: '2.00' }],
  };
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboard },
  });
  const { calls } = setup(
    record([second], {
      supplyOrders: [order],
      availableActions: actions(
        'editSupplyOrderMessage',
        'markSupplyOrderSent',
      ),
    }),
    ['purchasing.sendSupplyOrder', 'requests.viewSupplierNames'],
    ({ suffix }, current) => {
      const sent = suffix.endsWith('/sent');
      return {
        ...current,
        version: current.version + 1,
        availableActions: sent ? [] : current.availableActions,
        supplyOrders: [
          {
            ...order,
            message: edited,
            waUrl: buildWhatsAppUrl(supplier.whatsappNumber, edited).url,
            sentAt: sent ? date : null,
          },
        ],
      };
    },
    '?tab=purchasing',
  );
  const item = within(
    (await screen.findByRole('heading', { name: supplier.name })).closest(
      'article',
    )!,
  );
  expect(
    item.getByRole('link', { name: buying.openWhatsApp }).getAttribute('href'),
  ).toBe(order.waUrl);
  fireEvent.change(item.getByRole('textbox', { name: buying.message }), {
    target: { value: edited },
  });
  fireEvent.click(item.getByRole('button', { name: ar.common.save }));
  expect(
    (await item.findByRole('link', { name: buying.openWhatsApp })).getAttribute(
      'href',
    ),
  ).toBe(buildWhatsAppUrl(supplier.whatsappNumber, edited).url);
  fireEvent.click(item.getByRole('button', { name: buying.copyMessage }));
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith(edited));
  fireEvent.click(item.getByRole('button', { name: buying.markSent }));
  expect(await item.findByText(formatDateTime(date))).toBeTruthy();
  expect(item.queryByRole('button', { name: buying.markSent })).toBeNull();
  expect(calls).toEqual([
    {
      suffix: '/supply-orders/1',
      method: 'PATCH',
      body: { version: 9, message: edited },
    },
    { suffix: '/supply-orders/1/sent', method: 'POST', body: { version: 10 } },
  ]);
});
