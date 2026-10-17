import { ApiError } from '@/lib/api';
import type { Locale, Messages } from '@/i18n/core/types';
import type { DocumentLanguage } from '../api';
import { MAX_TEMPLATE_BYTES } from './hooks';
import { localizeField } from '@/i18n/core/localize';
import { formatDate } from '@/lib/date';

export function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

export function pagesText(n: number | null, t: Messages): string {
  return n === 1
    ? t.documents.onePage
    : t.documents.pages.replace('{n}', String(n ?? 0));
}

export function uploadErrorText(err: unknown, t: Messages): string {
  if (err instanceof ApiError && err.message === 'not-pdf')
    return t.documents.uploadNotPdf;
  if (err instanceof ApiError && err.message === 'too-large')
    return t.documents.uploadTooLarge.replace(
      '{mb}',
      String(MAX_TEMPLATE_BYTES / 1024 / 1024),
    );
  return t.documents.uploadFailed.replace(
    '{reason}',
    errorText(err, t.errors.generic),
  );
}

export function languageName(language: DocumentLanguage, t: Messages): string {
  return language === 'zh' ? t.documents.languageZh : t.documents.languageEn;
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
