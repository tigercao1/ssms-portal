import { useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatMoney } from './payrollFormat';

export interface PayFlagSet {
  late: boolean;
  lateCancel: boolean;
  correction: boolean;
  reassigned: boolean;
  adjusted: boolean;
  changes: PayChange[];
}

export type PayChange = 'length' | 'lesson_type';

const ORDER = [
  'late',
  'lateCancel',
  'correction',
  'reassigned',
  'adjusted',
] as const;
export type PayFlag = (typeof ORDER)[number];

const HELP: Record<PayFlag, keyof Messages['payFlags']> = {
  late: 'lateHelp',
  lateCancel: 'lateCancelHelp',
  correction: 'correctionHelp',
  reassigned: 'reassignedHelp',
  adjusted: 'adjustedHelp',
};

const CHANGE_LABEL: Record<PayChange, keyof Messages['payFlags']> = {
  length: 'changedLength',
  lesson_type: 'changedLessonType',
};

const CHANGE_FLAGS: [string, PayChange][] = [
  ['changed_length', 'length'],
  ['changed_lesson_type', 'lesson_type'],
];

const TONE: Record<PayFlag, string> = {
  late: 'bg-navy-tint text-navy',
  lateCancel: 'bg-red-tint text-ink',
  correction: 'bg-status-pending/20 text-ink',
  reassigned: 'bg-sunken text-slate',
  adjusted: 'bg-navy-tint text-ink',
};

export function payFlagsOf(flags: string[]): PayFlagSet {
  return {
    late: flags.includes('late'),
    lateCancel: flags.includes('late_cancel'),
    correction: flags.includes('correction'),
    reassigned: flags.includes('reassigned'),
    adjusted: flags.includes('adjusted'),
    changes: CHANGE_FLAGS.filter(([flag]) => flags.includes(flag)).map(
      ([, change]) => change,
    ),
  };
}

export function presentFlags(sets: PayFlagSet[]): PayFlag[] {
  return ORDER.filter((flag) => sets.some((set) => set[flag]));
}

export function isFlagged(flags: PayFlagSet) {
  return ORDER.some((flag) => flags[flag]);
}

export function countedMinutes(flags: PayFlagSet, minutes: number) {
  if (flags.correction) return null;
  if (flags.adjusted) return signed(minutes);
  return flags.lateCancel ? -minutes : minutes;
}

export function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export function flaggedAmount(
  flags: PayFlagSet,
  amount: number,
  currency: string,
  locale: Locale,
) {
  const text = formatMoney(amount, currency, locale);
  return flags.adjusted && amount > 0 ? `+${text}` : text;
}

export function PayFlagBadges({ flags }: { flags: PayFlagSet }) {
  const t = useT();
  const shown = ORDER.filter((flag) => flags[flag]);
  if (shown.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {shown.map((flag) => (
        <span
          key={flag}
          title={t.payFlags[HELP[flag]]}
          className={cn(
            'whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium',
            TONE[flag],
          )}
        >
          {t.payFlags[flag]}
        </span>
      ))}
      {flags.adjusted && flags.changes.length > 0 && (
        <span className="whitespace-nowrap py-0.5 text-xs text-slate">
          {flags.changes
            .map((change) => t.payFlags[CHANGE_LABEL[change]])
            .join(t.booking.listSeparator)}
        </span>
      )}
    </span>
  );
}

export function PayFlagsHelp({
  flags,
  className,
}: {
  flags: PayFlag[];
  className?: string;
}) {
  const t = useT();
  if (flags.length === 0) return null;
  return (
    <div className={cn('text-xs text-slate', className)}>
      <p className="font-medium text-navy">{t.payFlags.helpTitle}</p>
      <dl className="mt-1 flex flex-col gap-0.5">
        {flags.map((flag) => (
          <div key={flag}>
            <dt className="inline font-medium text-ink">
              {t.payFlags[flag]}:{' '}
            </dt>
            <dd className="inline">{t.payFlags[HELP[flag]]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
