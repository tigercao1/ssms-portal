import { useEffect, useRef, useState } from 'react';
import { Button, Card, Field, Input, Select } from '@/components';
import { useTeachingLocations } from '@/features/reference/api';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Messages } from '@/i18n/core/types';
import { cn } from '@/lib/cn';
import type { ClassStatus } from '@/lib/types';
import { useLessonTypes } from './lessonsApi';
import {
  CLASS_STATUSES,
  CLASS_TABS,
  NOT_CANCELLED_STATUSES,
  type ClassTab,
  type ClassView,
} from './lessonRules';

type LessonsKey = keyof Messages['lessons'];

export type ClassFilterKey =
  | 'q'
  | 'instructor'
  | 'lessonType'
  | 'location'
  | 'status'
  | 'from'
  | 'to'
  | 'day';

export const STATUS_KEYS: Record<ClassStatus, LessonsKey> = {
  scheduled: 'classScheduled',
  completed: 'classCompleted',
  no_show: 'classNoShow',
  cancelled: 'classCancelled',
};

const TAB_KEYS: Record<ClassTab, LessonsKey> = {
  upcoming: 'tabUpcoming',
  recent: 'tabRecent',
  cancelled: 'tabCancelled',
  all: 'tabAll',
};

export const SEARCH_DEBOUNCE_MS = 300;

export function ClassFilters({
  view,
  instructors,
  rangeInvalid,
  filtered,
  onTab,
  onFilter,
  onDayMode,
  onClear,
  calendar = false,
}: {
  view: ClassView;
  instructors: [string, string][];
  rangeInvalid: boolean;
  filtered: boolean;
  onTab: (tab: ClassTab) => void;
  onFilter: (key: ClassFilterKey, value: string) => void;
  onDayMode: (on: boolean) => void;
  onClear: () => void;
  calendar?: boolean;
}) {
  const t = useT();
  const { locale } = useLocale();
  const lessonTypes = useLessonTypes();
  const locations = useTeachingLocations();
  const all = view.tab === 'all' && !calendar;

  return (
    <>
      {!calendar && (
        <div
          role="tablist"
          aria-label={t.lessons.tabsLabel}
          className="grid grid-cols-2 gap-1 border-b border-grey/60 sm:flex"
        >
          {CLASS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={view.tab === tab}
              onClick={() => onTab(tab)}
              className={cn(
                'min-h-11 border-b-2 px-3 text-sm transition-colors',
                view.tab === tab
                  ? 'border-red font-medium text-navy'
                  : 'border-transparent text-slate hover:text-navy',
              )}
            >
              {t.lessons[TAB_KEYS[tab]]}
            </button>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-4">
        <SearchField value={view.q} onSearch={(q) => onFilter('q', q)} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.lessons.filterInstructor}>
            {(p) => (
              <Select
                {...p}
                value={view.instructorId}
                onChange={(e) => onFilter('instructor', e.target.value)}
              >
                <option value="">{t.lessons.allInstructors}</option>
                {instructors.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.lessons.filterLessonType}>
            {(p) => (
              <Select
                {...p}
                value={view.lessonTypeId}
                onChange={(e) => onFilter('lessonType', e.target.value)}
              >
                <option value="">{t.lessons.allLessonTypes}</option>
                {(lessonTypes.data ?? []).map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {localizeField(lt.nameEn, lt.nameZh, locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.lessons.filterLocation}>
            {(p) => (
              <Select
                {...p}
                value={view.locationId}
                onChange={(e) => onFilter('location', e.target.value)}
              >
                <option value="">{t.lessons.allLocations}</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {localizeField(l.name, l.nameZh, locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {(all || calendar) && (
            <Field
              label={t.lessons.filterStatus}
              hint={
                calendar && !view.status
                  ? t.lessons.calendarCancelledHint
                  : undefined
              }
            >
              {(p) => (
                <Select
                  {...p}
                  value={view.status}
                  onChange={(e) => onFilter('status', e.target.value)}
                >
                  <option value="">{t.lessons.allStatuses}</option>
                  <option value={NOT_CANCELLED_STATUSES}>
                    {t.lessons.notCancelledStatuses}
                  </option>
                  {CLASS_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {t.lessons[STATUS_KEYS[status]]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>

        {all && (
          <div className="flex flex-col gap-4">
            <div
              role="group"
              aria-label={t.lessons.dateModeLabel}
              className="flex w-full overflow-hidden rounded-md border border-grey sm:w-auto sm:self-start"
            >
              {[false, true].map((day) => (
                <button
                  key={String(day)}
                  type="button"
                  aria-pressed={Boolean(view.day) === day}
                  onClick={() => onDayMode(day)}
                  className={cn(
                    'min-h-11 flex-1 whitespace-nowrap px-4 text-sm font-medium transition-colors',
                    Boolean(view.day) === day
                      ? 'bg-navy text-white'
                      : 'text-slate hover:bg-navy-tint',
                  )}
                >
                  {day ? t.lessons.dayMode : t.lessons.rangeMode}
                </button>
              ))}
            </div>
            {view.day ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={t.lessons.dayLabel}
                  hint={view.instructorId ? undefined : t.lessons.dayHint}
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={view.day}
                      onChange={(e) =>
                        e.target.value && onFilter('day', e.target.value)
                      }
                    />
                  )}
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.lessons.fromLabel}>
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={view.from}
                      onChange={(e) => onFilter('from', e.target.value)}
                    />
                  )}
                </Field>
                <Field
                  label={t.lessons.toLabel}
                  error={rangeInvalid ? t.lessons.rangeInvalid : undefined}
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={view.to}
                      onChange={(e) => onFilter('to', e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
        )}

        {filtered && (
          <Button variant="ghost" className="self-start px-3" onClick={onClear}>
            {t.lessons.clearFilters}
          </Button>
        )}
      </Card>
    </>
  );
}

function SearchField({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (q: string) => void;
}) {
  const t = useT();
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  const search = useRef(onSearch);
  search.current = onSearch;
  if (value !== synced) {
    setSynced(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => {
    const q = text.trim();
    if (q === synced) return;
    const timer = setTimeout(() => search.current(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, synced]);

  return (
    <Field label={t.lessons.searchLabel}>
      {(p) => (
        <Input
          {...p}
          type="search"
          maxLength={100}
          autoComplete="off"
          placeholder={t.lessons.searchPlaceholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
    </Field>
  );
}
