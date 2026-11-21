import { normalizeEgyptianMobile } from './catalog/normalize.js';
import { renderTemplate } from './settings.js';

type RfqRequest = {
  requestNumber: string;
  siteName: string;
  categoryName: string;
};
type RfqItem = {
  lineNo: number;
  name: string;
  specs: string;
  quantity: string;
  unit: string;
};

export function buildRfqMessage(
  template: string,
  request: RfqRequest,
  items: readonly RfqItem[],
) {
  const intro = renderTemplate(template, request).trim();
  const lines = items.map(({ lineNo, name, specs, quantity, unit }) =>
    [`${lineNo}) ${name}`, specs.trim(), `${quantity} ${unit}`]
      .filter(Boolean)
      .join(' – '),
  );
  return [intro, ...lines].filter(Boolean).join('\n');
}

export function buildWhatsAppUrl(digits: string, text: string) {
  const normalized = normalizeEgyptianMobile(digits);
  if (!normalized.ok || normalized.digits !== digits)
    throw new RangeError('Expected normalized Egyptian mobile digits');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(text.replace(/[\uD800-\uDFFF]/gu, '\uFFFD'))}`;
  return { url, tooLong: url.length > 4000 };
}
