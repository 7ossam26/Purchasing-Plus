import { describe, expect, it } from 'vitest';

import {
  cairoReportPeriod,
  recordQuerySchema,
  reportQuerySchema,
} from '@purchasing-plus/shared';

describe('Cairo report periods', () => {
  it('uses Cairo dates for today and the inclusive last seven days', () => {
    const now = new Date('2026-01-01T22:30:00Z');
    expect(cairoReportPeriod({ preset: 'today' }, now)).toEqual({
      from: '2026-01-02',
      to: '2026-01-02',
      start: '2026-01-01T22:00:00.000Z',
      endExclusive: '2026-01-02T22:00:00.000Z',
    });
    expect(cairoReportPeriod({ preset: 'last7' }, now)).toEqual({
      from: '2025-12-27',
      to: '2026-01-02',
      start: '2025-12-26T22:00:00.000Z',
      endExclusive: '2026-01-02T22:00:00.000Z',
    });
  });

  it('defaults to the Cairo calendar month and handles the leap year and year rollover', () => {
    const now = new Date('2024-02-29T22:05:00Z');
    expect(cairoReportPeriod({}, now)).toMatchObject({
      from: '2024-03-01',
      to: '2024-03-31',
    });
    expect(cairoReportPeriod({ preset: 'lastMonth' }, now)).toMatchObject({
      from: '2024-02-01',
      to: '2024-02-29',
    });
    expect(
      cairoReportPeriod(
        { preset: 'lastMonth' },
        new Date('2025-01-01T00:00:00Z'),
      ),
    ).toMatchObject({
      from: '2024-12-01',
      to: '2024-12-31',
    });
  });

  it.each([
    ['2026-04-24', '2026-04-23T22:00:00.000Z', '2026-04-24T21:00:00.000Z'],
    ['2026-10-29', '2026-10-28T21:00:00.000Z', '2026-10-29T22:00:00.000Z'],
  ])(
    'includes the entire Cairo DST transition date %s',
    (day, start, endExclusive) => {
      expect(
        cairoReportPeriod({ preset: 'custom', from: day, to: day }, new Date()),
      ).toEqual({
        from: day,
        to: day,
        start,
        endExclusive,
      });
    },
  );

  it('validates both bounds, query values and incompatible filter combinations', () => {
    const schema = reportQuerySchema('spending');
    for (const query of [
      { preset: 'custom', from: '2024-04-01' },
      { from: '2024-02-30', to: '2024-03-02' },
      { from: '2024-04-02', to: '2024-04-01' },
      { preset: 'today', from: '2024-04-01', to: '2024-04-01' },
      { siteId: '2147483648' },
      { itemId: '1' },
    ])
      expect(schema.safeParse(query).success).toBe(false);
    expect(
      reportQuerySchema('price-history').parse({ itemId: '1' }),
    ).toMatchObject({ itemId: 1 });
    expect(
      recordQuerySchema('requests').parse({ status: 'COMPLETED' }),
    ).toMatchObject({
      status: 'COMPLETED',
      page: 1,
      pageSize: 30,
    });
    expect(
      recordQuerySchema('receipts').safeParse({ status: 'COMPLETED' }).success,
    ).toBe(false);
    expect(() => cairoReportPeriod({ preset: 'custom' }, new Date())).toThrow(
      RangeError,
    );
  });
});
