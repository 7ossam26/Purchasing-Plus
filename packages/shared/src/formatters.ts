export const locale = 'ar-EG-u-nu-latn';
export const businessTimeZone = 'Africa/Cairo';
const money = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'EGP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
const date = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeZone: businessTimeZone,
});
const dateTime = new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: businessTimeZone,
});
const calendar = new Intl.DateTimeFormat(locale, {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: businessTimeZone,
});
const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
type DateValue = string | number | Date;
const instant = (value: DateValue) =>
  new Date(value instanceof Date ? value.getTime() : value);

// Intl accepts decimal strings without rounding them through a binary float.
export function formatMoney(value: string) {
  return (money.format as (decimal: number | bigint | string) => string)(value);
}
export function formatNumber(value: number | bigint | string) {
  return (number.format as (value: number | bigint | string) => string)(value);
}
export function formatDate(value: DateValue) {
  return date.format(instant(value));
}
export function formatDateTime(value: DateValue) {
  return dateTime.format(instant(value));
}

export function cairoDay(value: Date) {
  const parts = calendar.formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(read('year'), read('month') - 1, read('day')) / 86400000;
}
export function formatRelative(
  value: DateValue,
  reference: DateValue = new Date(),
) {
  const target = instant(value);
  const now = instant(reference);
  const days = cairoDay(target) - cairoDay(now);
  if (Math.abs(days) >= 365)
    return relative.format(Math.trunc(days / 365), 'year');
  if (Math.abs(days) >= 30)
    return relative.format(Math.trunc(days / 30), 'month');
  if (days) return relative.format(days, 'day');
  const seconds = Math.trunc((target.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) >= 3600)
    return relative.format(Math.trunc(seconds / 3600), 'hour');
  if (Math.abs(seconds) >= 60)
    return relative.format(Math.trunc(seconds / 60), 'minute');
  return relative.format(seconds, 'second');
}
