import { ApiError } from '@/lib/api';
import type { Locale } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { formatDate } from '@/lib/date';

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

export function templateTitle(
  t: { titleEn: string; titleZh: string | null },
  locale: Locale,
): string {
  return localizeField(t.titleEn, t.titleZh, locale) || t.titleEn;
}

/** Formats a `YYYY-MM-DD` calendar date without shifting it across time zones. */
export function formatDay(isoDate: string | null, locale: Locale): string {
  if (!isoDate) return '—';
  return formatDate(`${isoDate}T12:00:00`, locale);
}

export function shortHash(hash: string | null): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

export function formatBytes(bytes: number, locale: Locale): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
