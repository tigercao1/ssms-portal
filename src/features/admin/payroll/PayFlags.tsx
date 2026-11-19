import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';

export interface PayFlagSet {
  late: boolean;
  lateCancel: boolean;
  correction: boolean;
  reassigned: boolean;
}

const ORDER = ['late', 'lateCancel', 'correction', 'reassigned'] as const;
export type PayFlag = (typeof ORDER)[number];

const HELP: Record<PayFlag, keyof Messages['payFlags']> = {
  late: 'lateHelp',
  lateCancel: 'lateCancelHelp',
  correction: 'correctionHelp',
  reassigned: 'reassignedHelp',
};

const TONE: Record<PayFlag, string> = {
  late: 'bg-navy-tint text-navy',
  lateCancel: 'bg-red-tint text-ink',
  correction: 'bg-status-pending/20 text-ink',
  reassigned: 'bg-sunken text-slate',
};

export function payFlagsOf(flags: string[]): PayFlagSet {
  return {
    late: flags.includes('late'),
    lateCancel: flags.includes('late_cancel'),
    correction: flags.includes('correction'),
    reassigned: flags.includes('reassigned'),
  };
}

export function presentFlags(sets: PayFlagSet[]): PayFlag[] {
  return ORDER.filter((flag) => sets.some((set) => set[flag]));
}

export function countedMinutes(flags: PayFlagSet, minutes: number) {
  if (flags.correction) return null;
  return flags.lateCancel ? -minutes : minutes;
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
