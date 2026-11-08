import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Banner, Button, Card, EmptyState, Pager, Spinner } from '@/components';
import type { AdminClass, Attendance } from '@/lib/types';
import { useAdminInstructors } from './api';
import {
  CLASSES_PAGE_SIZE,
  fetchClassesExport,
  useAdminClasses,
} from './lessonsApi';
import { localizeField } from '@/i18n/core/localize';
import {
  addDays,
  classFilterFor,
  classStatusFrom,
  classTabFrom,
  customerName,
  dateInputValue,
  groupClassesByDay,
  type ClassTab,
  type ClassView,
} from './lessonRules';
import { ClassFilters, STATUS_KEYS, type ClassFilterKey } from './ClassFilters';
import { errorText } from './payroll/payrollFormat';
import { PromoBadge } from './LessonTypesPage';
import { ClassActions } from './booking/ClassActions';
import {
  SyncBadge,
  SyncIssuesBanner,
  SyncToastHost,
} from './booking/CalendarSync';

type LessonsKey = keyof Messages['lessons'];

const ATTENDANCE_KEYS: Record<Attendance, LessonsKey> = {
  expected: 'attendanceExpected',
  attended: 'attendanceAttended',
  no_show: 'attendanceNoShow',
};

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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

function formatShortDay(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso));
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
  const [now] = useState(() => new Date());
  const [params, setParams] = useSearchParams();
  const view: ClassView = {
    tab: classTabFrom(params.get('tab')),
    from: params.get('from') ?? dateInputValue(today),
    to: params.get('to') ?? dateInputValue(addDays(today, 28)),
    day: params.get('day') ?? '',
    q: params.get('q') ?? '',
    instructorId: params.get('instructor') ?? '',
    lessonTypeId: params.get('lessonType') ?? '',
    locationId: params.get('location') ?? '',
    status: classStatusFrom(params.get('status')),
  };
  const page = pageFrom(params);
  const instructors = useAdminInstructors({});
  const filter = classFilterFor(view, now);
  const classes = useAdminClasses(filter, page);
  const exportCsv = useMutation({
    mutationFn: fetchClassesExport,
    onSuccess: ({ blob, filename }) =>
      saveBlob(filename ?? `classes-${dateInputValue(new Date())}.csv`, blob),
  });
  const items = classes.data?.classes ?? [];
  const total = classes.data?.total ?? 0;
  const shownPage = classes.data?.page ?? page;
  const busy = classes.isPlaceholderData;
  const filtered = Boolean(
    view.q ||
    view.instructorId ||
    view.lessonTypeId ||
    view.locationId ||
    (view.tab === 'all' && (view.status || view.day)),
  );

  function update(change: (out: URLSearchParams) => void) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        change(out);
        out.delete('page');
        return out;
      },
      { replace: true },
    );
  }

  function setFilter(key: ClassFilterKey, value: string) {
    update((out) => {
      if (!value && key !== 'from' && key !== 'to') out.delete(key);
      else out.set(key, value);
    });
  }

  function setTab(next: ClassTab) {
    update((out) => {
      for (const key of ['from', 'to', 'day', 'status']) out.delete(key);
      if (next === 'all') out.delete('tab');
      else out.set('tab', next);
    });
  }

  function setDayMode(on: boolean) {
    update((out) => {
      out.delete('from');
      out.delete('to');
      if (on) out.set('day', view.from || dateInputValue(today));
      else out.delete('day');
    });
  }

  function clearFilters() {
    update((out) => {
      for (const key of [...out.keys()]) if (key !== 'tab') out.delete(key);
    });
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
  const rangeInvalid =
    view.tab === 'all' &&
    !view.day &&
    filter === null &&
    Boolean(view.from && view.to);
  const recent = view.tab === 'recent';
  const instructorName = (c: AdminClass) =>
    localizeField(c.instructorName, c.instructorNameZh, locale) ||
    names.get(c.instructorId) ||
    '—';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl">{t.lessons.classesTitle}</h1>
        <Button
          variant="secondary"
          disabled={filter === null}
          loading={exportCsv.isPending}
          onClick={() => filter && exportCsv.mutate(filter)}
        >
          {t.lessons.exportCsv}
        </Button>
      </div>
      <SyncIssuesBanner />
      <SyncToastHost />
      {exportCsv.isError && (
        <Banner tone="error">
          {t.lessons.exportFailed.replace(
            '{message}',
            errorText(exportCsv.error, t.errors.generic),
          )}
        </Banner>
      )}

      <ClassFilters
        view={view}
        instructors={options}
        rangeInvalid={rangeInvalid}
        filtered={filtered}
        onTab={setTab}
        onFilter={setFilter}
        onDayMode={setDayMode}
        onClear={clearFilters}
      />

      {filter === null ? null : classes.isLoading ? (
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
        <EmptyState
          title={t.lessons.classesEmptyTitle}
          action={
            filtered && (
              <Button variant="secondary" onClick={clearFilters}>
                {t.lessons.clearFilters}
              </Button>
            )
          }
        >
          {filtered ? t.lessons.noMatchBody : t.lessons.classesEmptyBody}
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
            {recent ? (
              <Card className="divide-y divide-grey/40 p-0">
                {items.map((c) => (
                  <ClassRow
                    key={c.id}
                    item={c}
                    instructorName={instructorName(c)}
                    withDates
                  />
                ))}
              </Card>
            ) : (
              groupClassesByDay(items).map((group) => (
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
                        instructorName={instructorName(c)}
                      />
                    ))}
                  </Card>
                </section>
              ))
            )}
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
  withDates = false,
}: {
  item: AdminClass;
  instructorName: string;
  withDates?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <div className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:gap-6">
      <div className="shrink-0 whitespace-nowrap font-mono text-xs text-slate sm:w-44 sm:pt-0.5">
        {withDates && `${formatShortDay(item.startsAt, locale)} `}
        {formatTime(item.startsAt, locale)} – {formatTime(item.endsAt, locale)}
        {withDates && (
          <div className="mt-1 font-sans">
            {t.lessons.bookedAt.replace(
              '{date}',
              `${formatShortDay(item.createdAt, locale)} ${formatTime(item.createdAt, locale)}`,
            )}
          </div>
        )}
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
        {item.notes && (
          <p data-private className="text-slate">
            {item.notes}
          </p>
        )}
      </div>
      <ClassActions item={item} />
    </div>
  );
}
