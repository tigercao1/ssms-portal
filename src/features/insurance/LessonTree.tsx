import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { formatShortDay } from '@/features/admin/payroll/payrollFormat';
import { cn } from '@/lib/cn';
import { BILLED_STUDENTS_MAX, dollars, fill } from './money';
import type { InsuranceRecord, InsuranceStudent } from './types';

export interface TreeLesson {
  key: string;
  lessonDate: string;
  durationHours: number;
  place: string | null;
  students: InsuranceStudent[];
  listCents: number;
  amountCents: number;
  seasonPass: boolean;
}

export function useInsuranceText() {
  const t = useT();
  const s = t.insurance;
  const { locale } = useLocale();
  const count = (one: string, many: string) => (n: number) =>
    fill(n === 1 ? one : many, { n });
  const lessons = count(s.lessonsOne, s.lessonsMany);
  const students = count(s.studentsOne, s.studentsMany);
  const hours = count(s.hoursOne, s.hoursMany);
  return {
    s,
    locale,
    lessons,
    students,
    hours,
    day: (iso: string) => (iso ? formatShortDay(iso, locale) : s.noDateYet),
    formula: (h: number, n: number) =>
      fill(s.formula, {
        hours: hours(h),
        students: students(Math.min(n, BILLED_STUDENTS_MAX)),
      }) + (n > BILLED_STUDENTS_MAX ? fill(s.formulaOver, { n }) : ''),
  };
}

export function treeLessonOf(record: InsuranceRecord): TreeLesson {
  return {
    key: record.id,
    lessonDate: record.lessonDate ?? '',
    durationHours: record.durationHours ?? 1,
    place: record.locationName ?? record.locationOther,
    students: record.students,
    listCents: record.listCents,
    amountCents: record.amountCents,
    seasonPass: record.coverage === 'season_pass',
  };
}

export function PriceLabel({
  listCents,
  amountCents,
  seasonPass,
}: Pick<TreeLesson, 'listCents' | 'amountCents' | 'seasonPass'>) {
  const t = useT();
  const s = t.insurance;
  const capped = seasonPass || amountCents !== listCents;
  const text = seasonPass
    ? s.seasonPassFree
    : amountCents === listCents
      ? dollars(amountCents)
      : amountCents > 0
        ? fill(s.capPartial, {
            list: dollars(listCents),
            amount: dollars(amountCents),
          })
        : fill(s.capFree, { list: dollars(listCents) });
  return (
    <span
      data-testid="lesson-price"
      className={cn(
        'tabular-nums',
        capped
          ? 'text-[13px] font-semibold text-status-approved'
          : 'text-sm font-bold text-navy',
      )}
    >
      {text}
    </span>
  );
}

export function LessonTree({
  lessons,
  withFormula = false,
}: {
  lessons: TreeLesson[];
  withFormula?: boolean;
}) {
  const f = useInsuranceText();
  return (
    <ol className="flex flex-col">
      {lessons.map((l, i) => {
        const last = i === lessons.length - 1;
        const sub = [
          l.place,
          withFormula
            ? f.formula(l.durationHours, l.students.length)
            : f.students(l.students.length),
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li
            key={l.key}
            data-testid="tree-lesson"
            className={cn(
              'relative ml-[7px] border-l-2 pb-3.5 pl-[22px]',
              last ? 'border-l-transparent' : 'border-l-grey/40',
            )}
          >
            {last && (
              <span
                aria-hidden
                className="absolute -left-[2px] top-0 h-3.5 border-l-2 border-l-grey/40"
              />
            )}
            <span
              aria-hidden
              className="absolute -left-[8px] top-[5px] z-[1] h-3.5 w-3.5 rounded-full border-[2.5px] border-navy bg-surface"
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-0.5">
              <span className="font-semibold text-navy">
                {fill(f.s.lessonN, { n: i + 1 })} · {f.day(l.lessonDate)} ·{' '}
                {f.hours(l.durationHours)}
              </span>
              <PriceLabel
                listCents={l.listCents}
                amountCents={l.amountCents}
                seasonPass={l.seasonPass}
              />
              <span className="basis-full text-[12.5px] text-slate">{sub}</span>
            </div>
            <ul className="mt-1.5">
              {l.students.map((st, j) => (
                <li
                  key={j}
                  data-testid="tree-student"
                  className="relative flex min-w-0 flex-wrap items-center gap-2 py-0.5 pl-[18px] text-sm"
                >
                  <span
                    aria-hidden
                    className="absolute left-0 top-[13px] w-3 border-t-2 border-t-grey/40"
                  />
                  <span data-private className="break-words">
                    {st.name}
                  </span>
                  {st.waiverConfirmed && (
                    <span className="text-xs font-semibold text-status-approved">
                      {f.s.waiverTick}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
