import type { Locale } from '@/i18n/core/types';

/**
 * Locale-aware date formatting (W3.1). Renders an ISO date/timestamp in the
 * active locale; falls back to the raw ISO date on any parse error.
 */
export function formatDate(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}
