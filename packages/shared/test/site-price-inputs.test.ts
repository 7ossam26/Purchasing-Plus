import { describe, expect, it } from 'vitest';

import {
  createSite,
  createSiteInput,
  editSiteInput,
  siteEngineerFilters,
} from '../src/access.js';
import {
  catalogUnitPrice,
  createCatalogItem,
  editCatalogItem,
  editCatalogItemInEditor,
} from '../src/catalog/schemas.js';
import { isPermissionKey, siteEngineerKey } from '../src/permissions/index.js';
import { requestListInput } from '../src/request-inputs.js';

describe('site inputs with engineer assignments', () => {
  it('defaults to no engineers and leaves the plain site schema unchanged', () => {
    expect(createSiteInput.parse({ name: ' الموقع ' })).toEqual({
      name: 'الموقع',
      address: '',
      engineerIds: [],
    });
    // Import reuses the plain schema, which must not grow an assignment field.
    expect(createSite.safeParse({ name: 'x', engineerIds: [1] }).success).toBe(
      false,
    );
  });

  it('accepts unique engineer ids and rejects duplicates, overlaps and oversized lists', () => {
    expect(
      createSiteInput.parse({ name: 'x', engineerIds: [3, 1] }).engineerIds,
    ).toEqual([3, 1]);
    for (const engineerIds of [
      [1, 1],
      [0],
      [-2],
      [1.5],
      ['1'],
      Array.from({ length: 201 }, (_, i) => i + 1),
    ])
      expect(
        createSiteInput.safeParse({ name: 'x', engineerIds }).success,
      ).toBe(false);
    expect(editSiteInput.parse({ engineers: { add: [2] } }).engineers).toEqual({
      add: [2],
      remove: [],
    });
    expect(editSiteInput.parse({ address: 'شارع' })).toEqual({
      address: 'شارع',
    });
    for (const engineers of [
      { add: [1], remove: [1] },
      { add: [1, 1], remove: [] },
      { add: [], remove: [], extra: [] },
    ])
      expect(editSiteInput.safeParse({ engineers }).success).toBe(false);
  });

  it('defines engineers by a registered permission key', () => {
    expect(isPermissionKey(siteEngineerKey)).toBe(true);
    expect(siteEngineerFilters.parse({ search: 'م' })).toEqual({
      page: 1,
      pageSize: 25,
      search: 'م',
    });
    expect(siteEngineerFilters.safeParse({ active: 'true' }).success).toBe(
      false,
    );
  });
});

describe('catalog unit price', () => {
  it('accepts Decimal(14,2) strings and keeps null distinct from zero', () => {
    for (const [input, output] of [
      ['0', '0'],
      ['0.00', '0.00'],
      ['12.5', '12.5'],
      ['999999999999.99', '999999999999.99'],
      [null, null],
    ] as const)
      expect(catalogUnitPrice.parse(input)).toBe(output);
    for (const input of [
      '',
      '-1',
      '1.234',
      '01',
      '1e3',
      ' 1',
      '1,000',
      '١٢',
      '1000000000000',
      12,
      undefined,
    ])
      expect(catalogUnitPrice.safeParse(input).success).toBe(false);
  });

  it('is optional on every item write so existing callers stay valid', () => {
    const item = { name: 'صنف', nodeId: 1, unitId: 2 };
    expect(createCatalogItem.parse(item).unitPrice).toBeUndefined();
    expect(
      createCatalogItem.parse({ ...item, unitPrice: null }).unitPrice,
    ).toBe(null);
    expect(editCatalogItem.parse({ unitPrice: '7' })).toEqual({
      unitPrice: '7',
    });
    expect(editCatalogItemInEditor.parse({ unitPrice: null })).toEqual({
      unitPrice: null,
    });
    expect(editCatalogItem.safeParse({ unitPrice: '-7' }).success).toBe(false);
  });
});

describe('request list workspace', () => {
  it('accepts only the purchasing workspace alongside the existing filters', () => {
    expect(
      requestListInput.parse({ workspace: 'purchasing', stage: 'DRAFT' }),
    ).toMatchObject({ workspace: 'purchasing', stage: 'DRAFT', page: 1 });
    expect(requestListInput.parse({}).workspace).toBeUndefined();
    expect(requestListInput.safeParse({ workspace: 'all' }).success).toBe(
      false,
    );
  });
});
