import { expect, it } from 'vitest';

import * as life from '../../src/lifecycle/index.js';

import {
  data,
  fixture,
  now,
  only,
  roundLine,
  sample,
  viewer,
} from './fixtures.js';

it.each([
  ['1.01', '0.00', '1.01', null],
  ['1.00', '1.00', '0.00', '0.00'],
  ['2.00', '3.00', '-1.00', '-33.33'],
  ['1.01', '1.00', '0.01', '1.00'],
])('compares unit prices %s and %s', (current, previous, amount, percent) => {
  expect(life.priceChange(current!, previous!)).toEqual({ amount, percent });
});

it('checks the automatic outcome after a fulfilment fee edit', () => {
  const s = fixture('FULFILMENT', 'RECEIVED');
  const result = life.applyEditDeliveryFee(
    s,
    viewer,
    { version: s.version, deliveryFee: '5.00' },
    now,
  );
  expect(result.events.map((e) => e.type)).toEqual([
    'DELIVERY_FEE_CHANGED',
    'COMPLETED',
  ]);
  expect(result.next.status).toBe('COMPLETED');
});

it('refuses a catalog price that would overflow the money column for a fractional quantity', () => {
  const s = fixture('AT_PURCHASING');
  s.items[0]!.quantity = '0.01';
  const input = {
    version: 1,
    itemId: 11,
    supplierId: 8,
    lineTotal: '999999999999.99',
  };
  expect(life.canSavePricingDraft(s, viewer, input)).toMatchObject({
    code: 'UNIT_PRICE_TOO_LARGE',
  });
  const f = fixture('FULFILMENT', 'REMAINING');
  f.items[0]!.receivedQty = '3.99';
  expect(life.canRepriceRemaining(f, viewer, input)).toMatchObject({
    code: 'UNIT_PRICE_TOO_LARGE',
  });
});

it('restores an unavailable line for pricing, and a partial draft cannot satisfy a repricing flag', () => {
  const s = fixture('AT_PURCHASING');
  s.items[0]!.needsRepricing = true;
  const partial = life.applySavePricingDraft(
    s,
    viewer,
    { version: 1, itemId: 11, supplierId: 8, lineTotal: null },
    now,
  );
  expect(partial.next.items[0]!.needsRepricing).toBe(true);
  const unavailable = life.applyMarkUnavailable(
    partial.next,
    viewer,
    { version: 2, itemId: 11, note: 'نفد' },
    now,
  );
  expect(unavailable.next.items[0]).toMatchObject({
    supplierId: null,
    needsRepricing: false,
    unavailableNote: 'نفد',
  });
  const open = life.applyMarkAvailable(
    unavailable.next,
    viewer,
    { version: 3, itemId: 11 },
    now,
  );
  expect(open.next.items[0]).toMatchObject({
    state: 'OPEN',
    unavailableNote: null,
  });
  expect(
    life.canSubmitPricing(open.next, viewer, { version: 4 }),
  ).toMatchObject({ code: 'NO_PRICED_ITEMS' });
});

it('saving a price or a partial pricing draft leaves the request in pricing, quietly', () => {
  const s = fixture('AT_PURCHASING');
  s.items.push(life.openItem(data(12), 2));
  const supplierOnly = life.applySavePricingDraft(
    s,
    viewer,
    { version: 1, itemId: 11, supplierId: 8, lineTotal: null },
    now,
  );
  const priced = life.applySavePricingDraft(
    supplierOnly.next,
    viewer,
    { version: 2, itemId: 11, supplierId: 8, lineTotal: '20.00' },
    now,
  );
  for (const draft of [supplierOnly, priced]) {
    expect(draft.next.status).toBe('AT_PURCHASING');
    expect(life.deriveStage(draft.next)).toBe('AT_PURCHASING');
    expect(draft.next.items.map((i) => i.state)).toEqual(['OPEN', 'OPEN']);
    expect(draft.next.rounds).toEqual([]);
    expect(draft.next.supplyOrders).toEqual([]);
    expect(draft.events).toEqual([]);
    expect(draft.notify).toEqual([]);
    expect(draft.priceRecords).toEqual([]);
  }
  expect(priced.next.items[0]).toMatchObject({
    supplierId: 8,
    lineTotal: '20.00',
  });
  expect(life.inQueue('purchasing', priced.next, viewer)).toBe(true);
  expect(life.inQueue('receipt', priced.next, viewer)).toBe(false);
});

it('submitting final pricing sends priced lines straight to receipt with supplier orders and half-up catalog prices', () => {
  const s = fixture('AT_PURCHASING');
  s.createdById = 55;
  s.items.push(
    life.openItem(data(12), 2),
    life.openItem({ ...data(13), catalogItemId: null, otherName: 'أخرى' }, 3),
    life.openItem(data(14), 4),
    life.openItem(data(15), 5),
  );
  expect(life.canSubmitPricing(s, viewer, { version: 1 })).toMatchObject({
    code: 'NO_PRICED_ITEMS',
  });
  const priced = life.applySavePricingDraft(
    s,
    viewer,
    { itemId: 11, version: 1, supplierId: 8, lineTotal: '1.02' },
    now,
  );
  const second = life.applySavePricingDraft(
    priced.next,
    viewer,
    { itemId: 12, version: 2, supplierId: 8, lineTotal: '10.10' },
    now,
  );
  const third = life.applySavePricingDraft(
    second.next,
    viewer,
    { itemId: 13, version: 3, supplierId: 9, lineTotal: '0.30' },
    now,
  );
  const unavailable = life.applyMarkUnavailable(
    third.next,
    viewer,
    { itemId: 14, version: 4 },
    now,
  );
  const fee = life.applyEditDeliveryFee(
    unavailable.next,
    viewer,
    { version: 5, deliveryFee: '50.00' },
    now,
  );
  const submit = life.applySubmitPricing(
    fee.next,
    only('purchasing.price'),
    { version: 6 },
    now,
  );
  expect(submit.next.status).toBe('FULFILMENT');
  expect(life.deriveStage(submit.next)).toBe('AWAITING_RECEIPT');
  // Item 15 was never priced: it stays OPEN with purchasing, like the unavailable line.
  expect(submit.next.items.map((i) => i.state)).toEqual([
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'UNAVAILABLE',
    'OPEN',
  ]);
  expect(submit.next.rounds).toEqual([
    {
      number: 1,
      status: 'SUBMITTED',
      decidedAt: null,
      decidedById: null,
      lines: [
        expect.objectContaining({ itemId: 11, lineTotal: '1.02' }),
        expect.objectContaining({ itemId: 12, lineTotal: '10.10' }),
        expect.objectContaining({ itemId: 13, lineTotal: '0.30' }),
      ],
    },
  ]);
  expect(submit.events).toEqual([
    expect.objectContaining({
      type: 'PRICING_SENT_FOR_RECEIPT',
      stageAfter: 'AWAITING_RECEIPT',
      actorId: 7,
      itemIds: [11, 12, 13],
      payload: expect.objectContaining({
        roundNo: 1,
        roundTotal: '11.42',
        deliveryFee: '50.00',
      }),
    }),
  ]);
  expect(
    submit.notify.map((n) => ('userId' in n ? n.userId : n.holdersOf)),
  ).toEqual([55, 'receipt.record', 'purchasing.sendSupplyOrder']);
  expect(
    submit.next.supplyOrders.map((o) => [
      o.number,
      o.supplierId,
      o.sent,
      o.lines.map((l) => l.itemId),
    ]),
  ).toEqual([
    [1, 8, false, [11, 12]],
    [2, 9, false, [13]],
  ]);
  expect(submit.priceRecords).toEqual([
    {
      requestItemId: 11,
      source: 'SUBMITTED',
      catalogItemId: 111,
      supplierId: 8,
      lineTotal: '1.02',
      quantity: '4.00',
      unitPrice: '0.26',
    },
    {
      requestItemId: 12,
      source: 'SUBMITTED',
      catalogItemId: 112,
      supplierId: 8,
      lineTotal: '10.10',
      quantity: '4.00',
      unitPrice: '2.53',
    },
  ]);
  // Nobody approves or rejects any more: the request is already with the site.
  expect(Object.keys(life.actions)).not.toContain('approvePricing');
  expect(Object.keys(life.actions)).not.toContain('rejectPricing');
  expect(
    life.availableActions(submit.next, viewer).map((a) => a.action),
  ).toEqual(expect.arrayContaining(['recordReceipt', 'markSupplyOrderSent']));
  const sent = life.applyMarkSupplyOrderSent(
    submit.next,
    viewer,
    { orderNo: 2, version: 7 },
    now,
  );
  expect(sent.events[0]).toMatchObject({
    type: 'SUPPLY_ORDER_SENT_MARKED',
    payload: { supplierId: 9, lineNos: [3] },
  });
  expect(
    life.canMarkSupplyOrderSent(sent.next, viewer, { orderNo: 2, version: 8 }),
  ).toMatchObject({ code: 'NO_PENDING_SEND' });
  const nextPrice = life.applyPriceUnavailable(
    sent.next,
    viewer,
    { itemId: 14, version: 8, supplierId: 8, lineTotal: '12.30' },
    now,
  );
  expect(nextPrice.events.map((e) => e.type)).toEqual(['ITEM_AVAILABLE_AGAIN']);
  expect(nextPrice.next.items[3]!.state).toBe('OPEN');
  const nextRound = life.applySubmitPricing(
    nextPrice.next,
    viewer,
    { version: 9 },
    now,
  );
  expect(nextRound.next.rounds[1]).toMatchObject({
    number: 2,
    status: 'SUBMITTED',
    lines: [{ itemId: 14 }],
  });
  expect(nextRound.next.items[3]!.state).toBe('AWAITING_RECEIPT');
  expect(nextRound.next.supplyOrders.at(-1)).toMatchObject({
    number: 3,
    supplierId: 8,
    lines: [{ itemId: 14 }],
  });
});

it('the engineer confirms actual delivery after submission, including partial deliveries', () => {
  const { state } = sample('submitPricing');
  state.createdById = 55;
  const submitted = life.applySubmitPricing(
    state,
    only('purchasing.price'),
    { version: 1 },
    now,
  );
  const engineer = { ...only('receipt.record'), userId: 55 };
  const receive = (s: life.RequestState, quantity: string, who = engineer) =>
    life.applyRecordReceipt(
      s,
      who,
      { version: s.version, lines: [{ itemId: 11, quantity }] },
      now,
    );
  // Pricing alone completes nothing: the line waits until someone records delivery.
  expect(submitted.next.items[0]!.state).toBe('AWAITING_RECEIPT');
  expect(life.inQueue('receipt', submitted.next, engineer)).toBe(true);
  expect(() =>
    receive(submitted.next, '1.00', {
      ...only('requests.view', 'requests.viewPrices'),
      userId: 55,
    }),
  ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() =>
    receive(submitted.next, '1.00', { ...engineer, siteIds: [99] }),
  ).toThrow(expect.objectContaining({ code: 'OUT_OF_SCOPE' }));
  const partial = receive(submitted.next, '1.50');
  expect(partial.next.items[0]).toMatchObject({
    state: 'REMAINING',
    receivedQty: '1.50',
  });
  expect(partial.next.status).toBe('FULFILMENT');
  expect(partial.notify.map((n) => 'holdersOf' in n && n.holdersOf)).toEqual([
    'purchasing.handleRemaining',
  ]);
  const coming = life.applyStillComing(
    partial.next,
    only('purchasing.handleRemaining'),
    { version: partial.next.version, itemId: 11 },
    now,
  );
  const full = receive(coming.next, '2.50');
  expect(full.next.items[0]).toMatchObject({
    state: 'RECEIVED',
    receivedQty: '4.00',
  });
  expect(full.next.status).toBe('COMPLETED');
  expect(full.events.map((e) => [e.type, e.actorId])).toEqual([
    ['RECEIPT_RECORDED', 55],
    ['COMPLETED', null],
  ]);
});

it('releases rounds left waiting for the removed approval exactly once, as the system', () => {
  const { state, input } = sample('releasePendingPricing');
  state.createdById = 55;
  state.items.push(
    { ...life.openItem(data(12), 2), state: 'AWAITING_RECEIPT' },
    { ...life.openItem(data(13), 3), state: 'AWAITING_APPROVAL' },
    { ...life.openItem(data(14), 4), state: 'RECEIVED', receivedQty: '4.00' },
  );
  const decided = {
    status: 'APPROVED' as const,
    decidedById: 3,
    decidedAt: '2026-11-01T08:00:00.000Z',
    lines: [{ ...roundLine, itemId: 12, lineNo: 2, catalogItemId: 112 }],
  };
  state.rounds = [
    { ...decided, number: 1 },
    { ...state.rounds[0]!, number: 2 },
    {
      number: 3,
      status: 'PENDING',
      decidedById: null,
      decidedAt: null,
      lines: [
        {
          ...roundLine,
          itemId: 13,
          lineNo: 3,
          catalogItemId: null,
          supplierId: 9,
          lineTotal: '7.00',
        },
      ],
    },
  ];
  state.supplyOrders = [
    { number: 1, supplierId: 8, sent: true, lines: decided.lines },
  ];
  for (const who of [viewer, only('purchasing.price')])
    expect(life.canReleasePendingPricing(state, who, input)).toMatchObject({
      code: 'SYSTEM_ONLY',
    });
  const released = life.applyReleasePendingPricing(state, null, input, now);
  expect(released.next.status).toBe('FULFILMENT');
  expect(life.deriveStage(released.next)).toBe('AWAITING_RECEIPT');
  expect(released.next.items.map((i) => i.state)).toEqual([
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'RECEIVED',
  ]);
  // Historical approval decisions, pricing and completed receipts stay exactly as they were.
  expect(released.next.rounds[0]).toEqual({ ...decided, number: 1 });
  expect(released.next.rounds.slice(1)).toEqual(
    state.rounds
      .slice(1)
      .map((round) => ({ ...round, status: 'SUBMITTED' as const })),
  );
  expect(released.next.items[3]!.receivedQty).toBe('4.00');
  expect(
    released.next.supplyOrders.map((o) => [
      o.number,
      o.supplierId,
      o.sent,
      o.lines.map((l) => l.itemId),
    ]),
  ).toEqual([
    [1, 8, true, [12]],
    [2, 8, false, [11]],
    [3, 9, false, [13]],
  ]);
  expect(released.priceRecords).toEqual([
    expect.objectContaining({
      requestItemId: 11,
      source: 'SUBMITTED',
      unitPrice: '3.38',
    }),
  ]);
  expect(released.events).toEqual([
    expect.objectContaining({
      type: 'PRICING_RELEASED',
      actorId: null,
      stageAfter: 'AWAITING_RECEIPT',
      itemIds: [11, 13],
      payload: { roundNos: [2, 3] },
    }),
  ]);
  expect(
    released.notify.map((n) => ('userId' in n ? n.userId : n.holdersOf)),
  ).toEqual([55, 'receipt.record', 'purchasing.sendSupplyOrder']);
  expect(released.next.version).toBe(state.version + 1);
  // A rerun finds nothing pending and changes nothing.
  expect(
    life.canReleasePendingPricing(released.next, null, {
      version: released.next.version,
    }),
  ).toMatchObject({ code: 'ROUND_NOT_PENDING' });
  expect(life.pendingRounds(released.next)).toEqual([]);
  // A pending round whose line is no longer awaiting approval is refused rather than guessed.
  const stale = structuredClone(state);
  stale.items[0]!.state = 'CANCELLED';
  expect(life.canReleasePendingPricing(stale, null, input)).toMatchObject({
    code: 'WRONG_ITEM_STATE',
  });
});
it('records multiple partial receipts, same-supplier follow-up and repricing of only the outstanding quantity', () => {
  const { state } = sample('recordReceipt');
  const receive = (s: life.RequestState, quantity: string) =>
    life.applyRecordReceipt(
      s,
      viewer,
      { version: s.version, lines: [{ itemId: 11, quantity }], note: 'وصل' },
      now,
    );
  for (const quantity of ['0', '-1', '4.01', '1.001', 'NaN'])
    expect(
      life.canRecordReceipt(state, viewer, {
        version: 1,
        lines: [{ itemId: 11, quantity }],
      }),
    ).toMatchObject({ code: 'INVALID_QUANTITY' });
  const one = receive(state, '0.10');
  expect(one.next.items[0]).toMatchObject({
    receivedQty: '0.10',
    state: 'REMAINING',
  });
  expect(one.events[0]).toMatchObject({
    payload: {
      lines: [{ quantity: '0.10', outstanding: '3.90' }],
      note: 'وصل',
    },
    stageAfter: 'REMAINING',
  });
  expect(() => receive(one.next, '1')).toThrow(
    expect.objectContaining({ code: 'WRONG_ITEM_STATE' }),
  );
  const waiting = life.applyStillComing(
    one.next,
    viewer,
    { itemId: 11, version: 2 },
    now,
  );
  expect(waiting.next.items[0]).toMatchObject({
    supplierId: 8,
    lineTotal: '13.50',
    state: 'AWAITING_RECEIPT',
  });
  expect(waiting.next.supplyOrders).toEqual([]);
  const two = receive(waiting.next, '1.20');
  expect(two.next.items[0]?.receivedQty).toBe('1.30');
  for (const supplierId of [8, 15]) {
    const repriced = life.applyRepriceRemaining(
      two.next,
      viewer,
      { version: 4, itemId: 11, supplierId, lineTotal: '10.80' },
      now,
    );
    expect(repriced.next.items[0]).toMatchObject({
      state: 'AWAITING_RECEIPT',
      pricedQuantity: '2.70',
      receivedQty: '1.30',
      supplierId,
    });
    expect(repriced.next.rounds).toEqual([]);
    expect(repriced.priceRecords[0]).toMatchObject({
      unitPrice: '4.00',
      quantity: '2.70',
    });
    expect(repriced.next.supplyOrders).toHaveLength(supplierId === 8 ? 0 : 1);
    const done = receive(repriced.next, '2.70');
    expect(done.next).toMatchObject({
      status: 'COMPLETED',
      items: [{ receivedQty: '4.00', state: 'RECEIVED' }],
    });
    expect(done.events.map((e) => [e.type, e.stageAfter, e.actorId])).toEqual([
      ['RECEIPT_RECORDED', 'AWAITING_RECEIPT', 7],
      ['COMPLETED', 'COMPLETED', null],
    ]);
    expect(done.notify).toEqual([]);
  }
  const external = life.applyResolveExternally(
    two.next,
    viewer,
    { itemId: 11, version: 4 },
    now,
  );
  expect(external.next).toMatchObject({
    status: 'COMPLETED',
    items: [{ state: 'RESOLVED_EXTERNALLY', receivedQty: '1.30' }],
  });
});
it('refuses an entire receipt when any later line is invalid and identifies missing and duplicate lines', () => {
  const s = fixture('FULFILMENT', 'AWAITING_RECEIPT');
  s.items.push({ ...life.openItem(data(12), 2), state: 'AWAITING_RECEIPT' });
  const initial = structuredClone(s);
  for (const [line, code] of [
    [{ itemId: 12, quantity: '5' }, 'INVALID_QUANTITY'],
    [{ itemId: 99, quantity: '1' }, 'ITEM_NOT_FOUND'],
    [{ itemId: 11, quantity: '1' }, 'DUPLICATE'],
  ] as const) {
    expect(() =>
      life.applyRecordReceipt(
        s,
        viewer,
        { version: 1, lines: [{ itemId: 11, quantity: '2' }, line] },
        now,
      ),
    ).toThrow(expect.objectContaining({ code }));
    expect(s).toEqual(initial);
  }
  const partial = life.applyRecordReceipt(
    s,
    viewer,
    {
      version: 1,
      lines: [
        { itemId: 11, quantity: '4' },
        { itemId: 12, quantity: '2' },
      ],
    },
    now,
  );
  expect(partial.next.items.map((i) => i.state)).toEqual([
    'RECEIVED',
    'REMAINING',
  ]);
  expect(partial.notify).toHaveLength(1);
});
it('completes all externally resolved items before pricing and ignores removed lines in automatic decisions', () => {
  const s = fixture('AT_PURCHASING', 'UNAVAILABLE');
  s.items.push({ ...life.openItem(data(12), 2), state: 'REMOVED' });
  const done = life.applyResolveExternally(
    s,
    viewer,
    { version: 1, itemId: 11, note: 'اتحل' },
    now,
  );
  expect(done.next.status).toBe('COMPLETED');
  expect(done.events.map((e) => e.type)).toEqual([
    'ITEM_RESOLVED_EXTERNALLY',
    'COMPLETED',
  ]);
  for (const [state, expected] of [
    ['CANCELLED', null],
    ['REMOVED', null],
    ['OPEN', null],
    ['REJECTED', 'REJECTED'],
    ['RECEIVED', 'COMPLETED'],
    ['RESOLVED_EXTERNALLY', 'COMPLETED'],
  ] as const) {
    const s = fixture('FULFILMENT', state);
    if (expected)
      expect(
        life.applyAutoComplete(s, null, { version: 1 }, now).next.status,
      ).toBe(expected);
    else
      expect(life.canAutoComplete(s, null, { version: 1 })).toMatchObject({
        code: 'NOT_CLOSED',
      });
  }
});
it('cancels only open lines, retaining all receipts and pricing history', () => {
  const s = fixture('FULFILMENT');
  s.items = life.itemStates.map((state, index) => ({
    ...life.openItem(data(index + 1), index + 1),
    state,
    receivedQty: '2.00',
  }));
  const cancelled = life.applyCancel(
    s,
    viewer,
    { version: 1, reason: 'انتهت الأعمال' },
    now,
  );
  expect(cancelled.next.items.map((i) => i.state)).toEqual([
    'CANCELLED',
    'CANCELLED',
    'CANCELLED',
    'CANCELLED',
    'CANCELLED',
    'RECEIVED',
    'RESOLVED_EXTERNALLY',
    'REJECTED',
    'CANCELLED',
    'REMOVED',
  ]);
  expect(cancelled.next.items.every((i) => i.receivedQty === '2.00')).toBe(
    true,
  );
  expect(cancelled.events[0]).toMatchObject({
    type: 'CANCELLED',
    stageAfter: 'CANCELLED',
    payload: { reason: 'انتهت الأعمال' },
  });
});
it('checks batch selection and sent markers and never considers an unsent selection sent', () => {
  const { state } = sample('markBatchSent');
  for (const pair of [
    { batchId: 999, supplierId: 8 },
    { batchId: 3, supplierId: 9 },
  ])
    expect(
      life.canMarkBatchSent(state, viewer, { version: 1, ...pair }),
    ).toMatchObject({ code: 'NO_PENDING_SEND' });
  expect(
    life.canCreateBatch(state, viewer, {
      version: 1,
      batchId: 3,
      itemIds: [11],
      supplierIds: [8],
    }),
  ).toMatchObject({ code: 'DUPLICATE' });
  const sent = life.applyMarkBatchSent(
    state,
    viewer,
    { version: 1, batchId: 3, supplierId: 8 },
    now,
  );
  expect(
    life.canMarkBatchSent(sent.next, viewer, {
      version: 2,
      batchId: 3,
      supplierId: 8,
    }),
  ).toMatchObject({ code: 'NO_PENDING_SEND' });
  const decided = sample('releasePendingPricing');
  decided.state.rounds[0]!.status = 'SUBMITTED';
  expect(
    life.canReleasePendingPricing(decided.state, null, { version: 1 }),
  ).toMatchObject({ code: 'ROUND_NOT_PENDING' });
});
it('accepts and clears a separate delivery fee and validates both money fields', () => {
  const s = fixture('AT_PURCHASING');
  const fee = life.applyEditDeliveryFee(
    s,
    viewer,
    { version: 1, deliveryFee: '10.10' },
    now,
  );
  expect(fee.events[0]).toMatchObject({
    payload: { before: null, after: '10.10' },
  });
  expect(
    life.canEditDeliveryFee(fee.next, viewer, {
      version: 2,
      deliveryFee: '10.10',
    }),
  ).toMatchObject({ code: 'NO_CHANGES' });
  expect(
    life.applyEditDeliveryFee(
      fee.next,
      viewer,
      { version: 2, deliveryFee: null },
      now,
    ).next.deliveryFee,
  ).toBeNull();
  for (const value of ['-1', '1.230', '1e4', '1000000000000', 'NaN']) {
    expect(
      life.canEditDeliveryFee(s, viewer, { version: 1, deliveryFee: value }),
    ).toMatchObject({ code: 'INVALID_INPUT' });
    expect(
      life.canSavePricingDraft(s, viewer, {
        version: 1,
        itemId: 11,
        supplierId: 8,
        lineTotal: value,
      }),
    ).toMatchObject({ code: 'INVALID_INPUT' });
  }
  expect(life.unitPrice('999999999999.99', '3')).toBe('333333333333.33');
});
