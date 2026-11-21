import { expect, it } from 'vitest';

import * as life from '../../src/lifecycle/index.js';

import { data, fixture, now, sample, viewer } from './fixtures.js';

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

it('keeps unavailable items, freezes round totals, and generates supplier orders and half-up catalog prices on approval', () => {
  const s = fixture('AT_PURCHASING');
  s.items.push(
    life.openItem(data(12), 2),
    life.openItem({ ...data(13), catalogItemId: null, otherName: 'أخرى' }, 3),
    life.openItem(data(14), 4),
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
  const submit = life.applySubmitPricing(fee.next, viewer, { version: 6 }, now);
  expect(submit.next.items.map((i) => i.state)).toEqual([
    'AWAITING_APPROVAL',
    'AWAITING_APPROVAL',
    'AWAITING_APPROVAL',
    'UNAVAILABLE',
  ]);
  expect(submit.events[0]).toMatchObject({
    type: 'PRICING_SUBMITTED',
    stageAfter: 'AWAITING_APPROVAL',
    payload: { roundNo: 1, roundTotal: '11.42', deliveryFee: '50.00' },
  });
  const approved = life.applyApprovePricing(
    submit.next,
    viewer,
    { roundNo: 1, version: 7 },
    now,
  );
  expect(approved.next.rounds[0]).toMatchObject({
    status: 'APPROVED',
    decidedById: 7,
    decidedAt: now.toISOString(),
  });
  expect(
    approved.next.supplyOrders.map((o) => [
      o.supplierId,
      o.lines.map((l) => l.itemId),
    ]),
  ).toEqual([
    [8, [11, 12]],
    [9, [13]],
  ]);
  expect(approved.priceRecords).toEqual([
    {
      requestItemId: 11,
      source: 'APPROVED',
      catalogItemId: 111,
      supplierId: 8,
      lineTotal: '1.02',
      quantity: '4.00',
      unitPrice: '0.26',
    },
    {
      requestItemId: 12,
      source: 'APPROVED',
      catalogItemId: 112,
      supplierId: 8,
      lineTotal: '10.10',
      quantity: '4.00',
      unitPrice: '2.53',
    },
  ]);
  expect(
    life.canRejectPricing(approved.next, viewer, {
      version: 8,
      roundNo: 1,
      reason: 'تعديل',
    }),
  ).toMatchObject({ code: 'ROUND_NOT_PENDING' });
  const sent = life.applyMarkSupplyOrderSent(
    approved.next,
    viewer,
    { orderNo: 2, version: 8 },
    now,
  );
  expect(sent.events[0]).toMatchObject({
    type: 'SUPPLY_ORDER_SENT_MARKED',
    payload: { supplierId: 9, lineNos: [3] },
  });
  expect(
    life.canMarkSupplyOrderSent(sent.next, viewer, { orderNo: 2, version: 9 }),
  ).toMatchObject({ code: 'NO_PENDING_SEND' });
  const nextPrice = life.applyPriceUnavailable(
    sent.next,
    viewer,
    { itemId: 14, version: 9, supplierId: 8, lineTotal: '12.30' },
    now,
  );
  const nextRound = life.applySubmitPricing(
    nextPrice.next,
    viewer,
    { version: 10 },
    now,
  );
  expect(nextRound.next.rounds[1]).toMatchObject({
    number: 2,
    status: 'PENDING',
    lines: [{ itemId: 14 }],
  });
  const rejected = life.applyRejectPricing(
    nextRound.next,
    viewer,
    { version: 11, roundNo: 2, reason: 'غالي' },
    now,
  );
  expect(rejected.next.status).toBe('FULFILMENT');
  expect(rejected.next.items.map((i) => i.state)).toEqual([
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'AWAITING_RECEIPT',
    'REJECTED',
  ]);
  expect(rejected.events.map((e) => e.type)).toEqual(['PRICING_REJECTED']);
});
it('first round rejection is final even with unavailable lines, and later rejection closes only its round', () => {
  const { state } = sample('rejectPricing');
  state.items.push({ ...life.openItem(data(12), 2), state: 'UNAVAILABLE' });
  const reject = (s: life.RequestState, n: number) =>
    life.applyRejectPricing(
      s,
      viewer,
      { roundNo: n, reason: 'تعديل', version: s.version },
      now,
    );
  const first = reject(state, 1);
  expect(first.next.status).toBe('REJECTED');
  expect(first.events.map((e) => [e.type, e.actorId])).toEqual([
    ['PRICING_REJECTED', 7],
    ['REJECTED_AUTO', null],
  ]);
  state.rounds[0]!.number = 2;
  expect(reject(state, 2).next.status).toBe('FULFILMENT');
  state.items[1]!.state = 'RECEIVED';
  expect(reject(state, 2).next.status).toBe('COMPLETED');
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
  const invalid = sample('approvePricing');
  expect(
    life.canApprovePricing(invalid.state, viewer, { version: 1, roundNo: 2 }),
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
