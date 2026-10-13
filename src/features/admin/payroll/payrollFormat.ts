import type { Locale } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';

const AMOUNT = /^-?\d+(\.\d{1,2})?$/;

function localeTag(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
}

export function formatMoney(amount: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

export function formatDay(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function formatShortDay(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function shiftDate(date: string, days: number) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function parseAmount(input: string): number | null {
  const value = input.trim();
  if (!AMOUNT.test(value)) return null;
  const amount = Number(value);
  return amount === 0 ? null : amount;
}

export function payrollFilename(
  startsOn: string,
  endsOn: string,
  detail: boolean,
) {
  return `payroll-${detail ? 'detail-' : ''}${startsOn}-to-${endsOn}.csv`;
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}
