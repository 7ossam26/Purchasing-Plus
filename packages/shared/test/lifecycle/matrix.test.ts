import { describe, expect, it } from 'vitest';

import {
  actions,
  availableActions,
  eventPayloadSchemas,
  itemStates,
  requestStatuses,
  type ActionName,
  type ItemState,
  type RefusalCode,
} from '../../src/lifecycle/index.js';

import {
  apply,
  cases,
  guard,
  names,
  only,
  sample,
  viewer,
} from './fixtures.js';

describe.each(names)('%s transition', (name) => {
  const { state, who, input, statuses, key } = sample(name);
  it.each(requestStatuses)('%s', (status) => {
    const s = { ...state, status };
    const allowed = statuses.includes(status);
    expect(guard(name, s, who, input)).toMatchObject(
      allowed ? { ok: true } : { ok: false, code: 'WRONG_STATUS' },
    );
    if (allowed) {
      const before = structuredClone(s);
      const result = apply(name, s, who, input);
      expect(result.next.version).toBe(s.version + 1);
      expect(s).toEqual(before);
      expect(apply(name, s, who, input)).toEqual(result);
      for (const event of result.events)
        expect(
          eventPayloadSchemas[event.type].safeParse(event.payload).success,
        ).toBe(true);
    } else
      expect(() => apply(name, s, who, input)).toThrow(
        expect.objectContaining({ code: 'WRONG_STATUS' }),
      );
  });
  it('enforces identity, key and site independently of stage logic', () => {
    const support = { ...only(), siteIds: [], isSuperadmin: true };
    if (key === 'system') {
      for (const v of [viewer, only(), support])
        expect(guard(name, state, v, input)).toMatchObject({
          code: 'SYSTEM_ONLY',
        });
    } else {
      for (const v of [null, only('catalog.view')])
        expect(guard(name, state, v, input)).toMatchObject({
          code: 'FORBIDDEN',
        });
      expect(
        guard(name, state, { ...who!, siteIds: [99] }, input),
      ).toMatchObject({ code: 'OUT_OF_SCOPE' });
      expect(
        guard(name, state, { ...who!, siteIds: [], siteScope: 'ALL' }, input),
      ).toEqual({ ok: true });
      expect(guard(name, state, support, input)).toEqual({ ok: true });
    }
  });
  it('rejects a stale command and a deleted draft', () => {
    expect(
      guard(name, state, who, { ...input, version: state.version - 1 }),
    ).toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(guard(name, { ...state, deleted: true }, who, input)).toMatchObject({
      code: 'WRONG_STATUS',
    });
  });
});
const itemCases: Partial<
  Record<ActionName, { allowed: ItemState[]; code?: RefusalCode }>
> = {
  saveDraft: { allowed: ['OPEN'] },
  editBeforeApproval: { allowed: ['OPEN'] },
  editQuantities: { allowed: ['OPEN'] },
  editWhilePaused: { allowed: ['OPEN', 'UNAVAILABLE'] },
  createBatch: { allowed: ['OPEN', 'UNAVAILABLE'] },
  savePricingDraft: { allowed: ['OPEN'] },
  markUnavailable: { allowed: ['OPEN'] },
  markAvailable: { allowed: ['UNAVAILABLE'] },
  priceUnavailable: { allowed: ['UNAVAILABLE'] },
  submitPricing: { allowed: ['OPEN'], code: 'NO_PRICED_ITEMS' },
  approvePricing: { allowed: ['AWAITING_APPROVAL'] },
  rejectPricing: { allowed: ['AWAITING_APPROVAL'] },
  recordReceipt: { allowed: ['AWAITING_RECEIPT'] },
  stillComing: { allowed: ['REMAINING'] },
  repriceRemaining: { allowed: ['REMAINING'] },
  resolveExternally: { allowed: ['UNAVAILABLE', 'REMAINING'] },
};
describe.each(Object.keys(itemCases) as ActionName[])(
  '%s item-state matrix',
  (name) => {
    it.each(itemStates)('%s', (itemState) => {
      const { state, who, input } = sample(name);
      state.items[0]!.state = itemState;
      const c = itemCases[name]!;
      const code =
        name === 'editQuantities' && itemState === 'REMOVED'
          ? 'ITEMS_REQUIRED'
          : (c.code ?? 'WRONG_ITEM_STATE');
      expect(guard(name, state, who, input)).toMatchObject(
        c.allowed.includes(itemState) ? { ok: true } : { ok: false, code },
      );
    });
  },
);
it.each([
  'saveDraft',
  'deleteDraft',
  'submit',
  'editBeforeApproval',
  'resubmit',
] as const)('%s belongs to its creator', (name) => {
  const { state, who, input } = sample(name);
  expect(guard(name, state, { ...who!, userId: 99 }, input)).toMatchObject({
    code: 'NOT_CREATOR',
  });
});
it.each([
  'reject',
  'returnForEdit',
  'pause',
  'purchasingReturnForEdit',
  'rejectPricing',
  'cancel',
] as const)('%s needs a nonblank reason', (name) => {
  const { state, who, input } = sample(name);
  for (const reason of [undefined, '', '   '])
    expect(guard(name, state, who, { ...input, reason })).toMatchObject({
      ok: false,
      code: 'REASON_REQUIRED',
      message: expect.stringMatching(/[ء-ي]/),
    });
});
it('orders available actions by prominence and hides system, state and permission failures', () => {
  expect(names.toSorted()).toEqual(Object.keys(actions).toSorted());
  const { state } = sample('approve');
  const v = only(
    'requests.approve',
    'requests.returnForEdit',
    'requests.reject',
  );
  expect(availableActions(state, v)).toEqual([
    { action: 'approve', hint: 'primary' },
    { action: 'returnForEdit', hint: 'secondary' },
    { action: 'reject', hint: 'danger' },
  ]);
  expect(availableActions(state, { ...v, siteIds: [] })).toEqual([]);
  for (const name of names) {
    const s = sample(name);
    const listed = availableActions(s.state, s.who ?? viewer).map(
      (a) => a.action,
    );
    if (name === 'autoComplete') expect(listed).not.toContain(name);
    else expect(listed).toContain(name);
  }
  const empty = { ...state, status: 'DRAFT' as const, items: [] };
  expect(availableActions(empty, viewer).map((a) => a.action)).not.toContain(
    'submit',
  );
  expect(
    guard('deleteDraft', sample('deleteDraft').state, viewer, {
      ...cases.deleteDraft.input,
      confirm: false,
    }),
  ).toMatchObject({ code: 'CONFIRM_REQUIRED' });
});
