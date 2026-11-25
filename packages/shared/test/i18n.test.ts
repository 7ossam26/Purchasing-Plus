import { describe, expect, it } from 'vitest';

import { purchasingUi } from '../src/i18n/ar.js';
import { ar } from '../src/index.js';

describe('Arabic strings', () => {
  it('exports the app name for the placeholder screen', () => {
    expect(ar.appName).toBe('Purchasing+');
  });
  it('labels the final pricing action as sending to the engineer, not for approval', () => {
    expect(purchasingUi.submit).toBe('إرسال للمهندس للاستلام');
    for (const text of [
      purchasingUi.submit,
      purchasingUi.submitQuestion,
      purchasingUi.submitted,
    ])
      expect(text).not.toContain('للاعتماد');
  });
});
