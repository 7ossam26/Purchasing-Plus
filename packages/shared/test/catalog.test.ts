import { describe, expect, it } from 'vitest';

import {
  formatEgyptianMobile,
  normalizeArabic,
  normalizeEgyptianMobile,
} from '../src/catalog/normalize.js';

describe('Egyptian mobiles', () => {
  it.each(['010', '011', '012', '015'])(
    'normalizes and formats %s in all accepted input forms',
    (prefix) => {
      const local = prefix + '12345678';
      const digits = '20' + local.slice(1);
      const display = prefix + '1 234 5678';
      for (const input of [
        local,
        digits,
        '+' + digits,
        '00' + digits,
        display,
        ` +20-${prefix.slice(1)} 1234-5678 `,
        `00 20 ${prefix.slice(1)}-1234-5678`,
      ]) {
        expect(normalizeEgyptianMobile(input)).toEqual({ ok: true, digits });
      }
      expect(formatEgyptianMobile(digits)).toBe(display);
    },
  );

  it.each([
    '0212345678',
    '031234567',
    '+20212345678',
    '01312345678',
    '01412345678',
    '01612345678',
    '01712345678',
    '01812345678',
    '01912345678',
    '00112345678',
    '0101234567',
    '010123456789',
    '+20101234567',
    '2010123456789',
    '1012345678',
    '+2001012345678',
    '002001012345678',
    '2001012345678',
    '00211012345678',
    '+201012345678 ext 2',
    '01012345abc',
    '(010)12345678',
    '010.1234.5678',
    '٠١٠١٢٣٤٥٦٧٨',
    '',
    ' - ',
  ])('rejects malformed or non-mobile input %j', (input) => {
    expect(normalizeEgyptianMobile(input)).toEqual({
      ok: false,
      error: 'INVALID_EGYPTIAN_MOBILE',
    });
  });

  it.each(['01012345678', '+201012345678', '201312345678', ''])(
    'formats canonical stored numbers only (%j)',
    (input) => {
      expect(() => formatEgyptianMobile(input)).toThrow(RangeError);
    },
  );
});

describe('Arabic search normalization', () => {
  it.each([
    ['أ إ آ ا', 'ا ا ا ا'],
    ['هُدَى مقلة', 'هدي مقله'],
    ['مُــفَتِّحٌ', 'مفتح'],
    ['أ إ آ', 'ا ا ا'],
    ['ٱلرَّحْمَٰن', 'ٱلرحمن'],
    [' \tأرض  \n دهان\u00a0', 'ارض دهان'],
    ['ELC-0001 Café 12.5', 'ELC-0001 Café 12.5'],
    ['ًـ  ', ''],
    ['', ''],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeArabic(input)).toBe(expected);
    expect(normalizeArabic(expected)).toBe(expected);
  });
});
