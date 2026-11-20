import { describe, expect, it } from 'vitest';

import { ar } from '../src/index.js';

describe('Arabic strings', () => {
  it('exports the app name for the placeholder screen', () => {
    expect(ar.appName).toBe('Purchasing+');
  });
});
