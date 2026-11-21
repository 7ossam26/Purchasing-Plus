import { formatDuration } from '@purchasing-plus/shared';
import {
  ar,
  requestUi,
  timelineUi as copy,
} from '@purchasing-plus/shared/i18n/ar';
import { statusMap } from '@purchasing-plus/shared/lifecycle';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import type { RequestEvent } from '../../lib/api/requests.js';

import { Timeline, timelineGap, timelineGroups } from './timeline.js';

const hour = 3_600_000;
const base = Date.parse('2026-11-16T06:00:00Z');
function event<T extends RequestEvent['type']>(
  id: number,
  type: T,
  stageAfter: RequestEvent['stageAfter'],
  hours: number,
  payload: Extract<RequestEvent, { type: T }>['payload'],
) {
  return {
    id,
    requestId: 1,
    type,
    stageAfter,
    payload,
    actorId: 4,
    actorName: 'هدى مصطفى',
    actorRoleName: 'متابعة الموقع',
    itemIds: [],
    at: new Date(base + hours * hour).toISOString(),
  } as RequestEvent;
}
const events = [
  event(1, 'CREATED', 'DRAFT', 0, {}),
  event(2, 'EDITED', 'DRAFT', 1, {
    fields: [{ field: 'note', before: 'الوصف القديم', after: 'الوصف الجديد' }],
    added: [
      {
        id: 9,
        catalogItemId: null,
        nodeId: 1,
        specs: '',
        quantity: '2.00',
        unitId: 1,
        otherName: 'صنف جديد',
        lineNo: 3,
        snapshot: {
          name: 'صنف جديد',
          code: null,
          unitName: 'قطعة',
          attributes: {},
          nodePath: [],
          coverImageKey: null,
        },
      },
    ],
    removed: [
      {
        id: 5,
        catalogItemId: null,
        nodeId: 1,
        specs: '',
        quantity: '1.00',
        unitId: 1,
        otherName: 'صنف قديم',
        lineNo: 1,
        snapshot: {
          name: 'صنف قديم',
          code: null,
          unitName: 'قطعة',
          attributes: {},
          nodePath: [],
          coverImageKey: null,
        },
      },
    ],
    changed: [
      {
        itemId: 6,
        lineNo: 2,
        fields: [{ field: 'quantity', before: '1.00', after: '3.00' }],
      },
    ],
  }),
  event(3, 'SUBMITTED', 'AWAITING_MANAGER', 4, {}),
  event(4, 'MANAGER_APPROVED', 'AT_PURCHASING', 52, {}),
  {
    ...event(5, 'BATCH_CREATED', 'AT_PURCHASING', 53, {
      batchId: 1,
      lineNos: [2, 3],
    }),
    batch: {
      lineNos: [2, 3],
      suppliers: [
        {
          name: ar.requests.supplier,
          sentAt: new Date(base + 54 * hour).toISOString(),
        },
        { name: ar.requests.supplier, sentAt: null },
      ],
    },
  },
  event(6, 'BATCH_SENT_MARKED', 'AT_PURCHASING', 54, { batchId: 1 }),
  event(7, 'DELIVERY_FEE_CHANGED', 'AT_PURCHASING', 55, {}),
];

afterEach(cleanup);

it('preserves chronological stage entries, including a return to a previously visited stage', () => {
  expect(formatDuration(-1000)).toBe(copy.lessThanMinute);
  const repeated = event(8, 'RETURNED_FOR_EDIT', 'DRAFT', 58, {
    reason: 'مراجعة',
  });
  const groups = timelineGroups([...events, repeated]);
  expect(groups.map((group) => [group.stage, group.events.length])).toEqual([
    ['DRAFT', 2],
    ['AWAITING_MANAGER', 1],
    ['AT_PURCHASING', 4],
    ['DRAFT', 1],
  ]);
  expect(groups[0]!.end - groups[0]!.start).toBe(hour);
  expect(groups[2]!.start - groups[1]!.start).toBe(48 * hour);
  const sizes = [0, 0.5, 1, 2, 12, 72, 168, 500].map((hours) =>
    timelineGap(hours * hour),
  );
  expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  expect(new Set(sizes).size).toBeGreaterThan(4);
  expect(sizes[0]).toBe(8);
  expect(sizes.at(-2)).toBe(64);
  expect(sizes.at(-1)).toBe(64);
});

it('shows elapsed stage durations, accessible timestamps, bold decisions and inline diffs', () => {
  const { container } = render(
    <Timeline events={events} retry={() => {}} error={null} />,
  );
  const stage = screen.getByRole('region', {
    name: statusMap.AWAITING_MANAGER.label,
  });
  expect(
    within(stage).getByText(copy.took(formatDuration(48 * hour))),
  ).toBeTruthy();
  expect(
    within(stage).getByText(copy.heldBy(copy.holders.AWAITING_MANAGER)),
  ).toBeTruthy();
  expect(stage.querySelector('ol > li time')?.getAttribute('datetime')).toBe(
    events[2]!.at,
  );
  expect(stage.querySelector('ol > li time')?.textContent).toContain('12:00');
  expect(
    container.querySelector<HTMLElement>('#request-event-4')?.tabIndex,
  ).toBe(0);
  const approval = within(
    container.querySelector<HTMLElement>('#request-event-4')!,
  );
  const name = approval.getByText('هدى مصطفى', { exact: true });
  const role = approval.getByText('متابعة الموقع', { exact: true });
  expect(name.closest('.font-bold')).toBe(role.closest('.font-bold'));
  expect(name.closest('.font-bold')).toBeTruthy();
  expect(screen.getByText('الوصف القديم').closest('del')).toBeTruthy();
  expect(screen.getByText('الوصف الجديد').closest('ins')).toBeTruthy();
  expect(screen.getByText(copy.added).closest('li')?.textContent).toContain(
    'صنف جديد',
  );
  expect(screen.getByText(copy.removed).closest('li')?.textContent).toContain(
    'صنف قديم',
  );
});

it('expands one batch row into send marks and item lines, and renders only redacted details', () => {
  render(<Timeline events={events} retry={() => {}} error={null} />);
  const summary = screen.getByText(copy.batchDetails);
  const details = summary.closest('details')!;
  expect(details.open).toBe(false);
  fireEvent.click(summary);
  expect(details.open).toBe(true);
  expect(within(details).getAllByText(ar.requests.supplier)).toHaveLength(2);
  expect(within(details).getByText(copy.unsent)).toBeTruthy();
  expect(within(details).getByText('2، 3')).toBeTruthy();
  expect(details.querySelector('time')?.dateTime).toBe(
    events[4]!.batch!.suppliers[0]!.sentAt,
  );
  expect(
    screen.queryByText(new RegExp(ar.lifecycle.events.BATCH_SENT_MARKED)),
  ).toBeNull();
  expect(screen.queryByText(copy.fields.deliveryFee)).toBeNull();
  expect(screen.queryByText(/المورد المحجوب|9999\.00/)).toBeNull();
});

it('filters independently of stage durations and provides empty and retry states', () => {
  const retry = () => {
    called = true;
  };
  let called = false;
  const { rerender } = render(<Timeline retry={retry} error={null} />);
  expect(
    screen.getByRole('status', { name: ar.common.loading }).children,
  ).toHaveLength(3);
  rerender(<Timeline events={[]} retry={retry} error={null} />);
  expect(screen.getByText(requestUi.noEvents)).toBeTruthy();
  rerender(
    <Timeline events={events} retry={retry} error={new Error('network')} />,
  );
  fireEvent.click(screen.getByRole('button', { name: ar.common.retry }));
  expect(called).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: copy.filters.edits }));
  expect(screen.getByText('الوصف الجديد')).toBeTruthy();
  expect(screen.getByText(copy.took(formatDuration(4 * hour)))).toBeTruthy();
  expect(screen.queryByText(copy.batchDetails)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: copy.filters.receipt }));
  expect(screen.getByText(copy.noMatches)).toBeTruthy();
  fireEvent.click(
    within(screen.getByText(copy.noMatches).parentElement!).getByRole('button'),
  );
  expect(screen.getByText(copy.batchDetails)).toBeTruthy();
});
