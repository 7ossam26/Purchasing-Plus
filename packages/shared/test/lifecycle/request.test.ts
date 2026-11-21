import { expect, it } from 'vitest';

import * as life from '../../src/lifecycle/index.js';

import {
  apply,
  data,
  fixture,
  guard,
  now,
  roundLine,
  viewer,
} from './fixtures.js';

it('keeps a saved quote when an editor only reformats the same decimal quantity', () => {
  const s = fixture('PAUSED');
  Object.assign(s.items[0]!, {
    supplierId: 8,
    lineTotal: '40.00',
    pricedQuantity: '4.00',
  });
  s.batches = [{ id: 1, itemIds: [11], supplierIds: [8], sentTo: [8] }];
  const input = {
    version: 1,
    fields: { note: 'تأكيد' },
    change: [{ itemId: 11, fields: { quantity: '4' } }],
  };
  const edited = life.applyEditWhilePaused(s, viewer, input, now);
  expect(edited.next.items).toEqual(s.items);
  expect(edited.events[0]).toMatchObject({
    payload: { changed: [], fields: [{ field: 'note', after: 'تأكيد' }] },
  });
  expect(input.change[0]!.fields.quantity).toBe('4');
});

it('returns, revises, resubmits and approves the same numbered request, and refuses a competing old decision', () => {
  const s = fixture('DRAFT');
  const sent = life.applySubmit(s, viewer, { version: 1, sequence: 5 }, now);
  const manager = { ...viewer, userId: 88 };
  const returned = life.applyReturnForEdit(
    sent.next,
    manager,
    { version: 2, reason: '  راجع العدد  ' },
    now,
  );
  expect(returned.next.status).toBe('RETURNED');
  expect(returned.events[0]).toMatchObject({
    type: 'RETURNED_FOR_EDIT',
    actorId: 88,
    payload: { reason: 'راجع العدد' },
  });
  const edit = life.applyEditBeforeApproval(
    returned.next,
    viewer,
    {
      version: 3,
      change: [{ itemId: 11, fields: { quantity: '5', specs: undefined } }],
      fields: { urgency: undefined },
    },
    now,
  );
  expect(edit.next.items[0]).toMatchObject({ quantity: '5', specs: 'أبيض' });
  expect(edit.next.urgency).toBe('NORMAL');
  const again = life.applyResubmit(edit.next, viewer, { version: 4 }, now);
  expect(again.next).toMatchObject({
    status: 'AWAITING_MANAGER',
    isModified: true,
    number: sent.next.number,
  });
  const adjusted = life.applyEditQuantities(
    again.next,
    manager,
    { version: 5, lines: [{ itemId: 11, quantity: '3.25' }] },
    now,
  );
  const approved = life.applyApprove(
    adjusted.next,
    manager,
    { version: 6 },
    now,
  );
  expect(approved.next).toMatchObject({
    status: 'AT_PURCHASING',
    approvedById: 88,
    items: [{ quantity: '3.25' }],
  });
  expect(
    life.canReject(approved.next, manager, { version: 6, reason: 'تغيير' }),
  ).toMatchObject({ code: 'VERSION_CONFLICT' });
  const rejected = life.applyReject(
    adjusted.next,
    manager,
    { version: 6, reason: 'تغيير' },
    now,
  );
  expect(rejected.next.status).toBe('REJECTED');
  expect(life.canApprove(rejected.next, manager, { version: 7 })).toMatchObject(
    { code: 'WRONG_STATUS' },
  );
});

it('closes a paused request when an edit removes the last open line and the other line was resolved', () => {
  const s = fixture('AT_PURCHASING', 'UNAVAILABLE');
  s.items.push(life.openItem(data(12), 2));
  const resolved = life.applyResolveExternally(
    s,
    viewer,
    { version: 1, itemId: 11 },
    now,
  );
  const paused = life.applyPause(
    resolved.next,
    viewer,
    { version: 2, reason: 'مراجعة' },
    now,
  );
  const edited = life.applyEditWhilePaused(
    paused.next,
    viewer,
    { version: 3, remove: [12] },
    now,
  );
  expect(edited.events.map((e) => [e.type, e.stageAfter])).toEqual([
    ['EDITED', 'PAUSED'],
    ['COMPLETED', 'COMPLETED'],
  ]);
  expect(edited.next).toMatchObject({
    status: 'COMPLETED',
    pausedAt: null,
    pausedById: null,
    pauseReason: null,
  });
});

it('creates and autosaves a draft, renumbers draft lines, and assigns the Cairo year only at first submit', () => {
  const initial = life.draftState({
    id: 1,
    createdById: viewer.userId,
    siteId: 2,
    categoryId: 3,
  });
  const saved = life.applySaveDraft(
    initial,
    viewer,
    { version: 0, add: [data(), data(12)] },
    now,
  );
  expect(saved.events.map((e) => e.type)).toEqual(['CREATED']);
  expect(saved.next.number).toBeNull();
  const autosave = life.applySaveDraft(
    saved.next,
    viewer,
    {
      version: 1,
      remove: [11],
      add: [data(13)],
      fields: { siteId: 2, note: 'اختبار' },
    },
    now,
  );
  expect(autosave.events).toEqual([]);
  expect(autosave.next.items.map((i) => [i.id, i.lineNo])).toEqual([
    [12, 1],
    [13, 2],
  ]);
  const sent = life.applySubmit(
    autosave.next,
    viewer,
    { version: 2, sequence: 15 },
    now,
  );
  expect(sent.next).toMatchObject({
    number: 'PR-2027-00015',
    version: 3,
    status: 'AWAITING_MANAGER',
  });
  expect(
    life.canSubmit(sent.next, viewer, { version: 2, sequence: 15 }),
  ).toMatchObject({ code: 'VERSION_CONFLICT' });
  expect(
    life.canSubmit(initial, viewer, { version: 0, sequence: 1 }),
  ).toMatchObject({ code: 'ITEMS_REQUIRED' });
  expect(
    life.applyDeleteDraft(
      autosave.next,
      viewer,
      { version: 2, confirm: true },
      now,
    ).next.deleted,
  ).toBe(true);
});
it('keeps submitted line numbers and emits a before/after diff with added and removed snapshots', () => {
  const s = fixture('AWAITING_MANAGER');
  s.items.push(life.openItem(data(12), 2));
  const r = life.applyEditBeforeApproval(
    s,
    viewer,
    {
      version: 1,
      fields: { unitOrClient: 'عميل', note: 'تغيير' },
      remove: [11],
      change: [{ itemId: 12, fields: { specs: 'رمادي', quantity: '8' } }],
      add: [data(13)],
    },
    now,
  );
  expect(r.next.items.map((i) => [i.id, i.lineNo, i.state])).toEqual([
    [11, 1, 'REMOVED'],
    [12, 2, 'OPEN'],
    [13, 3, 'OPEN'],
  ]);
  expect(r.next.isModified).toBe(true);
  const diff = life.diffRequest(s, r.next);
  expect(diff).toMatchObject({
    fields: [
      { field: 'unitOrClient', before: null, after: 'عميل' },
      { field: 'note', before: null, after: 'تغيير' },
    ],
    removed: [{ id: 11, lineNo: 1, snapshot: data().snapshot }],
    added: [{ id: 13, lineNo: 3 }],
    changed: [
      {
        itemId: 12,
        lineNo: 2,
        fields: [
          { field: 'specs', before: 'أبيض', after: 'رمادي' },
          { field: 'quantity', before: '4.00', after: '8' },
        ],
      },
    ],
  });
  expect(r.events[0]).toMatchObject({
    type: 'EDITED',
    payload: diff,
    itemIds: [12, 13, 11],
  });
});
it('compares nested snapshots by value, without depending on attribute insertion order', () => {
  const s = fixture('RETURNED'),
    original = s.items[0]!.snapshot;
  original.attributes = { color: 'red', size: 'M' };
  const change = (snapshot: life.LineData['snapshot']) =>
    life.canEditBeforeApproval(s, viewer, {
      version: 1,
      change: [{ itemId: 11, fields: { snapshot } }],
    });
  expect(
    change({ ...original, attributes: { size: 'M', color: 'red' } }),
  ).toMatchObject({ code: 'NO_CHANGES' });
  expect(change({ ...original, nodePath: ['آخر'] })).toEqual({ ok: true });
});
it.each(['DRAFT', 'AWAITING_MANAGER', 'RETURNED'] as const)(
  'creator can lower urgency in %s until a raise locks it',
  (status) => {
    const s = fixture(status);
    s.urgency = 'URGENT';
    const edit = status === 'DRAFT' ? 'saveDraft' : 'editBeforeApproval';
    const lower = apply(edit, s, viewer, {
      version: 1,
      fields: { urgency: 'NORMAL' },
    });
    expect(lower.next.urgency).toBe('NORMAL');
    const locked = life.applyRaiseUrgency(
      lower.next,
      viewer,
      { version: 2, urgency: 'URGENT' },
      now,
    );
    expect(locked.events[0]).toMatchObject({
      type: 'URGENCY_CHANGED',
      payload: { from: 'NORMAL', to: 'URGENT', locked: true },
    });
    expect(locked.notify).toEqual([]);
    for (const urgency of ['NORMAL', 'VERY_URGENT'])
      expect(
        guard(edit, locked.next, viewer, { version: 3, fields: { urgency } }),
      ).toMatchObject({ code: 'URGENCY_LOCKED' });
    for (const urgency of ['NORMAL', 'URGENT'] as const)
      expect(
        life.canRaiseUrgency(locked.next, viewer, { version: 3, urgency }),
      ).toMatchObject({ code: 'MUST_RAISE' });
    const raised = life.applyRaiseUrgency(
      locked.next,
      viewer,
      { version: 3, urgency: 'VERY_URGENT' },
      now,
    );
    expect(raised.next.urgency).toBe('VERY_URGENT');
    expect(
      life.availableActions(raised.next, viewer).map((a) => a.action),
    ).not.toContain('raiseUrgency');
  },
);
it('clears only edited draft prices, marks only previously sent lines and resumes for purchasing', () => {
  const s = fixture('AT_PURCHASING');
  s.items.push(...[12, 13, 14].map((id, i) => life.openItem(data(id), i + 2)));
  Object.assign(s.items[0]!, {
    supplierId: 8,
    lineTotal: '4',
    pricedQuantity: '4',
  });
  s.items[2]!.supplierId = 9;
  s.items[3]!.lineTotal = '4';
  const batch = life.applyCreateBatch(
    s,
    viewer,
    { version: 1, batchId: 5, itemIds: [11, 12], supplierIds: [8] },
    now,
  );
  const marked = life.applyMarkBatchSent(
    batch.next,
    viewer,
    { version: 2, batchId: 5, supplierId: 8 },
    now,
  );
  const paused = life.applyPurchasingReturnForEdit(
    marked.next,
    viewer,
    { version: 3, reason: 'المقاسات' },
    now,
  );
  expect(paused.next).toMatchObject({
    status: 'PAUSED',
    pausedById: 7,
    pausedAt: now.toISOString(),
    pauseReason: 'المقاسات',
  });
  const edited = life.applyEditWhilePaused(
    paused.next,
    { ...viewer, userId: 99 },
    {
      version: 4,
      change: [11, 12, 13].map((itemId) => ({
        itemId,
        fields: { quantity: '2.25' },
      })),
    },
    now,
  );
  expect(
    edited.next.items.map((i) => [
      i.lineTotal,
      i.supplierId,
      i.needsRepricing,
      i.modifiedAfterSend,
    ]),
  ).toEqual([
    [null, null, true, true],
    [null, null, false, true],
    [null, null, true, false],
    ['4', null, false, false],
  ]);
  const resumed = life.applyResume(edited.next, viewer, { version: 5 }, now);
  expect(resumed.next).toMatchObject({
    status: 'AT_PURCHASING',
    pausedById: null,
    pausedAt: null,
    pauseReason: null,
  });
  expect(
    life.canSubmitPricing(resumed.next, viewer, { version: 6 }),
  ).toMatchObject({ code: 'NEEDS_REPRICING' });
  const afterPrice = life.applySavePricingDraft(
    resumed.next,
    viewer,
    { version: 6, itemId: 11, supplierId: 8, lineTotal: '25.12' },
    now,
  );
  expect(afterPrice.events).toEqual([]);
  const unavailable = life.applyMarkUnavailable(
    afterPrice.next,
    viewer,
    { version: 7, itemId: 13, note: 'نفد' },
    now,
  );
  const priced = life.applySubmitPricing(
    unavailable.next,
    viewer,
    { version: 8 },
    now,
  );
  expect(priced.next.items.map((i) => i.state)).toEqual([
    'AWAITING_APPROVAL',
    'OPEN',
    'UNAVAILABLE',
    'OPEN',
  ]);
});
it('refuses injected fields, duplicate and unknown lines, invalid quantities, scope changes and invalid item identities', () => {
  const s = fixture();
  const check = (input: unknown, code: life.RefusalCode) =>
    expect(
      guard('saveDraft', s, viewer, { version: 1, ...(input as object) }),
    ).toMatchObject({ ok: false, code });
  check({ fields: { siteId: 9 } }, 'OUT_OF_SCOPE');
  check(
    { change: [{ itemId: 11, fields: { state: 'RECEIVED' } }] },
    'INVALID_INPUT',
  );
  check(
    { remove: [11], change: [{ itemId: 11, fields: { specs: 'x' } }] },
    'DUPLICATE',
  );
  check({ remove: [12] }, 'ITEM_NOT_FOUND');
  check({ add: [data()] }, 'DUPLICATE');
  check({ add: [{ ...data(12), catalogItemId: null }] }, 'INVALID_INPUT');
  check(
    { change: [{ itemId: 11, fields: { otherName: 'آخر' } }] },
    'INVALID_INPUT',
  );
  for (const quantity of ['0', '-1', '1.001', '1e2', 'unknown', 1.5])
    check(
      { change: [{ itemId: 11, fields: { quantity } }] },
      'INVALID_QUANTITY',
    );
  expect(
    guard('editBeforeApproval', { ...s, status: 'RETURNED' }, viewer, {
      version: 1,
      fields: { siteId: 99 },
    }),
  ).toMatchObject({ code: 'INVALID_INPUT' });
  expect(
    guard('editWhilePaused', { ...s, status: 'PAUSED' }, viewer, {
      version: 1,
      fields: { urgency: 'URGENT' },
    }),
  ).toMatchObject({ code: 'INVALID_INPUT' });
});
it('copies live lines to a fresh draft and links both timelines, refreshing catalog data and converting inactive items', () => {
  const s = fixture('REJECTED', 'REJECTED');
  s.number = 'PR-2026-00001';
  s.unitOrClient = 'شقة';
  s.urgency = 'VERY_URGENT';
  s.urgencyLocked = true;
  s.items.push(
    life.openItem(data(12), 2),
    life.openItem(data(13), 3),
    life.openItem(data(14), 4),
  );
  s.items[2]!.state = 'REMOVED';
  s.items[3]!.catalogItemId = null;
  s.items[3]!.otherName = 'قديم';
  s.rounds.push({
    number: 1,
    lines: [roundLine],
    status: 'REJECTED',
    decidedById: 7,
    decidedAt: now.toISOString(),
  });
  const current = {
    active: true,
    snapshot: { ...data().snapshot, name: 'اسم جديد' },
    unitId: 66,
    nodeId: 44,
  };
  const lines = [
    { sourceItemId: 11, newItemId: 41, current },
    { sourceItemId: 12, newItemId: 42, current: { ...current, active: false } },
    { sourceItemId: 14, newItemId: 44, current: null },
  ];
  const input = { version: 1, newId: 20, siteId: 2, lines };
  expect(
    life.applyCopyRequest(s, viewer, { version: 1, newId: 20, lines }, now)
      .copiedDraft?.siteId,
  ).toBe(s.siteId);
  const r = life.applyCopyRequest(s, { ...viewer, userId: 99 }, input, now);
  expect(r.copiedDraft).toMatchObject({
    id: 20,
    unitOrClient: 'شقة',
    createdById: 99,
    copiedFromId: 1,
    status: 'DRAFT',
    urgency: 'NORMAL',
    urgencyLocked: false,
    number: null,
    version: 1,
    items: [
      { id: 41, unitId: 66, nodeId: 44, snapshot: current.snapshot },
      { id: 42, catalogItemId: null, otherName: 'بلاط' },
      { id: 44, otherName: 'قديم' },
    ],
  });
  expect(r.events.map((e) => [e.type, e.requestId, e.payload])).toEqual([
    ['COPIED_TO', 1, { requestId: 20, number: null }],
    ['COPIED_FROM', 20, { requestId: 1, number: s.number }],
  ]);
  const rejected = { ...input, roundNo: 1, lines: [lines[0]!] };
  expect(
    life.applyCopyRequest(s, viewer, rejected, now).copiedDraft?.items,
  ).toHaveLength(1);
  for (const input of [
    { ...rejected, roundNo: 9 },
    { ...rejected, lines: [] },
    { ...rejected, lines: [lines[1]!] },
  ])
    expect(life.canCopyRequest(s, viewer, input)).toMatchObject({
      code: 'INVALID_INPUT',
    });
  expect(life.canCopyRequest(s, viewer, { ...input, siteId: 9 })).toMatchObject(
    { code: 'OUT_OF_SCOPE' },
  );
  expect(life.canCopyRequest(s, viewer, { ...input, newId: 1 })).toMatchObject({
    code: 'DUPLICATE',
  });
});
