const localMobile = /^0(1[0125][0-9]{8})$/;
const internationalMobile = /^(?:\+20|0020|20)(1[0125][0-9]{8})$/;
const storedMobile = /^20(1[0125][0-9]{8})$/;

export function normalizeEgyptianMobile(
  input: string,
):
  | { ok: true; digits: string }
  | { ok: false; error: 'INVALID_EGYPTIAN_MOBILE' } {
  const compact = input.replace(/[\s-]/gu, '');
  const match = localMobile.exec(compact) ?? internationalMobile.exec(compact);
  return match
    ? { ok: true, digits: `20${match[1]}` }
    : { ok: false, error: 'INVALID_EGYPTIAN_MOBILE' };
}

export function formatEgyptianMobile(digits: string): string {
  const match = storedMobile.exec(digits);
  if (!match)
    throw new RangeError('Expected a normalized Egyptian mobile number');
  const local = `0${match[1]}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export function normalizeArabic(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\p{Mark}/gu, (mark) =>
      /\p{Script_Extensions=Arabic}/u.test(mark) ? '' : mark,
    )
    .replace(/ـ/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .replace(/ى/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/\s+/gu, ' ')
    .trim();
}
