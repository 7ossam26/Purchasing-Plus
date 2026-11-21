import { z } from 'zod';

export const templateKeys = [
  'requestNumber',
  'siteName',
  'siteAddress',
  'categoryName',
] as const;
type TemplateKey = (typeof templateKeys)[number];
const allowed = new Set<string>(templateKeys);
const placeholder = /\{([^{}]*)\}/g;
const messageTemplate = z
  .string()
  .refine(
    (value) =>
      !/[{}]/.test(
        value.replace(placeholder, (token, key: string) =>
          allowed.has(key) ? '' : token,
        ),
      ),
  );

export const settingsSchema = z.strictObject({
  rfqIntro: messageTemplate,
  supplyOrderIntro: messageTemplate,
  agingDays: z.number().int().min(1).max(60).default(3),
});
export type Settings = z.output<typeof settingsSchema>;

export const defaultSettings: Settings = {
  rfqIntro: 'السلام عليكم، ممكن سعر للآتي؟ (طلب {requestNumber})',
  supplyOrderIntro:
    'السلام عليكم، تم اعتماد طلب {requestNumber}. برجاء توريد الآتي إلى موقع {siteName} – {siteAddress}:',
  agingDays: 3,
};

export function renderTemplate(
  template: string,
  values: Partial<Record<TemplateKey, string>>,
) {
  return template.replace(placeholder, (token, key: string) =>
    allowed.has(key) ? (values[key as TemplateKey] ?? token) : token,
  );
}
export const renderMessageTemplate = renderTemplate;
