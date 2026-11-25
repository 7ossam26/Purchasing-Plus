import { buildWhatsAppUrl, defaultSettings } from '@purchasing-plus/shared';
import { ar, purchasingUi as copy } from '@purchasing-plus/shared/i18n/ar';
import {
  itemStates,
  sumAmounts,
  type ActionName,
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

import { createQueryClient } from '../../app/query.js';
import { routes } from '../../app/routes.js';
import type {
  BatchSupplier,
  PurchasingLine,
  PurchasingView,
  RfqBatch,
  SupplierContact,
} from '../../lib/api/purchasing.js';
import type { RequestDto } from '../../lib/api/requests.js';

const base = '/api/v1/requests';
const buyingPath = base + '/10/purchasing';
const site = { id: 5, name: 'المعادي', isActive: true };
const category = { id: 1, name: 'كهربا', isActive: true, iconKey: 'zap' };
const unit = { id: 8, name: 'متر', isActive: true };
const now = '2026-11-21T10:15:00.000Z';
const supplierList: SupplierContact[] = ['الأمل', 'النور', 'الصفوة'].map(
  (name, index) => ({
    id: 20 + index,
    name,
    whatsappNumber: '20101234567' + index,
    whatsappDisplay: '0101 234 567' + index,
  }),
);
const outside: SupplierContact = {
  id: 29,
  name: 'السلام للتجارة',
  whatsappNumber: '201012345679',
  whatsappDisplay: '0101 234 5679',
};
function line(id: number, name: string): PurchasingLine {
  return {
    id,
    lineNo: id - 100,
    catalogItemId: null,
    nodeId: 1,
    isOther: true,
    otherName: name,
    state: 'OPEN',
    quantity: '2.00',
    unitId: unit.id,
    receivedQty: '0.00',
    needsRepricing: false,
    modifiedAfterSend: false,
    unavailableNote: null,
    supplierId: null,
    lineTotal: null,
    specs: id === 101 ? 'أبيض' : '',
    snapshot: {
      name,
      code: null,
      unitName: unit.name,
      attributes: {},
      nodePath: [category.name],
      coverImageKey: null,
    },
    sentTo: [],
    sentSupplierCount: 0,
  };
}
const queue = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
});
const granted = [
  'requests.view',
  'requests.viewPrices',
  'requests.viewSupplierNames',
  'purchasing.price',
  'purchasing.sendRfq',
];
type Fixture = {
  paused?: boolean;
  repricing?: boolean;
  permissions?: string[];
  actions?: ActionName[];
};
function setup(fixture: Fixture = {}, path = '/purchasing') {
  let version = 7,
    status: RequestDto['status'] = fixture.paused ? 'PAUSED' : 'AT_PURCHASING';
  let fee: string | null = null;
  let items = [line(101, 'مفتاح'), line(102, 'سلك')];
  if (fixture.repricing) items[0]!.needsRepricing = true;
  let batches: RfqBatch[] = [];
  const calls: {
    method: string;
    path: string;
    body: Record<string, unknown>;
  }[] = [];
  const clipboard = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboard },
  });
  function batchesFor(id: number) {
    return batches.flatMap((batch) =>
      batch.itemIds.includes(id)
        ? (batch.suppliers ?? []).flatMap((recipient) =>
            recipient.sentAt
              ? [
                  {
                    batchId: batch.id,
                    supplierId: recipient.supplierId,
                    supplierName: recipient.supplier.name,
                    sentAt: recipient.sentAt,
                  },
                ]
              : [],
          )
        : [],
    );
  }
  function view(selection: number[] = []): PurchasingView {
    const priced = items.filter(
      (item) => item.state === 'OPEN' && item.lineTotal,
    );
    const pricing: PurchasingView['pricing'] = {
      pricedCount: priced.length,
      unavailableCount: items.filter((item) => item.state === 'UNAVAILABLE')
        .length,
      total: sumAmounts(
        items.flatMap((item) => (item.lineTotal ? [item.lineTotal] : [])),
      ),
      pendingTotal: sumAmounts(priced.map((item) => item.lineTotal!)),
      needsRepricingItemIds: items
        .filter((item) => item.needsRepricing)
        .map((item) => item.id),
      submitBlocker:
        status !== 'AT_PURCHASING'
          ? 'WRONG_STATUS'
          : items.some((item) => item.needsRepricing)
            ? 'NEEDS_REPRICING'
            : priced.length
              ? null
              : 'NO_PRICED_ITEMS',
    };
    const allowed: ActionName[] =
      fixture.actions ??
      (status === 'AT_PURCHASING'
        ? [
            'createBatch',
            'markBatchSent',
            'editBatchMessage',
            'savePricingDraft',
            'editDeliveryFee',
            'markUnavailable',
            'markAvailable',
            ...(pricing.submitBlocker === null
              ? ['submitPricing' as const]
              : []),
          ]
        : []);
    const availableActions: RequestDto['availableActions'] = allowed.map(
      (action) => ({
        action,
        hint: action === 'resume' ? 'primary' : 'secondary',
      }),
    );
    return {
      id: 10,
      version,
      status,
      number: 'PR-2026-00010',
      urgency: 'URGENT',
      urgencyLocked: false,
      isModified: true,
      unitOrClient: null,
      note: null,
      createdById: 7,
      siteId: site.id,
      categoryId: category.id,
      site,
      category,
      creator: { id: 7, name: 'مينا' },
      displayedStage: status === 'FULFILMENT' ? 'AWAITING_APPROVAL' : status,
      stageStartedAt: now,
      availableActions,
      deliveryFee: fee,
      ...(status === 'PAUSED'
        ? {
            pausedAt: now,
            pauser: { id: 9, name: 'آية' },
            pauseReason: 'راجع الكميات',
          }
        : {}),
      stateCounts: Object.fromEntries(
        itemStates.map((state) => [
          state,
          items.filter((item) => item.state === state).length,
        ]),
      ) as RequestDto['stateCounts'],
      items: items.map((item) => {
        const sentTo = batchesFor(item.id);
        return {
          ...item,
          sentTo,
          sentSupplierCount: new Set(sentTo.map((entry) => entry.supplierId))
            .size,
        };
      }),
      suppliers: supplierList.map((supplier) => ({
        ...supplier,
        alreadyReceivedCount: selection.filter((id) =>
          batchesFor(id).some((entry) => entry.supplierId === supplier.id),
        ).length,
      })),
      batches,
      pricing,
    };
  }
  function recipient(
    supplier: SupplierContact,
    message: string,
  ): BatchSupplier {
    const { url, tooLong } = buildWhatsAppUrl(supplier.whatsappNumber, message);
    return {
      supplier,
      supplierId: supplier.id,
      message,
      waUrl: url,
      tooLong,
      sentAt: null,
      sentById: null,
    };
  }
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'http://localhost');
    const path = url.pathname;
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      if (path === '/api/v1/me')
        return Response.json({
          user: { id: 8, name: 'نور', username: 'buyer' },
          isSuperadmin: false,
          siteScope: 'ASSIGNED',
          sites: [site],
          permissions: fixture.permissions ?? granted,
        });
      if (path === '/api/v1/settings') return Response.json(defaultSettings);
      if (path === base) return Response.json(queue([view()]));
      if (path === base + '/options')
        return Response.json({
          sites: [site],
          categories: [category],
          units: [unit],
        });
      if (path === base + '/10') return Response.json(view());
      if (path === buyingPath)
        return Response.json(
          view(
            (url.searchParams.get('itemIds') ?? '')
              .split(',')
              .filter(Boolean)
              .map(Number),
          ),
        );
      if (path === buyingPath + '/suppliers')
        return Response.json(
          queue(
            [outside].filter((s) =>
              s.name.includes(url.searchParams.get('q') ?? ''),
            ),
          ),
        );
      throw new Error('Unexpected GET ' + path);
    }
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ method, path, body });
    if (body.version !== version)
      return Response.json(
        {
          error: 'VERSION_CONFLICT',
          message: ar.lifecycle.errors.VERSION_CONFLICT,
        },
        { status: 409 },
      );
    version++;
    if (path === buyingPath + '/batches') {
      const batch = {
        id: 30 + batches.length,
        createdAt: now,
        itemIds: body.itemIds as number[],
        suppliers: (body.supplierIds as number[]).map((id) =>
          recipient(
            supplierList.find((s) => s.id === id)!,
            body.message as string,
          ),
        ),
      };
      batches = [...batches, batch];
      return Response.json({ version, batch }, { status: 201 });
    }
    const recipientMatch = /\/batches\/(\d+)\/suppliers\/(\d+)(\/sent)?$/.exec(
      path,
    );
    if (recipientMatch) {
      const [, batchId, supplierId, mark] = recipientMatch;
      batches = batches.map((batch) =>
        batch.id !== Number(batchId)
          ? batch
          : {
              ...batch,
              suppliers: batch.suppliers?.map((row) =>
                row.supplierId !== Number(supplierId)
                  ? row
                  : mark
                    ? { ...row, sentAt: now, sentById: 8 }
                    : recipient(row.supplier, body.message as string),
              ),
            },
      );
      return Response.json({
        version,
        batch: batches.find((batch) => batch.id === Number(batchId)),
      });
    }
    const itemMatch = /\/items\/(\d+)\/(pricing|unavailable)$/.exec(path);
    if (itemMatch) {
      items = items.map((item) =>
        item.id !== Number(itemMatch[1])
          ? item
          : itemMatch[2] === 'pricing'
            ? {
                ...item,
                lineTotal: body.lineTotal as string | null,
                supplierId: body.supplierId as number | null,
                needsRepricing: false,
                supplierName: [...supplierList, outside].find(
                  (s) => s.id === body.supplierId,
                )?.name,
              }
            : {
                ...item,
                state: method === 'POST' ? 'UNAVAILABLE' : 'OPEN',
                unavailableNote:
                  method === 'POST' ? (body.note as string) : null,
              },
      );
    } else if (path === buyingPath + '/delivery-fee')
      fee = body.deliveryFee as string | null;
    else if (path === buyingPath + '/submit-pricing') {
      status = 'FULFILMENT';
      items = items.map((item) =>
        item.lineTotal ? { ...item, state: 'AWAITING_APPROVAL' } : item,
      );
    } else if (path.endsWith('/pause') || path.endsWith('/purchasing-return'))
      status = 'PAUSED';
    else if (path.endsWith('/resume')) status = 'AT_PURCHASING';
    else if (!path.endsWith('/paused-edit'))
      throw new Error('Unexpected ' + method + ' ' + path);
    return Response.json(view());
  });
  vi.stubGlobal('fetch', fetch);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetch, calls, clipboard };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const dialog = (name?: string) => within(screen.getByRole('dialog', { name }));
async function chooseRfq() {
  fireEvent.click(
    await screen.findByRole('checkbox', { name: copy.pickItem('مفتاح') }),
  );
  click(copy.chooseSuppliers);
  return within(
    await screen.findByRole('dialog', { name: copy.chooseSuppliers }),
  );
}

it('opens the queue and sends a three-supplier batch, persists a supplier tweak, and shows resend counts', async () => {
  const { clipboard, calls, fetch } = setup();
  fireEvent.click(await screen.findByRole('link', { name: /PR-2026-00010/ }));
  const selection = await chooseRfq();
  fireEvent.click(
    await selection.findByRole('button', { name: copy.selectAll }),
  );
  fireEvent.click(selection.getAllByRole('button', { name: /نسخ الرقم/ })[0]!);
  await waitFor(() =>
    expect(clipboard).toHaveBeenCalledWith(supplierList[0]!.whatsappNumber),
  );
  fireEvent.click(selection.getByRole('button', { name: ar.common.next }));
  const draft = dialog(copy.message);
  const message = draft.getByRole<HTMLTextAreaElement>('textbox', {
    name: copy.message,
  });
  expect(message.value).toContain('1) مفتاح – أبيض – 2.00 متر');
  fireEvent.change(message, {
    target: { value: 'مساء الخير، مطلوب سعر المفتاح' },
  });
  fireEvent.click(draft.getByRole('button', { name: copy.send }));
  const send = within(await screen.findByRole('dialog', { name: copy.send }));
  expect(send.getAllByRole('link', { name: copy.openWhatsApp })).toHaveLength(
    3,
  );
  const link = send.getAllByRole('link', { name: copy.openWhatsApp })[0]!;
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('rel')).toContain('noopener');
  const opened = vi.fn((event: Event) => event.preventDefault());
  link.addEventListener('click', opened);
  fireEvent.click(link);
  expect(opened).toHaveBeenCalledOnce();
  expect(decodeURIComponent(link.getAttribute('href')!)).toContain(
    'مساء الخير، مطلوب سعر المفتاح',
  );
  fireEvent.click(send.getAllByRole('button', { name: copy.editMessage })[0]!);
  const long = 'س'.repeat(710);
  fireEvent.change(send.getByRole('textbox', { name: copy.message }), {
    target: { value: long },
  });
  fireEvent.click(send.getByRole('button', { name: ar.common.save }));
  expect(await send.findByText(copy.longMessage)).toBeTruthy();
  expect(send.getAllByRole('link', { name: copy.openWhatsApp })).toHaveLength(
    2,
  );
  fireEvent.click(send.getAllByRole('button', { name: copy.copyMessage })[0]!);
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith(long));
  for (let remaining = 3; remaining > 0; remaining--) {
    fireEvent.click(send.getAllByRole('button', { name: copy.markSent })[0]!);
    await waitFor(() =>
      expect(
        send.queryAllByRole('button', { name: copy.markSent }),
      ).toHaveLength(remaining - 1),
    );
  }
  fireEvent.click(send.getByRole('button', { name: ar.common.close }));
  fireEvent.click(
    await screen.findByRole('button', { name: copy.sentCount('3') }),
  );
  const history = dialog(copy.history);
  expect(history.getByText(supplierList[2]!.name)).toBeTruthy();
  expect(
    history
      .getByText(supplierList[1]!.name)
      .parentElement?.querySelector('time')?.dateTime,
  ).toBe(now);
  fireEvent.click(history.getByRole('button', { name: ar.common.close }));
  const again = await chooseRfq();
  expect(await again.findAllByText(copy.alreadyReceived('1'))).toHaveLength(3);
  expect(
    calls
      .filter((call) => call.path.endsWith('/sent'))
      .map((call) => call.body.version),
  ).toEqual([9, 10, 11]);
  // The workspace opens on every lifecycle state, not only the actionable queue.
  const workspace = fetch.mock.calls.find(([url]) =>
    url.includes('workspace=purchasing'),
  );
  expect(workspace).toBeDefined();
  expect(workspace![0]).not.toContain('queue=');
});

it('autosaves quote and fee separately, searches outside the category, toggles availability, and confirms pricing', async () => {
  const { calls } = setup({}, '/requests/10?tab=purchasing');
  fireEvent.click(await screen.findByRole('tab', { name: copy.pricing }));
  const panel = within(screen.getByRole('tabpanel', { name: copy.pricing }));
  expect(
    panel.getByRole<HTMLButtonElement>('button', { name: copy.submit })
      .disabled,
  ).toBe(true);
  expect(panel.getByText(copy.noPrice)).toBeTruthy();
  fireEvent.click(
    panel.getByRole('button', { name: copy.supplierFor('مفتاح') }),
  );
  const picker = dialog(copy.supplier);
  fireEvent.click(picker.getByRole('switch', { name: copy.allSuppliers }));
  fireEvent.change(
    picker.getByRole('searchbox', { name: copy.searchSupplier }),
    { target: { value: 'السلام' } },
  );
  fireEvent.click(await picker.findByRole('button', { name: outside.name }));
  fireEvent.change(
    panel.getByRole('textbox', { name: copy.priceFor('مفتاح') }),
    { target: { value: '1.01' } },
  );
  expect(panel.getByText(copy.unitPrice('0.51'))).toBeTruthy();
  fireEvent.change(panel.getByRole('textbox', { name: copy.deliveryFee }), {
    target: { value: '12.50' },
  });
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls.map((call) => call.body.version)).toEqual([7, 8]);
  expect(calls[0]?.body).toMatchObject({
    supplierId: outside.id,
    lineTotal: '1.01',
  });
  expect(calls[1]?.body).toMatchObject({ deliveryFee: '12.50' });
  await waitFor(() =>
    expect(
      panel.getByRole<HTMLButtonElement>('button', { name: copy.submit })
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(panel.getAllByRole('switch', { name: copy.unavailable })[1]!);
  const unavailable = dialog(copy.unavailable);
  fireEvent.change(
    unavailable.getByRole('textbox', { name: copy.unavailableNote }),
    { target: { value: 'المقاس خلص' } },
  );
  fireEvent.click(unavailable.getByRole('button', { name: copy.unavailable }));
  expect(await panel.findByText('المقاس خلص')).toBeTruthy();
  const total = panel.getByText(copy.total).parentElement!;
  expect(total.textContent).toContain('1.01');
  expect(total.textContent).not.toContain('13.51');
  expect(panel.getByText(copy.separateFee)).toBeTruthy();
  fireEvent.click(panel.getByRole('button', { name: copy.submit }));
  const confirm = dialog(copy.submitQuestion);
  expect(
    confirm.getByText(copy.pricedCount).parentElement?.textContent,
  ).toContain('1');
  expect(
    confirm.getByText(copy.unavailableCount).parentElement?.textContent,
  ).toContain('1');
  expect(
    confirm.getByText(copy.roundTotal).parentElement?.textContent,
  ).toContain('1.01');
  expect(
    confirm.getByText(copy.deliveryFee).parentElement?.textContent,
  ).toContain('12.50');
  fireEvent.click(confirm.getByRole('button', { name: copy.submit }));
  await waitFor(() =>
    expect(calls.at(-1)?.path).toBe(buyingPath + '/submit-pricing'),
  );
});

it('shows the repricing blocker and the flag provided by the server', async () => {
  setup({ repricing: true }, '/requests/10?tab=purchasing');
  fireEvent.click(await screen.findByRole('tab', { name: copy.pricing }));
  const panel = within(screen.getByRole('tabpanel', { name: copy.pricing }));
  expect(
    panel.getByRole<HTMLButtonElement>('button', { name: copy.submit })
      .disabled,
  ).toBe(true);
  expect(panel.getByText(copy.unresolved)).toBeTruthy();
  expect(panel.getByText(copy.needsRepricing)).toBeTruthy();
});

it('reuses the request editor for a paused editor who cannot resume or access purchasing', async () => {
  const { calls } = setup(
    {
      paused: true,
      permissions: ['requests.view', 'requests.editWhilePaused'],
      actions: ['editWhilePaused'],
    },
    '/requests/10',
  );
  expect(await screen.findByText(copy.paused)).toBeTruthy();
  expect(screen.getByText('راجع الكميات')).toBeTruthy();
  expect(screen.getByText('آية')).toBeTruthy();
  expect(screen.getByLabelText(copy.pausedAt).getAttribute('datetime')).toBe(
    now,
  );
  expect(screen.queryByRole('tab', { name: copy.title })).toBeNull();
  expect(screen.queryByRole('button', { name: copy.resume })).toBeNull();
  click(copy.editPaused);
  fireEvent.change(screen.getByRole('textbox', { name: 'كمية مفتاح' }), {
    target: { value: '3.50' },
  });
  click(ar.common.save);
  await waitFor(() =>
    expect(calls[0]?.body).toMatchObject({
      version: 7,
      change: [{ itemId: 101, fields: { quantity: '3.50' } }],
    }),
  );
});
it('only renders pause and purchasing return when the server allows them, and requires a reason', async () => {
  const { calls } = setup(
    {
      permissions: [...granted, 'requests.pause', 'purchasing.returnForEdit'],
      actions: ['pause', 'purchasingReturnForEdit'],
    },
    '/requests/10',
  );
  fireEvent.click(await screen.findByRole('button', { name: copy.pause }));
  const prompt = dialog(copy.pauseQuestion);
  expect(
    prompt.getByRole<HTMLButtonElement>('button', { name: copy.pause })
      .disabled,
  ).toBe(true);
  fireEvent.change(prompt.getByRole('textbox', { name: ar.dialogs.reason }), {
    target: { value: 'راجع الكميات' },
  });
  fireEvent.click(prompt.getByRole('button', { name: copy.pause }));
  await waitFor(() =>
    expect(calls[0]).toMatchObject({
      path: base + '/10/pause',
      body: { version: 7, reason: 'راجع الكميات' },
    }),
  );
  expect(await screen.findByText(copy.paused)).toBeTruthy();
});

it('returns a request from purchasing with a reason when the viewer has that action alone', async () => {
  const { calls } = setup(
    {
      permissions: ['requests.view', 'purchasing.returnForEdit'],
      actions: ['purchasingReturnForEdit'],
    },
    '/requests/10',
  );
  fireEvent.click(await screen.findByRole('button', { name: ar.common.more }));
  expect(screen.queryByRole('button', { name: copy.pause })).toBeNull();
  fireEvent.click(
    dialog(ar.common.more).getByRole('button', { name: copy.returnForEdit }),
  );
  const prompt = dialog(copy.returnQuestion);
  expect(
    prompt.getByRole<HTMLButtonElement>('button', { name: copy.returnForEdit })
      .disabled,
  ).toBe(true);
  fireEvent.change(prompt.getByRole('textbox', { name: ar.dialogs.reason }), {
    target: { value: 'راجع الكميات' },
  });
  fireEvent.click(prompt.getByRole('button', { name: copy.returnForEdit }));
  await waitFor(() =>
    expect(calls[0]).toMatchObject({
      path: base + '/10/purchasing-return',
      body: { version: 7, reason: 'راجع الكميات' },
    }),
  );
  expect(await screen.findByText(copy.paused)).toBeTruthy();
});

it('resumes a paused request when the viewer has the resume action', async () => {
  const { calls } = setup(
    {
      paused: true,
      permissions: ['requests.view', 'requests.pause'],
      actions: ['resume'],
    },
    '/requests/10',
  );
  fireEvent.click(await screen.findByRole('button', { name: copy.resume }));
  await waitFor(() =>
    expect(calls[0]).toMatchObject({
      path: base + '/10/resume',
      body: { version: 7 },
    }),
  );
  await waitFor(() => expect(screen.queryByText(copy.paused)).toBeNull());
});
