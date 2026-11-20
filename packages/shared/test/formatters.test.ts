import { describe, expect, it } from 'vitest';

import {
  businessTimeZone,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatRelative,
  locale,
} from '../src/formatters.js';
import { statusMap } from '../src/lifecycle/statuses.js';

describe('Egyptian Arabic formatting', () => {
  it('formats decimal strings with Western digits and preserves EGP cents', () => {
    expect(formatMoney('999999999999.99')).toMatch(/999,999,999,999\.99/);
    expect(formatMoney('1234.5')).toBe(
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
      }).format(1234.5),
    );
    expect(formatNumber('1234.125')).toBe('1,234.125');
    expect(formatNumber(12n)).toBe('12');
  });
  it('uses Cairo time in summer and winter', () => {
    const summer = '2026-07-10T21:30:00Z';
    const winter = '2026-11-20T21:30:00Z';
    expect(formatDate(summer)).toContain('11');
    expect(formatDate(winter)).toContain('20');
    expect(formatDateTime(Date.parse(summer))).toBe(
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: businessTimeZone,
      }).format(new Date(summer)),
    );
  });
  it('uses the Cairo calendar for relative days as well as elapsed time within a day', () => {
    const now = new Date('2026-07-10T20:55:00Z');
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (const [value, count, unit] of [
      ['2027-07-11T20:55:00Z', 1, 'year'],
      ['2026-08-10T20:55:00Z', 1, 'month'],
      ['2026-07-10T21:05:00Z', 1, 'day'],
      ['2026-07-10T16:55:00Z', -4, 'hour'],
      ['2026-07-10T20:50:00Z', -5, 'minute'],
      ['2026-07-10T20:54:55Z', -5, 'second'],
    ] as const)
      expect(formatRelative(value, now)).toBe(relative.format(count, unit));
  });
});
describe('status presentation', () => {
  it('covers stored statuses, displayed stages, item states and urgency', () => {
    expect(Object.keys(statusMap)).toEqual(
      expect.arrayContaining([
        'DRAFT',
        'AWAITING_MANAGER',
        'RETURNED',
        'AT_PURCHASING',
        'PAUSED',
        'FULFILMENT',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
        'OPEN',
        'UNAVAILABLE',
        'AWAITING_APPROVAL',
        'AWAITING_RECEIPT',
        'REMAINING',
        'RECEIVED',
        'RESOLVED_EXTERNALLY',
        'REMOVED',
        'NORMAL',
        'URGENT',
        'VERY_URGENT',
        'OVERDUE',
      ]),
    );
    for (const value of Object.values(statusMap)) {
      expect(value.label).toMatch(/[\u0600-\u06ff]/);
      expect(value.glyph).toBeTruthy();
    }
    expect(statusMap.AWAITING_APPROVAL).toEqual({
      label: 'بانتظار اعتماد التسعير',
      tone: 'pending',
      glyph: 'clock',
    });
    expect(statusMap.VERY_URGENT.tone).toBe('danger');
    expect(statusMap.COMPLETED).toEqual({
      label: 'مكتمل',
      tone: 'success',
      glyph: 'check',
    });
  });
});
