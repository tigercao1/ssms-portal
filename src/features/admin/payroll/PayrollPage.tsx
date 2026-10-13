import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Button, Card, Spinner } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { formatDateTime } from '@/lib/date';
import { cn } from '@/lib/cn';
import { PayrollActions } from './PayrollActions';
import { PayrollAdjustments } from './PayrollAdjustments';
import { PayrollInstructorTable } from './PayrollInstructorTable';
import { PayrollSettingsPanel } from './PayrollSettingsPanel';
import { usePayrollPeriod, usePayrollPeriods } from './payrollApi';
import {
  errorText,
  formatDay,
  formatHours,
  formatMoney,
  shiftDate,
} from './payrollFormat';
import type { PayrollPeriod, PayrollPeriodDetail } from './types';

export function PayrollPage() {
  const t = useT();
  const [around, setAround] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const periods = usePayrollPeriods(around);
  const selected =
    periods.data?.find((p) =>
      around ? p.startsOn <= around && around <= p.endsOn : p.isCurrent,
    ) ?? null;
  const detail = usePayrollPeriod(selected?.id ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">{t.payroll.title}</h1>
          <p className="text-sm text-slate">{t.payroll.intro}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          {t.payroll.settings}
        </Button>
      </div>

      {settingsOpen && (
        <PayrollSettingsPanel
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setAround(null)}
        />
      )}

      {periods.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : periods.isError ? (
        <Banner tone="error">
          {errorText(periods.error, t.errors.generic)}
        </Banner>
      ) : (
        selected && (
          <>
            <PeriodPicker
              period={detail.data?.period ?? selected}
              onPrevious={() => setAround(shiftDate(selected.startsOn, -1))}
              onNext={() => setAround(shiftDate(selected.endsOn, 1))}
              onCurrent={() => setAround(null)}
            />
            {detail.isLoading ? (
              <div className="flex justify-center py-16">
                <Spinner className="h-7 w-7" />
              </div>
            ) : detail.isError ? (
              <Banner tone="error">
                {errorText(detail.error, t.errors.generic)}
              </Banner>
            ) : (
              detail.data && (
                <PeriodDetail
                  key={detail.data.period.id}
                  detail={detail.data}
                />
              )
            )}
          </>
        )
      )}
    </div>
  );
}

export function PeriodStatusBadge({ period }: { period: PayrollPeriod }) {
  const t = useT();
  const finalized = period.status === 'finalized';
  return (
    <span
      data-testid="payroll-status"
      className={cn(
        'rounded-sm px-2 py-0.5 text-xs font-medium',
        finalized
          ? 'bg-status-approved/15 text-ink'
          : 'bg-status-pending/15 text-ink',
      )}
    >
      {finalized ? t.payroll.statusFinalized : t.payroll.statusOpen}
    </span>
  );
}

function PeriodPicker({
  period,
  onPrevious,
  onNext,
  onCurrent,
}: {
  period: PayrollPeriod;
  onPrevious: () => void;
  onNext: () => void;
  onCurrent: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Card
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 py-4',
        period.isCurrent && 'border-navy',
      )}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          aria-label={t.payroll.previous}
          onClick={onPrevious}
        >
          ‹
        </Button>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wide text-slate">
            {t.payroll.periodLabel}
          </span>
          <span
            className="text-lg font-medium text-ink"
            data-testid="payroll-period"
          >
            {formatDay(period.startsOn, locale)} –{' '}
            {formatDay(period.endsOn, locale)}
          </span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-label={t.payroll.next}
          onClick={onNext}
        >
          ›
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {period.isCurrent ? (
          <span className="rounded-sm bg-navy px-2 py-0.5 text-xs font-medium text-white">
            {t.payroll.current}
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={onCurrent}>
            {t.payroll.jumpToCurrent}
          </Button>
        )}
        <PeriodStatusBadge period={period} />
      </div>
    </Card>
  );
}

function PeriodDetail({ detail }: { detail: PayrollPeriodDetail }) {
  const t = useT();
  const { locale } = useLocale();
  const { period } = detail;
  const open = period.status === 'open';
  return (
    <div className="flex flex-col gap-6">
      {open ? (
        <Banner tone="info">{t.payroll.liveNote}</Banner>
      ) : (
        <Banner
          tone="approved"
          title={t.payroll.finalizedOn.replace(
            '{date}',
            formatDateTime(period.finalizedAt, locale),
          )}
        >
          {t.payroll.frozenNote}
        </Banner>
      )}

      {detail.needsRateCount > 0 && (
        <Banner
          tone="pending"
          title={t.payroll.needsRateTitle.replace(
            '{n}',
            String(detail.needsRateCount),
          )}
        >
          <p>{t.payroll.needsRateBody}</p>
          <p className="mt-1 flex flex-wrap gap-4">
            <Link
              className="font-medium text-navy underline"
              to="/admin/classes"
            >
              {t.payroll.fixInClasses}
            </Link>
            <Link
              className="font-medium text-navy underline"
              to="/admin/lesson-types"
            >
              {t.payroll.openPayRates}
            </Link>
          </p>
        </Banner>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {detail.totals.length === 0 ? (
          <TotalCard
            amount={formatMoney(0, 'CAD', locale)}
            lessons={0}
            minutes={0}
          />
        ) : (
          detail.totals.map((total) => (
            <TotalCard
              key={total.currency}
              amount={formatMoney(total.amount, total.currency, locale)}
              lessons={total.lessons}
              minutes={total.minutes}
            />
          ))
        )}
      </div>

      <PayrollActions detail={detail} />
      <PayrollInstructorTable detail={detail} />
      <PayrollAdjustments detail={detail} />
    </div>
  );
}

function TotalCard({
  amount,
  lessons,
  minutes,
}: {
  amount: string;
  lessons: number;
  minutes: number;
}) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-1 py-4">
      <span className="text-xs uppercase tracking-wide text-slate">
        {t.payroll.totalPay}
      </span>
      <span
        className="text-2xl font-semibold text-ink"
        data-testid="payroll-total"
      >
        {amount}
      </span>
      <span className="text-sm text-slate">
        {t.payroll.lessonsCount.replace('{n}', String(lessons))} ·{' '}
        {t.payroll.hoursCount.replace('{n}', formatHours(minutes))}
      </span>
    </Card>
  );
}
