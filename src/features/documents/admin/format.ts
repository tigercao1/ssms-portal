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
