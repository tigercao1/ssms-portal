import { useId, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Drawer,
  INSTRUCTOR_STAGES,
  StagePill,
  stageMeta,
  type InstructorStage,
} from '@/components';
import { buttonClasses } from '@/components/Button';
import { Popover } from '@/components/Popover';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { useMediaQuery } from '@/lib/useMediaQuery';

export const FILTER_POPOVER_QUERY = '(min-width: 640px)';

export interface InstructorFilterState {
  stages: InstructorStage[];
  calendar?: boolean;
}

export const NO_FILTERS: InstructorFilterState = { stages: [] };

function booleanFrom(
  params: URLSearchParams,
  key: string,
): boolean | undefined {
  const value = params.get(key);
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export function filtersFrom(params: URLSearchParams): InstructorFilterState {
  const requested = params.getAll('stage').flatMap((s) => s.split(','));
  return {
    stages: INSTRUCTOR_STAGES.filter((stage) => requested.includes(stage)),
    calendar: booleanFrom(params, 'calendar'),
  };
}

export function filterCount(filters: InstructorFilterState): number {
  return filters.stages.length + (filters.calendar === undefined ? 0 : 1);
}

function toggled<T>(current: T | undefined, option: T): T | undefined {
  return current === option ? undefined : option;
}

function calendarLabel(connected: boolean, t: Messages): string {
  return connected ? t.admin.calendarConnected : t.admin.calendarNotConnected;
}

function chipText(group: string, value: string, t: Messages): string {
  return t.admin.filterChip.replace('{group}', group).replace('{value}', value);
}

function FilterCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-[2.75rem] cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-ink hover:bg-navy-tint sm:min-h-[2.25rem]">
      <input
        type="checkbox"
        className="h-4 w-4 flex-none accent-[var(--navy)]"
        checked={checked}
        onChange={onChange}
      />
      {children}
    </label>
  );
}

function FilterGroup({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="mb-1 px-2 text-xs font-medium uppercase tracking-wide text-slate">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function FilterPanel({
  value,
  onChange,
}: {
  value: InstructorFilterState;
  onChange: (next: InstructorFilterState) => void;
}) {
  const t = useT();
  const toggleStage = (stage: InstructorStage) =>
    onChange({
      ...value,
      stages: value.stages.includes(stage)
        ? value.stages.filter((s) => s !== stage)
        : INSTRUCTOR_STAGES.filter(
            (s) => s === stage || value.stages.includes(s),
          ),
    });
  return (
    <div className="flex flex-col gap-4">
      <FilterGroup legend={t.admin.filterStatus}>
        {INSTRUCTOR_STAGES.map((stage) => (
          <FilterCheckbox
            key={stage}
            checked={value.stages.includes(stage)}
            onChange={() => toggleStage(stage)}
          >
            <StagePill stage={stage} />
          </FilterCheckbox>
        ))}
      </FilterGroup>
      <FilterGroup legend={t.admin.colCalendar}>
        {[true, false].map((option) => (
          <FilterCheckbox
            key={String(option)}
            checked={value.calendar === option}
            onChange={() =>
              onChange({ ...value, calendar: toggled(value.calendar, option) })
            }
          >
            {calendarLabel(option, t)}
          </FilterCheckbox>
        ))}
      </FilterGroup>
    </div>
  );
}

export function InstructorFilters({
  value,
  onChange,
}: {
  value: InstructorFilterState;
  onChange: (next: InstructorFilterState) => void;
}) {
  const t = useT();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const popover = useMediaQuery(FILTER_POPOVER_QUERY);
  const count = filterCount(value);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  const clear = (
    <Button
      variant="ghost"
      size="sm"
      disabled={count === 0}
      onClick={() => onChange(NO_FILTERS)}
    >
      {t.admin.clearAll}
    </Button>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open && popover ? panelId : undefined}
        aria-label={
          count > 0
            ? t.admin.filtersApplied.replace('{n}', String(count))
            : t.admin.filters
        }
        className={buttonClasses({ variant: 'secondary' })}
        onClick={() => setOpen((was) => !was)}
      >
        <FilterIcon />
        {t.admin.filters}
        {count > 0 && (
          <span
            aria-hidden
            className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-navy px-1.5 text-xs font-bold text-white"
          >
            {count}
          </span>
        )}
      </button>
      {open && popover && (
        <Popover
          id={panelId}
          label={t.admin.filters}
          triggerRef={triggerRef}
          onClose={close}
          className="w-72"
        >
          <div className="p-3">
            <FilterPanel value={value} onChange={onChange} />
          </div>
          <div className="sticky bottom-0 flex justify-end border-t border-grey/60 bg-surface px-3 py-2">
            {clear}
          </div>
        </Popover>
      )}
      {open && !popover && (
        <Drawer
          title={t.admin.filters}
          fullWidth
          onClose={() => close(true)}
          footer={
            <>
              {clear}
              <Button size="sm" onClick={() => close(true)}>
                {t.admin.showResults}
              </Button>
            </>
          }
        >
          <FilterPanel value={value} onChange={onChange} />
        </Drawer>
      )}
    </>
  );
}

export function AppliedFilterChips({
  value,
  onChange,
}: {
  value: InstructorFilterState;
  onChange: (next: InstructorFilterState) => void;
}) {
  const t = useT();
  if (filterCount(value) === 0) return null;
  const chips: {
    key: string;
    label: string;
    pill: ReactNode;
    remove: () => void;
  }[] = [
    ...value.stages.map((stage) => ({
      key: `stage-${stage}`,
      label: chipText(t.admin.filterStatus, stageMeta(stage, t).label, t),
      pill: <StagePill stage={stage} />,
      remove: () =>
        onChange({ ...value, stages: value.stages.filter((s) => s !== stage) }),
    })),
    ...(value.calendar === undefined
      ? []
      : [
          {
            key: 'calendar',
            label: chipText(
              t.admin.colCalendar,
              calendarLabel(value.calendar, t),
              t,
            ),
            pill: chipText(
              t.admin.colCalendar,
              calendarLabel(value.calendar, t),
              t,
            ),
            remove: () => onChange({ ...value, calendar: undefined }),
          },
        ]),
  ];
  return (
    <ul
      aria-label={t.admin.appliedFilters}
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            aria-label={t.admin.removeFilter.replace('{label}', chip.label)}
            onClick={chip.remove}
            className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-full border border-grey bg-surface py-1 pl-2 pr-2.5 text-xs font-medium text-ink hover:border-navy hover:bg-navy-tint"
          >
            {chip.pill}
            <span aria-hidden className="text-base leading-none text-slate">
              ×
            </span>
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="sm" onClick={() => onChange(NO_FILTERS)}>
          {t.admin.clearAll}
        </Button>
      </li>
    </ul>
  );
}

function FilterIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="M3 5h14M6 10h8M9 15h2" />
    </svg>
  );
}
