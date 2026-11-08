import type { Locale } from '@/i18n/core/types';
import { SCHOOL_TIME_ZONE } from '@/features/admin/booking/bookingRules';

export function formatSignedDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    timeZone: SCHOOL_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
}
