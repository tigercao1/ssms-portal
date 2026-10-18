import { useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Card,
  EmptyState,
  Field,
  Input,
  Pager,
  Select,
  Spinner,
} from '@/components';
import type { AdminClass, Attendance, ClassStatus } from '@/lib/types';
import { useAdminInstructors } from './api';
import { CLASSES_PAGE_SIZE, useAdminClasses } from './lessonsApi';
import { localizeField } from '@/i18n/core/localize';
import {
  addDays,
  customerName,
  dateInputValue,
  groupClassesByDay,
  rangeToIso,
} from './lessonRules';
import { PromoBadge } from './LessonTypesPage';
import { ClassActions } from './booking/ClassActions';
import {
  SyncBadge,
  SyncIssuesBanner,
  SyncToastHost,
} from './booking/CalendarSync';

type LessonsKey = keyof Messages['lessons'];

const STATUS_KEYS: Record<ClassStatus, LessonsKey> = {
  scheduled: 'classScheduled',
  completed: 'classCompleted',
  no_show: 'classNoShow',
  cancelled: 'classCancelled',
};

const ATTENDANCE_KEYS: Record<Attendance, LessonsKey> = {
  expected: 'attendanceExpected',
  attended: 'attendanceAttended',
  no_show: 'attendanceNoShow',
};

function pageFrom(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

function localeTag(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
}

function formatDay(day: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${day}T00:00:00`));
}

function formatTime(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function ClassesPage() {
  const t = useT();
  const { locale } = useLocale();
  const today = new Date();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? dateInputValue(today);
  const to = params.get('to') ?? dateInputValue(addDays(today, 28));
  const instructorId = params.get('instructor') ?? '';
  const page = pageFrom(params);
  const instructors = useAdminInstructors({});
  const rangeValid = Boolean(from && to && from <= to);
  const iso = rangeValid ? rangeToIso(from, to) : null;
  const classes = useAdminClasses(
    iso && { ...iso, ...(instructorId && { instructorId }) },
    page,
  );
  const items = classes.data?.classes ?? [];
  const total = classes.data?.total ?? 0;
  const shownPage = classes.data?.page ?? page;
  const busy = classes.isPlaceholderData;

  function setFilter(key: 'instructor' | 'from' | 'to', value: string) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (key === 'instructor' && !value) out.delete(key);
        else out.set(key, value);
        out.delete('page');
        return out;
      },
      { replace: true },
    );
  }

  function setPage(next: number) {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next > 1) out.set('page', String(next));
      else out.delete('page');
      return out;
    });
  }

  const names = new Map(
    (instructors.data ?? []).map((i) => [
      i.id,
      localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    ]),
  );
  const options = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.lessons.classesTitle}</h1>
      <SyncIssuesBanner />
      <SyncToastHost />

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label={t.lessons.filterInstructor}>
          {(p) => (
            <Select
              {...p}
              value={instructorId}
              onChange={(e) => setFilter('instructor', e.target.value)}
            >
              <option value="">{t.lessons.allInstructors}</option>
              {options.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t.lessons.fromLabel}>
          {(p) => (
            <Input
              {...p}
              type="date"
              value={from}
              onChange={(e) => setFilter('from', e.target.value)}
            />
          )}
        </Field>
        <Field
          label={t.lessons.toLabel}
          error={from && to && !rangeValid ? t.lessons.rangeInvalid : undefined}
        >
          {(p) => (
            <Input
              {...p}
              type="date"
              value={to}
              onChange={(e) => setFilter('to', e.target.value)}
            />
          )}
        </Field>
      </Card>

      {!rangeValid ? null : classes.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : classes.isError ? (
        <Banner tone="error">
          {classes.error instanceof ApiError
            ? classes.error.message
            : t.errors.generic}
        </Banner>
      ) : items.length === 0 && page === 1 ? (
        <EmptyState title={t.lessons.classesEmptyTitle}>
          {t.lessons.classesEmptyBody}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          <div
            className={cn(
              'flex flex-col gap-6 transition-opacity',
              busy && 'opacity-60',
            )}
            aria-busy={busy}
          >
            {items.length === 0 && (
              <p className="py-6 text-center text-sm text-slate">
                {t.lessons.classesEmptyTitle}
              </p>
            )}
            {groupClassesByDay(items).map((group) => (
              <section
                key={group.day}
                aria-label={formatDay(group.day, locale)}
                className="flex flex-col gap-2"
              >
                <h2 className="text-lg">{formatDay(group.day, locale)}</h2>
                <Card className="divide-y divide-grey/40 p-0">
                  {group.classes.map((c) => (
                    <ClassRow
                      key={c.id}
                      item={c}
                      instructorName={
                        localizeField(
                          c.instructorName,
                          c.instructorNameZh,
                          locale,
                        ) ||
                        names.get(c.instructorId) ||
                        '—'
                      }
                    />
                  ))}
                </Card>
              </section>
            ))}
          </div>
          <Card className="p-0">
            <Pager
              page={page}
              shownPage={shownPage}
              pageSize={CLASSES_PAGE_SIZE}
              count={items.length}
              total={total}
              busy={busy}
              onPage={setPage}
              text={{
                label: t.lessons.classesPagination,
                showing: t.lessons.classesShowing,
                previous: t.lessons.classesPrevPage,
                next: t.lessons.classesNextPage,
              }}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function ClassRow({
  item,
  instructorName,
}: {
  item: AdminClass;
  instructorName: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0 whitespace-nowrap font-mono text-xs text-slate sm:w-44 sm:pt-0.5">
        {formatTime(item.startsAt, locale)} – {formatTime(item.endsAt, locale)}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span data-private className="font-medium text-ink">
            {instructorName}
          </span>
          <span className="rounded-sm bg-sunken px-2 py-0.5 text-xs text-slate">
            {t.lessons[STATUS_KEYS[item.status]]}
          </span>
          <SyncBadge item={item} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate">
          <span>
            {localizeField(
              item.lessonTypeNameEn,
              item.lessonTypeNameZh,
              locale,
            ) || t.lessons.noLessonType}
          </span>
          {item.durationMin !== null && (
            <span className="text-xs">
              · {t.lessons.minutes.replace('{n}', String(item.durationMin))}
            </span>
          )}
          {item.groupSize !== null && (
            <span className="text-xs">
              · {t.lessons.groupSize.replace('{n}', String(item.groupSize))}
            </span>
          )}
          {item.locationName && (
            <span className="text-xs">· {item.locationName}</span>
          )}
          {item.isPromo && <PromoBadge />}
        </div>
        {item.participants.length === 0 ? (
          <span className="text-slate">{t.lessons.noParticipants}</span>
        ) : (
          <ul data-private className="flex flex-col gap-0.5">
            {item.participants.map((p) => (
              <li key={p.customerId} className="text-ink">
                {customerName(p) || p.email || p.phone || '—'}{' '}
                <span className="text-xs text-slate">
                  · {t.lessons[ATTENDANCE_KEYS[p.attendance]]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {item.notes && <p className="text-slate">{item.notes}</p>}
      </div>
      <ClassActions item={item} />
    </div>
  );
}
