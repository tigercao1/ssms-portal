import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import type { CustomerWaiver } from '@/lib/types';
import { Chip } from '../admin/badges';
import { formatSignedDate } from './format';

const TONE = {
  signed: 'approved',
  expired: 'pending',
  none: 'neutral',
} as const;

function waiverLabel(
  waiver: CustomerWaiver,
  text: Messages['waiver'],
  locale: Locale,
) {
  const date = waiver.signedAt && formatSignedDate(waiver.signedAt, locale);
  if (waiver.status === 'signed')
    return date ? text.signed.replace('{date}', date) : text.signedNoDate;
  if (waiver.status === 'expired')
    return date ? text.expired.replace('{date}', date) : text.expiredNoDate;
  return text.none;
}

export function WaiverBadge({ waiver }: { waiver: CustomerWaiver }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <span className="inline-flex max-w-full [&>span]:whitespace-normal">
      <Chip
        tone={TONE[waiver.status]}
        label={waiverLabel(waiver, t.waiver, locale)}
      />
    </span>
  );
}
