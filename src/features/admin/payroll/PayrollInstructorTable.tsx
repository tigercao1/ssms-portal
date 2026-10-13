import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, EmptyState } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatHours, formatMoney, formatShortDay } from './payrollFormat';
import type {
  PayrollClassStatus,
  PayrollInstructorSummary,
  PayrollLessonLine,
  PayrollPeriodDetail,
} from './types';

type PayrollKey = keyof Messages['payroll'];

const STATUS_KEYS: Record<PayrollClassStatus, PayrollKey> = {
  scheduled: 'statusScheduled',
  completed: 'statusCompleted',
  no_show: 'statusNoShow',
  cancelled: 'statusCancelled',
};

const rowKey = (row: PayrollInstructorSummary) =>
  `${row.instructorId}|${row.currency}`;

export function PayrollInstructorTable({
  detail,
}: {
  detail: PayrollPeriodDetail;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (detail.instructors.length === 0) {
    return <EmptyState title={t.payroll.empty} />;
  }

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
              <th className="px-4 py-2 font-medium">
                {t.payroll.colInstructor}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.payroll.colLessons}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.payroll.colHours}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.payroll.colLessonPay}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.payroll.colAdjustments}
              </th>
              <th className="px-4 py-2 text-right font-medium">
                {t.payroll.colTotal}
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.instructors.map((row) => {
              const key = rowKey(row);
              const isOpen = expanded.has(key);
              const name =
                localizeField(
                  row.instructorName,
                  row.instructorNameZh,
                  locale,
                ) ||
                row.email ||
                '—';
              const money = (amount: number) =>
                formatMoney(amount, row.currency, locale);
              return (
                <Fragment key={key}>
                  <tr className="border-b border-grey/40 align-top">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-left font-medium text-navy hover:underline"
                        aria-expanded={isOpen}
                        aria-label={(isOpen
                          ? t.payroll.hideLessons
                          : t.payroll.showLessons
                        ).replace('{name}', name)}
                        onClick={() => toggle(key)}
                      >
                        <span aria-hidden className="w-3 text-slate">
                          {isOpen ? '▾' : '▸'}
                        </span>
                        {name}
                      </button>
                      {row.needsRate > 0 && (
                        <span className="ml-5 mt-1 inline-block">
                          <NeedsRateBadge />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.lessons}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatHours(row.minutes)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {money(row.lessonAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {money(row.adjustmentAmount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {money(row.total)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-grey/40 bg-sunken/60">
                      <td colSpan={6} className="px-4 py-3">
                        <InstructorLessons
                          lines={detail.lines.filter(
                            (l) =>
                              l.instructorId === row.instructorId &&
                              l.currency === row.currency,
                          )}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NeedsRateBadge() {
  const t = useT();
  return (
    <span className="rounded-sm bg-status-pending/20 px-2 py-0.5 text-xs font-medium text-ink">
      {t.payroll.flagNeedsRate}
    </span>
  );
}

function InstructorLessons({ lines }: { lines: PayrollLessonLine[] }) {
  const t = useT();
  const { locale } = useLocale();
  if (lines.length === 0) {
    return <p className="text-slate">—</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-slate">
            <th className="py-1 pr-3 font-medium">{t.payroll.colDate}</th>
            <th className="py-1 pr-3 font-medium">{t.payroll.colTime}</th>
            <th className="py-1 pr-3 font-medium">{t.payroll.colLessonType}</th>
            <th className="py-1 pr-3 font-medium">{t.payroll.colCustomers}</th>
            <th className="py-1 pr-3 font-medium">{t.payroll.colStatus}</th>
            <th className="py-1 pr-3 text-right font-medium">
              {t.payroll.colMinutes}
            </th>
            <th className="py-1 pr-3 text-right font-medium">
              {t.payroll.colRate}
            </th>
            <th className="py-1 text-right font-medium">
              {t.payroll.colAmount}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const needsRate = line.flags.includes('needs_rate');
            return (
              <tr
                key={line.classId}
                className={cn(
                  'border-t border-grey/30 align-top',
                  needsRate && 'bg-status-pending/10',
                )}
              >
                <td className="whitespace-nowrap py-1.5 pr-3">
                  {formatShortDay(line.date, locale)}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 font-mono">
                  {line.time}
                </td>
                <td className="py-1.5 pr-3">
                  {localizeField(
                    line.description,
                    line.lessonTypeNameZh,
                    locale,
                  ) || t.payroll.noLessonType}
                </td>
                <td className="py-1.5 pr-3">
                  {line.customerNames.join(', ') || '—'}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3">
                  {t.payroll[STATUS_KEYS[line.classStatus]]}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {line.minutes}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {line.hourlyRate === null
                    ? '—'
                    : formatMoney(line.hourlyRate, line.currency, locale)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  <span className="flex flex-col items-end gap-1">
                    {formatMoney(line.amount, line.currency, locale)}
                    {needsRate && <NeedsRateBadge />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Link
        to="/admin/classes"
        className="self-start text-xs font-medium text-navy underline"
      >
        {t.payroll.fixStatus}
      </Link>
    </div>
  );
}
