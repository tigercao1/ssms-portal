import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import {
  Banner,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from '@/components';
import type { AdminClass, Attendance, ClassStatus } from '@/lib/types';
import { useAdminInstructors } from './api';
import { useAdminClasses } from './lessonsApi';
import { localizeField } from '@/i18n/core/localize';
import {
  addDays,
  dateInputValue,
  groupClassesByDay,
  rangeToIso,
} from './lessonRules';

type LessonsKey = Exclude<keyof Messages['lessons'], 'syncCounters'>;

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
  const [from, setFrom] = useState(dateInputValue(today));
  const [to, setTo] = useState(dateInputValue(addDays(today, 28)));
  const [instructorId, setInstructorId] = useState('');
  const instructors = useAdminInstructors({});
  const rangeValid = Boolean(from && to && from <= to);
  const iso = rangeValid ? rangeToIso(from, to) : null;
  const classes = useAdminClasses(
    iso && { ...iso, ...(instructorId && { instructorId }) },
  );

  const names = new Map(
    (instructors.data ?? []).map((i) => [
      i.id,
      localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    ]),
  );
  const options = [...names.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.lessons.classesTitle}</h1>

      <Card className="grid gap-4 sm:grid-cols-3">
        <Field label={t.lessons.filterInstructor}>
          {(p) => (
            <Select
              {...p}
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
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
              onChange={(e) => setFrom(e.target.value)}
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
              onChange={(e) => setTo(e.target.value)}
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
      ) : (classes.data ?? []).length === 0 ? (
        <EmptyState title={t.lessons.classesEmptyTitle}>
          {t.lessons.classesEmptyBody}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {groupClassesByDay(classes.data ?? []).map((group) => (
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
                    instructorName={names.get(c.instructorId) ?? '—'}
                  />
                ))}
              </Card>
            </section>
          ))}
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
      <div className="whitespace-nowrap font-mono text-xs text-slate sm:w-32 sm:pt-0.5">
        {formatTime(item.startsAt, locale)} – {formatTime(item.endsAt, locale)}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{instructorName}</span>
          <span className="rounded-sm bg-sunken px-2 py-0.5 text-xs text-slate">
            {t.lessons[STATUS_KEYS[item.status]]}
          </span>
        </div>
        {item.participants.length === 0 ? (
          <span className="text-slate">{t.lessons.noParticipants}</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {item.participants.map((p) => (
              <li key={p.customerId} className="text-ink">
                {p.name || p.email || '—'}{' '}
                <span className="text-xs text-slate">
                  · {t.lessons[ATTENDANCE_KEYS[p.attendance]]}
                </span>
              </li>
            ))}
          </ul>
        )}
        {item.notes && <p className="text-slate">{item.notes}</p>}
      </div>
    </div>
  );
}
