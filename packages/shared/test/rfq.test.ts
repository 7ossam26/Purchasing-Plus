import { expect, it } from 'vitest';

import {
  buildRfqMessage,
  buildWhatsAppUrl,
  renderTemplate,
} from '../src/index.js';

const request = {
  requestNumber: 'PR-2026-00001',
  siteName: 'الرحاب',
  categoryName: 'كهرباء',
};
const items = [
  {
    lineNo: 3,
    name: 'لمبة',
    specs: '  لون أبيض  ',
    quantity: '2.50',
    unit: 'قطعة',
  },
  { lineNo: 7, name: 'سلك', specs: ' ', quantity: '10', unit: 'متر' },
];

it('fills RFQ placeholders and renders each line without empty specs', () => {
  expect(
    buildRfqMessage(
      'سعر لطلب {requestNumber} في {siteName} ({categoryName})',
      request,
      items,
    ),
  ).toBe(
    'سعر لطلب PR-2026-00001 في الرحاب (كهرباء)\n3) لمبة – لون أبيض – 2.50 قطعة\n7) سلك – 10 متر',
  );
  expect(buildRfqMessage('', request, items.slice(1))).toBe('7) سلك – 10 متر');
  expect(buildRfqMessage('مقدمة', request, [])).toBe('مقدمة');
});

it('uses the same replacement for supply orders and preserves unknown or missing tokens', () => {
  expect(
    renderTemplate('{siteName}/{siteName} {siteAddress} {unknown}', {
      siteName: 'موقع {siteAddress}',
      siteAddress: 'شارع 1',
    }),
  ).toBe('موقع {siteAddress}/موقع {siteAddress} شارع 1 {unknown}');
  expect(
    renderTemplate('{categoryName} {siteAddress}', { siteAddress: '' }),
  ).toBe('{categoryName} ');
});

it('encodes Arabic, reserved characters, emoji and line breaks in a wa.me link', () => {
  const digits = '201012345678';
  const text = 'سعر & كمية؟\nقطعتين 🧰';
  expect(buildWhatsAppUrl(digits, text)).toEqual({
    url: 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text),
    tooLong: false,
  });
  expect(buildWhatsAppUrl(digits, '\ud800').url).toContain('%EF%BF%BD');
  for (const invalid of [
    '+201012345678',
    '01012345678',
    '201612345678',
    '201012345678/other',
  ])
    expect(() => buildWhatsAppUrl(invalid, text)).toThrow(RangeError);
});

it('measures the entire encoded URL at the 4000 character boundary', () => {
  const digits = '201012345678';
  const prefix = buildWhatsAppUrl(digits, '').url.length;
  const arabic = 'س'.repeat(Math.floor((4000 - prefix) / 6));
  const padding = 'x'.repeat(4000 - prefix - arabic.length * 6);
  expect(buildWhatsAppUrl(digits, arabic + padding)).toMatchObject({
    tooLong: false,
    url: expect.any(String),
  });
  expect(buildWhatsAppUrl(digits, arabic + padding).url).toHaveLength(4000);
  expect(buildWhatsAppUrl(digits, arabic + padding + 'x').tooLong).toBe(true);
});
