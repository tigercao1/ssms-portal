import type { Locale } from './types';

/**
 * Locale-aware display rule for bilingual fields (PORTAL_UI_PLAN.md, mirrors the
 * backend): English always returns `_en`; zh-CN returns `_zh` when present,
 * otherwise falls back to `_en`. Used for `display_name` and `bio` everywhere.
 */
export function localizeField(
  en: string | null | undefined,
  zh: string | null | undefined,
  locale: Locale,
): string {
  if (locale === 'zh-CN' && zh && zh.trim().length > 0) return zh;
  return en ?? '';
}
