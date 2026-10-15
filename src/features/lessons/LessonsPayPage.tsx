import { useId, useState } from 'react';
import { Banner, Button, Card, Spinner } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/features/admin/payroll/payrollFormat';
import { LockIcon } from '@/features/documents/onboarding/Locked';
import { StatePill } from '@/features/documents/onboarding/StatePill';
import { useMyLessons } from './api';
import {
  adjustmentsCount,
  hoursOf,
  lessonDay,
  lessonsCount,
  moneyList,
  periodDates,
  rateTimes,
  signedMoney,
  studentsText,
} from './format';
import type {
  LessonsLockReason,
  MyLesson,
  MyLessonsResponse,
  MyPayPeriod,
} from './types';

const SURFACE = 'rounded-lg border border-grey/60 bg-surface shadow-card';

export function LessonsPayPage() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMyLessons();

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (isError || !data)
    return (
      <Card>
        <Banner tone="error">{t.myLessons.loadFailed}</Banner>
        <Button
          className="mt-4"
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
        >
          {t.common.retry}
        </Button>
      </Card>
    );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.myLessons.title}</h1>
      <LessonsBody data={data} />
    </div>
  );
}

function LessonsBody({ data }: { data: MyLessonsResponse }) {
  const t = useT();
  if (data.locked && data.lockReason !== 'rejected')
    return (
      <>
        <LessonsBanner reason="pending_approval" />
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-sunken text-status-pending">
            <LockIcon className="h-6 w-6" />
          </span>
          <p className="text-sm text-slate">{t.myLessons.pendingEmpty}</p>
        </div>
      </>
    );
  if (data.locked)
    return (
      <>
        <LessonsBanner reason="rejected" />
        {data.periods.length > 0 ? (
          <PastSection periods={data.periods} />
        ) : (
          <p className="text-sm text-slate">{t.myLessons.pastEmpty}</p>
        )}
      </>
    );
  if (data.upcoming.lessons.length === 0 && data.periods.length === 0)
    return <EmptyLessons />;
  return (
    <>
      <UpcomingSection upcoming={data.upcoming} />
      {data.periods.length > 0 && <PastSection periods={data.periods} />}
    </>
  );
}

function LessonsBanner({ reason }: { reason: LessonsLockReason }) {
  const t = useT();
  const rejected = reason === 'rejected';
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md border-l-[3px] px-4 py-3 text-sm',
        rejected
          ? 'border-l-status-rejected bg-red-tint'
          : 'border-l-status-pending bg-surface shadow-card',
      )}
    >
      <span
        className={cn(
          'grid h-7 w-7 flex-none place-items-center rounded-full',
          rejected
            ? 'bg-surface text-status-rejected'
            : 'bg-sunken text-status-pending',
        )}
      >
        {rejected ? <CrossIcon /> : <LockIcon />}
      </span>
      <div>
        <p className="font-semibold text-navy">
          {rejected ? t.myLessons.rejectedTitle : t.myLessons.pendingTitle}
        </p>
        <p className="text-ink">
          {rejected ? t.myLessons.rejectedBody : t.myLessons.pendingBody}
        </p>
      </div>
    </div>
  );
}

function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      className="h-3.5 w-3.5"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-6 w-6"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function EmptyLessons() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-navy-tint text-navy">
        <CalendarIcon />
      </span>
      <h2 className="text-xl">{t.myLessons.emptyTitle}</h2>
      <p className="max-w-md text-sm text-slate">{t.myLessons.emptyBody}</p>
      <div
        aria-hidden
        className="mt-2 flex w-full max-w-xs flex-col gap-2 opacity-60"
      >
        <span className="mx-auto h-3 w-[85%] rounded-full bg-sunken" />
        <span className="mx-auto h-3 w-[70%] rounded-full bg-sunken" />
        <span className="mx-auto h-3 w-[78%] rounded-full bg-sunken" />
      </div>
    </div>
  );
}

function SectionHeader({
  id,
  title,
  how,
}: {
  id: string;
  title: string;
  how: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      <span className="text-sm text-slate">{how}</span>
    </div>
  );
}

function lessonName(lesson: MyLesson, locale: Locale, fallback: string) {
  return (
    localizeField(lesson.lessonTypeNameEn, lesson.lessonTypeNameZh, locale) ||
    fallback
  );
}

function LessonPay({ lesson }: { lesson: MyLesson }) {
  const t = useT();
  const { locale } = useLocale();
  if (lesson.needsRate)
    return <StatePill tone="warn" label={t.myLessons.rateNotSet} />;
  if (lesson.amount === null) return <>—</>;
  return <>{formatMoney(lesson.amount, lesson.currency, locale)}</>;
}

function RateTimes({ lesson }: { lesson: MyLesson }) {
  const t = useT();
  const { locale } = useLocale();
  const text = rateTimes(lesson, t, locale);
  if (text) return <>{text}</>;
  return <>{lesson.needsRate ? '—' : t.myLessons.noRate}</>;
}

function UpcomingSection({
  upcoming,
}: {
  upcoming: MyLessonsResponse['upcoming'];
}) {
  const t = useT();
  const { locale } = useLocale();
  const headingId = useId();
  const { lessons, projected, needsRateCount } = upcoming;
  const projectedLabel = t.myLessons.projected.replace(
    '{lessons}',
    lessonsCount(lessons.length, t),
  );
  const notCounted =
    needsRateCount > 0
      ? t.myLessons.notCounted.replace('{n}', String(needsRateCount))
      : null;
  const projectedAmount =
    projected.length > 0 ? moneyList(projected, locale) : '—';
  const th = 'px-3 py-2 font-medium';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        id={headingId}
        title={t.myLessons.upcomingTitle}
        how={t.myLessons.upcomingHow}
      />
      {lessons.length === 0 ? (
        <p className={cn(SURFACE, 'px-4 py-3 text-sm text-slate')}>
          {t.myLessons.upcomingEmpty}
        </p>
      ) : (
        <>
          <div className={cn(SURFACE, 'hidden lg:block')}>
            <div className="overflow-x-auto px-3 py-1">
              <table
                aria-label={t.myLessons.upcomingTitle}
                className="w-full text-sm"
              >
                <thead>
                  <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                    <th className={th}>{t.myLessons.colDate}</th>
                    <th className={th}>{t.myLessons.colTime}</th>
                    <th className={th}>{t.myLessons.colLesson}</th>
                    <th className={th}>{t.myLessons.colLocation}</th>
                    <th className={th}>{t.myLessons.colStudents}</th>
                    <th className={cn(th, 'text-right')}>
                      {t.myLessons.colRateTime}
                    </th>
                    <th className={cn(th, 'text-right')}>
                      {t.myLessons.colPay}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lessons.map((lesson) => (
                    <tr
                      key={lesson.classId}
                      className="border-b border-grey/40 last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {lessonDay(lesson.date, locale)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {lesson.startTime}–{lesson.endTime}
                      </td>
                      <td className="px-3 py-2.5">
                        {lessonName(lesson, locale, t.myLessons.noLessonType)}
                      </td>
                      <td className="px-3 py-2.5">
                        {lesson.locationName ?? '—'}
                      </td>
                      <td
                        className="px-3 py-2.5"
                        title={lesson.students.join(', ')}
                      >
                        {studentsText(lesson.students, t)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        <RateTimes lesson={lesson} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        <LessonPay lesson={lesson} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-grey/60 font-semibold text-navy">
                    <td colSpan={6} className="px-3 py-2.5">
                      {projectedLabel}
                      {notCounted && (
                        <span className="ml-2 font-normal text-slate">
                          {notCounted}
                        </span>
                      )}
                    </td>
                    <td
                      data-testid="upcoming-projected"
                      className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"
                    >
                      {projectedAmount}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="flex flex-col gap-2 lg:hidden">
            <ul
              aria-label={t.myLessons.upcomingTitle}
              className="flex flex-col gap-2"
            >
              {lessons.map((lesson) => (
                <li
                  key={lesson.classId}
                  className={cn(SURFACE, 'px-3 py-2.5 text-sm')}
                >
                  <div className="flex items-start justify-between gap-2 font-medium text-navy">
                    <span>
                      {lessonDay(lesson.date, locale)} · {lesson.startTime}–
                      {lesson.endTime}
                    </span>
                    <span className="tabular-nums">
                      <LessonPay lesson={lesson} />
                    </span>
                  </div>
                  <p className="text-xs text-slate">
                    {[
                      lessonName(lesson, locale, t.myLessons.noLessonType),
                      lesson.locationName,
                      lesson.students.length > 0
                        ? studentsText(lesson.students, t)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {!lesson.needsRate && (
                    <p className="text-xs text-slate">
                      <RateTimes lesson={lesson} />
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-3 rounded-lg bg-navy px-3 py-2.5 text-sm font-semibold text-white">
              <span>{projectedLabel}</span>
              <span className="tabular-nums">{projectedAmount}</span>
            </div>
            {notCounted && <p className="text-xs text-slate">{notCounted}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function PastSection({ periods }: { periods: MyPayPeriod[] }) {
  const t = useT();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <SectionHeader
        id={headingId}
        title={t.myLessons.pastTitle}
        how={t.myLessons.pastHow}
      />
      <div className="flex flex-col gap-2">
        {periods.map((period) => (
          <PeriodCard key={period.startsOn} period={period} />
        ))}
      </div>
    </section>
  );
}

function PeriodCard({ period }: { period: MyPayPeriod }) {
  const t = useT();
  const { locale } = useLocale();
  const awaiting = period.status === 'awaiting';
  const [open, setOpen] = useState(awaiting);
  const rowsId = useId();
  const dates = periodDates(period.startsOn, period.endsOn, locale);
  const minutes = period.lessons.reduce((sum, l) => sum + l.minutes, 0);
  const summary = [
    lessonsCount(period.lessons.length, t),
    t.myLessons.hours.replace('{hours}', hoursOf(minutes)),
    period.adjustments.length > 0
      ? adjustmentsCount(period.adjustments.length, t)
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const total = moneyList(
    period.totals.map((x) => ({ currency: x.currency, amount: x.total })),
    locale,
  );

  return (
    <div className={cn(SURFACE, 'overflow-hidden')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={rowsId}
        aria-label={(open
          ? t.myLessons.hidePeriod
          : t.myLessons.showPeriod
        ).replace('{dates}', dates)}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-sunken/60"
      >
        <span aria-hidden className="w-3 text-slate">
          {open ? '▾' : '▸'}
        </span>
        <span className="font-semibold text-navy">{dates}</span>
        <StatePill
          tone={awaiting ? 'warn' : 'done'}
          label={awaiting ? t.myLessons.awaiting : t.myLessons.paid}
        />
        <span className="text-xs text-slate">{summary}</span>
        <span
          data-testid="period-total"
          className="ml-auto font-semibold tabular-nums text-navy"
        >
          {awaiting && total
            ? t.myLessons.approx.replace('{amount}', total)
            : total}
        </span>
      </button>
      {open && (
        <div id={rowsId} className="border-t border-grey/60 bg-sunken/40">
          <PeriodRows period={period} label={dates} />
        </div>
      )}
    </div>
  );
}

const PERIOD_ROW =
  'grid grid-cols-[1fr_auto] items-center gap-x-4 border-b border-grey/30 px-4 py-2 last:border-0 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_14rem_7rem]';

function PeriodRows({ period, label }: { period: MyPayPeriod; label: string }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <ul aria-label={label} className="text-sm">
      {period.lessons.map((lesson) => {
        const name = lessonName(lesson, locale, t.myLessons.noLessonType);
        return (
          <li key={lesson.classId} className={PERIOD_ROW}>
            <span>
              {lessonDay(lesson.date, locale)} · {lesson.startTime}–
              {lesson.endTime}
              <span className="block text-xs text-slate lg:hidden">
                {name} · <RateTimes lesson={lesson} />
              </span>
            </span>
            <span className="hidden lg:block">{name}</span>
            <span className="hidden lg:block">
              {lesson.locationName ?? '—'}
            </span>
            <span className="hidden whitespace-nowrap text-right tabular-nums lg:block">
              <RateTimes lesson={lesson} />
            </span>
            <span className="whitespace-nowrap text-right tabular-nums">
              <LessonPay lesson={lesson} />
            </span>
          </li>
        );
      })}
      {period.adjustments.map((adjustment) => (
        <li key={adjustment.id} className={cn(PERIOD_ROW, 'italic text-slate')}>
          <span className="lg:col-span-4">
            {t.myLessons.adjustment.replace(
              '{description}',
              adjustment.description,
            )}
          </span>
          <span className="whitespace-nowrap text-right tabular-nums">
            {signedMoney(adjustment.amount, adjustment.currency, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
