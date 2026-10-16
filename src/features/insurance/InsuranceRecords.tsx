import { useId } from 'react';
import { Button } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/date';
import { formatDay } from '@/features/admin/payroll/payrollFormat';
import { StatePill } from '@/features/documents/onboarding/StatePill';
import { dollars, recordStatus } from './money';
import type { InsuranceRecord } from './types';

const SURFACE = 'rounded-lg border border-grey/60 bg-surface shadow-card';

export function studentNames(record: InsuranceRecord, separator: string) {
  return (record.students ?? []).map((s) => s.name).join(separator);
}

export function durationText(hours: number | null, t: Messages) {
  if (hours === null) return '—';
  return (hours === 1 ? t.insurance.hoursOne : t.insurance.hoursMany).replace(
    '{n}',
    String(hours),
  );
}

export function RecordStatusCell({ record }: { record: InsuranceRecord }) {
  const t = useT();
  const status = recordStatus(record, t);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatePill tone={status.tone} label={status.label} />
      {status.sub && <span className="text-xs text-slate">{status.sub}</span>}
    </span>
  );
}

export function InsuranceRecords({
  records,
  onRegisterFirst,
}: {
  records: InsuranceRecord[];
  onRegisterFirst: () => void;
}) {
  const t = useT();
  const s = t.insurance;
  const { locale } = useLocale();
  const headingId = useId();
  const separator = locale === 'zh-CN' ? '、' : ', ';
  const th = 'whitespace-nowrap px-3 py-2 font-medium';
  const lessonDate = (r: InsuranceRecord) =>
    r.kind === 'season_pass'
      ? s.seasonPassRow
      : r.lessonDate
        ? formatDay(r.lessonDate, locale)
        : '—';
  const amount = (r: InsuranceRecord) => (
    <span
      className={cn(r.paymentStatus === 'voided' && 'text-slate line-through')}
    >
      {dollars(r.amountCents)}
    </span>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-xl">
        {s.recordsTitle}
      </h2>
      {records.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
          <p className="text-sm text-slate">{s.recordsEmpty}</p>
          <Button variant="secondary" size="sm" onClick={onRegisterFirst}>
            {s.registerFirst}
          </Button>
        </div>
      ) : (
        <>
          <div className={cn(SURFACE, 'hidden lg:block')}>
            <div className="overflow-x-auto px-3 py-1">
              <table aria-label={s.recordsTitle} className="w-full text-sm">
                <thead>
                  <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                    <th className={th}>{s.colLessonDate}</th>
                    <th className={th}>{s.colStudents}</th>
                    <th className={th}>{s.colDuration}</th>
                    <th className={cn(th, 'text-right')}>{s.colAmount}</th>
                    <th className={th}>{s.colRecordNo}</th>
                    <th className={th}>{s.colStatus}</th>
                    <th className={th}>{s.colCreated}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-grey/40 last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {lessonDate(r)}
                      </td>
                      <td className="px-3 py-2.5">
                        {studentNames(r, separator) || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {durationText(r.durationHours, t)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {amount(r)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                        {r.recordNo}
                      </td>
                      <td className="px-3 py-2.5">
                        <RecordStatusCell record={r} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate">
                        {formatDateTime(r.createdAt, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ul
            aria-label={s.recordsTitle}
            className="flex flex-col gap-2 lg:hidden"
          >
            {records.map((r) => (
              <li key={r.id} className={cn(SURFACE, 'px-3 py-2.5 text-sm')}>
                <div className="flex items-start justify-between gap-2 font-medium text-navy">
                  <span>
                    {lessonDate(r)}
                    {r.durationHours !== null &&
                      ` · ${durationText(r.durationHours, t)}`}
                  </span>
                  <span className="tabular-nums">{amount(r)}</span>
                </div>
                {r.kind === 'lesson' && (
                  <p className="break-words text-ink">
                    {studentNames(r, separator)}
                  </p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <RecordStatusCell record={r} />
                  <span className="font-mono text-xs text-slate">
                    {r.recordNo}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate">
                  {s.createdAt.replace(
                    '{date}',
                    formatDateTime(r.createdAt, locale),
                  )}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
