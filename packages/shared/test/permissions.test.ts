import { describe, expect, it } from 'vitest';

import {
  areas,
  closeOverRequires,
  isPermissionKey,
  modules,
  registry,
  validateRoleKeys,
} from '../src/permissions/index.js';
describe('registry', () => {
  it('has unique, documented permissions with known acyclic dependencies', () => {
    const keys = registry.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    function walk(key: string, path: string[]) {
      expect(path).not.toContain(key);
      const p = registry.find((x) => x.key === key)!;
      expect(p).toBeDefined();
      for (const dep of p.requires) walk(dep, [...path, key]);
    }
    for (const p of registry) {
      walk(p.key, []);
      expect(p.label + p.consequence).toMatch(/[ء-ي]/);
      if (!p.superadminOnly) expect(areas()).toContain(p.area);
    }
    for (const m of modules) expect(m.anyOf.every(isPermissionKey)).toBe(true);
  });
  it('validates exact selections without silently adding grants', () => {
    expect(
      validateRoleKeys(['purchasing.price', 'typo', 'system.auditLog']),
    ).toEqual({
      valid: false,
      unknown: ['typo'],
      restricted: ['system.auditLog'],
      missing: [
        'requests.view',
        'requests.viewPrices',
        'requests.viewSupplierNames',
      ],
    });
    expect(
      validateRoleKeys(closeOverRequires(['purchasing.price', 'typo'])).valid,
    ).toBe(true);
  });
});
