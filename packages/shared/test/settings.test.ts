import { expect, it } from 'vitest';

import {
  defaultSettings,
  renderMessageTemplate,
  settingsSchema,
} from '../src/settings.js';

it('accepts the seed templates and all supported placeholders', () => {
  expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
  const input =
    '{requestNumber} {siteName} {siteAddress} {categoryName} {siteName}';
  expect(
    settingsSchema.parse({ rfqIntro: input, supplyOrderIntro: input })
      .agingDays,
  ).toBe(3);
  expect(
    renderMessageTemplate(input + ' {other}', {
      requestNumber: '42',
      siteName: 'الموقع',
      siteAddress: 'القاهرة',
      categoryName: 'دهانات',
    }),
  ).toBe('42 الموقع القاهرة دهانات الموقع {other}');
});

it.each([
  '{unknown}',
  '{{siteName}}',
  '{siteName',
  'siteName}',
  '{}',
  '{ siteName }',
])('rejects unsupported or malformed placeholders %s', (rfqIntro) =>
  expect(
    settingsSchema.safeParse({ ...defaultSettings, rfqIntro }).success,
  ).toBe(false),
);

it.each([0, 61, 1.5, '3', null])(
  'rejects invalid day count %s',
  (agingDays) => {
    expect(
      settingsSchema.safeParse({ ...defaultSettings, agingDays }).success,
    ).toBe(false);
  },
);

it.each([1, 60])('accepts day count boundary %s', (agingDays) => {
  expect(
    settingsSchema.parse({ ...defaultSettings, agingDays }).agingDays,
  ).toBe(agingDays);
});
