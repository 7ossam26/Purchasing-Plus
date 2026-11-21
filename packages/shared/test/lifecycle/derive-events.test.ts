import { expect, it } from 'vitest';

import * as life from '../../src/lifecycle/index.js';
import type { PermissionKey } from '../../src/permissions/index.js';

import {
  apply,
  data,
  fixture,
  names,
  now,
  only,
  sample,
  viewer,
} from './fixtures.js';

it('derives mixed stages in priority order and counts each state including historical removals', () => {
  const s = fixture('FULFILMENT');
  s.items = life.itemStates.map((state, n) => ({
    ...life.openItem(data(n + 1), n + 1),
    state,
  }));
  expect(life.stateCounts(s)).toEqual(
    Object.fromEntries(life.itemStates.map((k) => [k, 1])),
  );
  expect(life.deriveStage(s)).toBe('AWAITING_APPROVAL');
  for (const [closed, stage] of [
    ['AWAITING_APPROVAL', 'AWAITING_RECEIPT'],
    ['AWAITING_RECEIPT', 'REMAINING'],
    ['REMAINING', 'REMAINING'],
    ['UNAVAILABLE', 'AT_PURCHASING'],
  ] as const) {
    s.items.find((i) => i.state === closed)!.state = 'RECEIVED';
    expect(life.deriveStage(s)).toBe(stage);
  }
  for (const status of life.requestStatuses.filter((s) => s !== 'FULFILMENT'))
    expect(life.deriveStage({ ...s, status })).toBe(status);
});
it('starts the stage clock on entry, restarts on re-entry, and suppresses aging for final states', () => {
  const make = (stageAfter: life.DisplayedStage, minute: number) => ({
    stageAfter,
    at: new Date(Date.UTC(2026, 5, 1, 12, minute)).toISOString(),
  });
  const entry = make('AT_PURCHASING', 1),
    pause = make('PAUSED', 15),
    reentry = make('AT_PURCHASING', 15);
  expect(life.stageStartedAt([])).toBeNull();
  expect(life.stageStartedAt([entry, make('AT_PURCHASING', 10)])).toBe(
    entry.at,
  );
  expect(
    life.stageStartedAt([entry, pause, reentry, make('AT_PURCHASING', 59)]),
  ).toBe(reentry.at);
  for (const stage of ['COMPLETED', 'CANCELLED', 'REJECTED'] as const)
    expect(
      life.isAging(life.stageStartedAt([entry, make(stage, 60)]), now, 0),
    ).toBe(false);
});
it('uses Cairo calendar days with a strict threshold at midnight and across both DST changes', () => {
  expect(
    life.isAging('2026-01-01T21:59:00Z', new Date('2026-01-04T21:59:59Z'), 3),
  ).toBe(false);
  expect(
    life.isAging('2026-01-01T21:59:00Z', new Date('2026-01-04T22:00:00Z'), 3),
  ).toBe(true);
  // Cairo begins DST on April 25 in 2025. Two local midnights fit inside 24 hours.
  expect(
    life.isAging('2025-04-24T21:59:00Z', new Date('2025-04-25T21:00:00Z'), 1),
  ).toBe(true);
  // Clocks roll back at the end of October 30. The repeated 23:30 is still the same date.
  expect(
    life.isAging('2025-10-30T20:30:00Z', new Date('2025-10-30T21:30:00Z'), 0),
  ).toBe(false);
  expect(
    life.isAging('2025-10-30T20:30:00Z', new Date('2025-10-30T22:00:00Z'), 0),
  ).toBe(true);
});
it('sorts queue rows by urgency then by elapsed stage time, including timestamps with offsets', () => {
  const row = (urgency: life.Urgency, stageStartedAt: string) => ({
    urgency,
    stageStartedAt,
  });
  const a = row('URGENT', '2026-01-01T05:00:00+02:00'),
    b = row('URGENT', '2026-01-01T04:00:00Z'),
    c = row('VERY_URGENT', '2026-11-01T00:00:00Z'),
    d = row('NORMAL', '2026-01-01T00:00:00Z');
  expect([b, d, c, a].toSorted(life.compareQueue)).toEqual([c, a, b, d]);
  expect(life.compareQueue(a, a)).toBe(0);
});
it.each([
  ['drafts', 'DRAFT', 'OPEN', 'requests.create'],
  ['drafts', 'RETURNED', 'OPEN', 'requests.create'],
  ['manager', 'AWAITING_MANAGER', 'OPEN', 'requests.approve'],
  ['paused', 'PAUSED', 'OPEN', 'requests.editWhilePaused'],
  ['pricingApproval', 'FULFILMENT', 'AWAITING_APPROVAL', 'pricing.approve'],
  ['receipt', 'FULFILMENT', 'AWAITING_RECEIPT', 'receipt.record'],
  ['purchasing', 'AT_PURCHASING', 'OPEN', 'purchasing.price'],
  ['purchasing', 'AT_PURCHASING', 'OPEN', 'purchasing.sendRfq'],
  ['purchasing', 'AT_PURCHASING', 'OPEN', 'purchasing.returnForEdit'],
  ['purchasing', 'FULFILMENT', 'UNAVAILABLE', 'purchasing.price'],
  ['purchasing', 'FULFILMENT', 'OPEN', 'purchasing.price'],
  ['purchasing', 'FULFILMENT', 'REMAINING', 'purchasing.handleRemaining'],
] as const)(
  '%s queue for %s / %s requires %s and site access',
  (queue, status, item, key) => {
    const s = fixture(status, item),
      v = only(key);
    expect(life.inQueue(queue, s, v)).toBe(true);
    expect(life.inQueue(queue, s, only('requests.view'))).toBe(false);
    expect(life.inQueue(queue, s, { ...v, siteIds: [] })).toBe(false);
    expect(life.inQueue(queue, { ...s, status: 'COMPLETED' }, v)).toBe(false);
    expect(life.inQueue(queue, { ...s, deleted: true }, v)).toBe(false);
    if (queue === 'drafts')
      expect(life.inQueue(queue, s, { ...v, userId: 99 })).toBe(false);
  },
);
it('places an unsent order in the senders’ queue and removes it immediately after marking it sent', () => {
  const { state } = sample('markSupplyOrderSent'),
    v = only('purchasing.sendSupplyOrder');
  expect(life.inQueue('purchasing', state, v)).toBe(true);
  expect(
    life.inQueue('purchasing', state, only('purchasing.handleRemaining')),
  ).toBe(false);
  const sent = life.applyMarkSupplyOrderSent(
    state,
    v,
    { version: 1, orderNo: 1 },
    now,
  );
  expect(life.inQueue('purchasing', sent.next, v)).toBe(false);
});
const recipientRules: Partial<
  Record<life.ActionName, (PermissionKey | 'creator')[]>
> = {
  submit: ['requests.approve'],
  resubmit: ['requests.approve'],
  approve: ['purchasing.price'],
  resume: ['purchasing.price'],
  reject: ['creator'],
  returnForEdit: ['creator'],
  purchasingReturnForEdit: ['creator'],
  rejectPricing: ['creator'],
  submitPricing: ['pricing.approve'],
  approvePricing: ['creator', 'receipt.record', 'purchasing.sendSupplyOrder'],
  recordReceipt: ['purchasing.handleRemaining'],
};
it.each(names)(
  '%s emits exactly the specified recipient rules and excludes the actor and support users',
  (name) => {
    const { state, who, input } = sample(name);
    if (recipientRules[name]?.includes('creator')) state.createdById = 55;
    const result = apply(name, state, who, input);
    expect(
      result.notify.map((n) => ('userId' in n ? 'creator' : n.holdersOf)),
    ).toEqual(recipientRules[name] ?? []);
    for (const intent of result.notify) {
      const eligible = { ...viewer, userId: 'userId' in intent ? 55 : 90 };
      expect(intent).toMatchObject({
        requestId: state.id,
        siteId: state.siteId,
        excludeUserId: 7,
        excludeSuperadmins: true,
        event: result.events[0]!.type,
      });
      expect(life.matchesRecipient(intent, eligible)).toBe(true);
      expect(
        life.matchesRecipient(intent, { ...eligible, isSuperadmin: true }),
      ).toBe(false);
      expect(life.matchesRecipient(intent, viewer)).toBe(false);
      expect(life.matchesRecipient(intent, { ...eligible, siteIds: [] })).toBe(
        false,
      );
      expect(life.matchesRecipient(intent, { ...only(), userId: 99 })).toBe(
        false,
      );
    }
  },
);
it('omits direct notifications to a creator acting on their own request, and full receipts stay quiet', () => {
  const { state } = sample('approvePricing');
  const approval = life.applyApprovePricing(
    state,
    viewer,
    { roundNo: 1, version: 1 },
    now,
  );
  expect(approval.notify.map((n) => 'holdersOf' in n && n.holdersOf)).toEqual([
    'receipt.record',
    'purchasing.sendSupplyOrder',
  ]);
  const receipt = life.applyRecordReceipt(
    approval.next,
    viewer,
    { version: 2, lines: [{ itemId: 11, quantity: '4.00' }] },
    now,
  );
  expect(receipt.notify).toEqual([]);
});
it('validates and describes every specified event, including conversion and linked copies', () => {
  const all = names.flatMap((name) => {
    const { state, who, input } = sample(name);
    return apply(name, state, who, input).events;
  });
  const seed = fixture();
  seed.version = 0;
  all.push(...life.applySaveDraft(seed, viewer, { version: 0 }, now).events);
  all.push({
    type: 'ADDED_TO_CATALOG',
    payload: { lineNo: 1, code: 'T01' },
    itemIds: [11],
    actorId: 7,
    at: now.toISOString(),
    stageAfter: 'AT_PURCHASING',
    requestId: 1,
  });
  expect(new Set(all.map((e) => e.type))).toEqual(
    new Set(Object.keys(life.eventPayloadSchemas)),
  );
  for (const e of all) {
    const schema = life.eventPayloadSchemas[e.type];
    expect(schema.safeParse(e.payload).success).toBe(true);
    expect(schema.safeParse({ ...e.payload, unexpected: true }).success).toBe(
      false,
    );
    expect(life.describeEvent(e)).toMatch(/[ء-ي].*\.$/);
  }
  const external = all.find((e) => e.type === 'ITEM_RESOLVED_EXTERNALLY')!;
  expect(
    life.describeEvent({
      ...external,
      actorName: 'منى',
      actorRoleName: 'متابعة',
    }),
  ).toContain('منى (متابعة)');
  const rejection = all.find((e) => e.type === 'PRICING_REJECTED')!;
  expect(life.describeEvent({ ...rejection, actorName: 'منى' })).toContain(
    'تعديل مطلوب',
  );
  expect(
    life.eventPayloadSchemas.EDITED.safeParse({
      fields: [{ field: 'note', before: 'a' }],
      changed: [],
      removed: [],
      added: [],
    }).success,
  ).toBe(false);
  expect(
    life.eventPayloadSchemas.RECEIPT_RECORDED.safeParse({
      lines: [{ itemId: 11, lineNo: 1, quantity: '0', outstanding: '2' }],
      note: null,
    }).success,
  ).toBe(false);
});
