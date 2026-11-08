import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Banner, Button, Card, Spinner } from '@/components';
import type { AdminClass, ClassStatus } from '@/lib/types';
import { formatSchoolTime } from './booking/bookingRules';
import { ClassActions } from './booking/ClassActions';
import { SyncBadge } from './booking/CalendarSync';
import { STATUS_KEYS } from './ClassFilters';
import { useCalendarClasses, type ClassFilter } from './lessonsApi';
import {
  calendarDays,
  classesBySchoolDay,
  type CalendarMode,
} from './calendarRules';

const MONTH_CHIPS = 3;

const STATUS_BORDER: Record<ClassStatus, string> = {
  scheduled: 'border-l-navy',
  completed: 'border-l-status-approved',
  no_show: 'border-l-status-pending',
  cancelled: 'border-l-status-rejected',
};

const STATUS_FILL: Record<ClassStatus, string> = {
  scheduled: 'bg-navy-tint',
  completed: 'bg-status-approved/10',
  no_show: 'bg-status-pending/10',
  cancelled: 'bg-red-tint',
};

function formatDate(
  day: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-CA', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

function rangeTitle(
  mode: CalendarMode,
  days: string[],
  anchor: string,
  locale: Locale,
) {
  if (mode === 'month')
    return formatDate(anchor, locale, { month: 'long', year: 'numeric' });
  const format = new Intl.DateTimeFormat(
    locale === 'zh-CN' ? 'zh-CN' : 'en-CA',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    },
  );
  return format.formatRange(
    new Date(`${days[0]}T00:00:00Z`),
    new Date(`${days.at(-1)}T00:00:00Z`),
  );
}

export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex overflow-hidden rounded-md border border-grey"
    >
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'min-h-11 flex-1 whitespace-nowrap px-4 text-sm font-medium transition-colors',
            value === key
              ? 'bg-navy text-white'
              : 'text-slate hover:bg-navy-tint',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function ClassesCalendar({
  mode,
  anchor,
  today,
  filter,
  instructorName,
  onMode,
  onAnchor,
  onOpenDay,
}: {
  mode: CalendarMode;
  anchor: string;
  today: string;
  filter: ClassFilter;
  instructorName: (c: AdminClass) => string;
  onMode: (mode: CalendarMode) => void;
  onAnchor: (step: number | null) => void;
  onOpenDay: (day: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const classes = useCalendarClasses(filter);
  const days = calendarDays(mode, anchor);
  const byDay = classesBySchoolDay(classes.data?.classes ?? []);
  const shown = classes.data?.classes.length ?? 0;
  const total = classes.data?.total ?? 0;
  const busy = classes.isPlaceholderData;

  return (
    <section
      aria-label={t.lessons.layoutCalendar}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl" aria-live="polite">
          {rangeTitle(mode, days, anchor, locale)}
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <ToggleGroup
            label={t.lessons.calendarModeLabel}
            value={mode}
            options={[
              ['month', t.lessons.calendarMonth],
              ['week', t.lessons.calendarWeek],
            ]}
            onChange={onMode}
          />
          <div className="flex flex-1 gap-2 sm:flex-none">
            <Button
              variant="secondary"
              className="min-w-11 px-3 sm:min-w-0"
              aria-label={t.lessons.calendarPrev}
              onClick={() => onAnchor(-1)}
            >
              ‹
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => onAnchor(null)}
            >
              {t.lessons.calendarToday}
            </Button>
            <Button
              variant="secondary"
              className="min-w-11 px-3 sm:min-w-0"
              aria-label={t.lessons.calendarNext}
              onClick={() => onAnchor(1)}
            >
              ›
            </Button>
          </div>
        </div>
      </div>

      {total > shown && (
        <Banner tone="pending">
          {t.lessons.calendarTruncated
            .replace('{shown}', String(shown))
            .replace('{total}', String(total))}
        </Banner>
      )}

      {classes.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : classes.isError ? (
        <Banner tone="error">
          {classes.error instanceof ApiError
            ? classes.error.message
            : t.errors.generic}
        </Banner>
      ) : (
        <div
          aria-busy={busy}
          className={cn('transition-opacity', busy && 'opacity-60')}
        >
          {mode === 'month' ? (
            <MonthGrid
              days={days}
              month={anchor.slice(0, 7)}
              today={today}
              byDay={byDay}
              instructorName={instructorName}
              onOpenDay={onOpenDay}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {days.map((day) => (
                <WeekDay
                  key={day}
                  day={day}
                  today={day === today}
                  classes={byDay.get(day) ?? []}
                  instructorName={instructorName}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function lessonTypeName(c: AdminClass, locale: Locale, fallback: string) {
  return (
    localizeField(c.lessonTypeNameEn, c.lessonTypeNameZh, locale) || fallback
  );
}

function MonthGrid({
  days,
  month,
  today,
  byDay,
  instructorName,
  onOpenDay,
}: {
  days: string[];
  month: string;
  today: string;
  byDay: Map<string, AdminClass[]>;
  instructorName: (c: AdminClass) => string;
  onOpenDay: (day: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-grey/40 bg-sunken text-center text-xs text-slate">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="py-2">
            {formatDate(day, locale, { weekday: 'short' })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const label = t.lessons.calendarDayLabel
            .replace(
              '{date}',
              formatDate(day, locale, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }),
            )
            .replace('{n}', String(list.length));
          return (
            <button
              key={day}
              type="button"
              aria-label={label}
              onClick={() => onOpenDay(day)}
              className={cn(
                'flex min-h-14 min-w-0 flex-col items-stretch gap-1 border-b border-r border-grey/40 p-1 text-left transition-colors hover:bg-navy-tint sm:min-h-28',
                !day.startsWith(month) && 'bg-sunken/60 text-slate',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center self-center rounded-full text-xs sm:self-start',
                  day === today && 'bg-red font-medium text-white',
                )}
              >
                {Number(day.slice(8))}
              </span>
              {list.length > 0 && (
                <span
                  aria-hidden
                  className="flex items-center justify-center gap-0.5 sm:hidden"
                >
                  {list.slice(0, MONTH_CHIPS).map((c) => (
                    <span
                      key={c.id}
                      className="h-1.5 w-1.5 rounded-full bg-navy"
                    />
                  ))}
                  {list.length > MONTH_CHIPS && (
                    <span className="text-[10px] leading-none text-slate">
                      {list.length}
                    </span>
                  )}
                </span>
              )}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, MONTH_CHIPS).map((c) => (
                  <span
                    key={c.id}
                    data-private
                    className={cn(
                      'truncate rounded-sm border-l-2 px-1 text-xs text-ink',
                      STATUS_BORDER[c.status],
                      STATUS_FILL[c.status],
                      c.status === 'cancelled' && 'line-through',
                    )}
                  >
                    {formatSchoolTime(c.startsAt, locale)}{' '}
                    {lessonTypeName(c, locale, t.lessons.noLessonType)} ·{' '}
                    {instructorName(c)}
                  </span>
                ))}
                {list.length > MONTH_CHIPS && (
                  <span className="px-1 text-xs text-slate">
                    {t.lessons.calendarMore.replace(
                      '{n}',
                      String(list.length - MONTH_CHIPS),
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function WeekDay({
  day,
  today,
  classes,
  instructorName,
}: {
  day: string;
  today: boolean;
  classes: AdminClass[];
  instructorName: (c: AdminClass) => string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const title = formatDate(day, locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className={cn('text-base', today && 'text-red')}>{title}</h3>
      {classes.length === 0 ? (
        <p className="text-sm text-slate">{t.lessons.calendarNoBookings}</p>
      ) : (
        <Card className="divide-y divide-grey/40 p-0">
          {classes.map((c) => (
            <div
              key={c.id}
              className={cn(
                'flex flex-wrap items-start gap-x-4 gap-y-2 border-l-4 px-4 py-3 text-sm',
                STATUS_BORDER[c.status],
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-mono text-xs text-slate">
                  {formatSchoolTime(c.startsAt, locale)} –{' '}
                  {formatSchoolTime(c.endsAt, locale)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">
                    {lessonTypeName(c, locale, t.lessons.noLessonType)}
                  </span>
                  <span
                    className={cn(
                      'rounded-sm px-2 py-0.5 text-xs text-ink',
                      STATUS_FILL[c.status],
                    )}
                  >
                    {t.lessons[STATUS_KEYS[c.status]]}
                  </span>
                  <SyncBadge item={c} />
                </div>
                <span data-private className="text-slate">
                  {instructorName(c)} ·{' '}
                  {t.lessons.calendarCustomers.replace(
                    '{n}',
                    String(c.participants.length),
                  )}
                </span>
              </div>
              <ClassActions item={c} />
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
