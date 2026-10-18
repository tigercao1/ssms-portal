import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Banner, Button, Card, Field, Input, Spinner } from '@/components';
import type {
  GoogleCalendar,
  InstructorCalendarsOverview,
  InstructorGoogleCalendar,
} from '@/lib/types';
import { useGoogleCalendars } from './googleApi';
import {
  useInstructorCalendars,
  useInstructorGoogleCalendar,
  useSetInstructorGoogleCalendar,
} from './lessonsApi';

type SaveMutation = ReturnType<typeof useSetInstructorGoogleCalendar>;

export function InstructorCalendarCard({
  instructorId,
}: {
  instructorId: string;
}) {
  const t = useT();
  const current = useInstructorGoogleCalendar(instructorId);
  const overview = useInstructorCalendars();
  const google = overview.data?.google;
  const listable = Boolean(google?.connected && !google.error);
  const calendars = useGoogleCalendars(listable);
  const save = useSetInstructorGoogleCalendar();
  const loading =
    current.isLoading ||
    overview.isLoading ||
    (listable && calendars.isLoading);

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.instructorCalendar.title}</h2>
      {loading ? (
        <Spinner />
      ) : current.isError || !current.data ? (
        <Banner tone="error">{t.errors.generic}</Banner>
      ) : (
        <CalendarEditor
          key={current.data.googleCalendarId ?? ''}
          current={current.data}
          overview={overview.data}
          calendars={listable ? calendars.data : undefined}
          unavailable={
            listable && calendars.data
              ? null
              : google && !google.connected
                ? t.instructorCalendar.notConnected
                : t.instructorCalendar.googleError
          }
          save={save}
        />
      )}
    </Card>
  );
}

function CalendarEditor({
  current,
  overview,
  calendars,
  unavailable,
  save,
}: {
  current: InstructorGoogleCalendar;
  overview: InstructorCalendarsOverview | undefined;
  calendars: GoogleCalendar[] | undefined;
  unavailable: string | null;
  save: SaveMutation;
}) {
  const t = useT();
  const { locale } = useLocale();
  const owners = new Map<string, string>();
  for (const entry of overview?.instructors ?? []) {
    if (entry.instructorId !== current.instructorId && entry.googleCalendarId) {
      owners.set(
        entry.googleCalendarId,
        localizeField(entry.displayNameEn, entry.displayNameZh, locale) ||
          entry.email ||
          entry.instructorId,
      );
    }
  }
  function submit(googleCalendarId: string | null) {
    save.mutate({
      instructorId: current.instructorId,
      googleCalendarId,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {calendars && !unavailable ? (
        <CalendarPicker
          current={current}
          calendars={calendars}
          owners={owners}
          save={save}
          onSubmit={submit}
        />
      ) : (
        <ManualCalendarForm
          current={current}
          message={unavailable ?? t.instructorCalendar.googleError}
          save={save}
          onSubmit={submit}
        />
      )}
      {save.isError && (
        <Banner tone="error">
          {save.error instanceof ApiError && save.error.status === 409
            ? t.instructorCalendar.taken
            : save.error instanceof ApiError
              ? save.error.message
              : t.errors.generic}
        </Banner>
      )}
      {save.isSuccess && <Banner tone="approved">{t.common.saved}</Banner>}
    </div>
  );
}

function calendarLabel(calendar: GoogleCalendar) {
  return calendar.summary !== calendar.id
    ? `${calendar.summary} (${calendar.id})`
    : calendar.id;
}

interface PickerOption {
  id: string;
  label: string;
  tags: string[];
  disabled: boolean;
}

function CalendarPicker({
  current,
  calendars,
  owners,
  save,
  onSubmit,
}: {
  current: InstructorGoogleCalendar;
  calendars: GoogleCalendar[];
  owners: Map<string, string>;
  save: SaveMutation;
  onSubmit: (googleCalendarId: string | null) => void;
}) {
  const t = useT();
  const listId = useId();
  const [picked, setPicked] = useState(current.googleCalendarId ?? '');
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const needle = (query ?? '').trim().toLowerCase();
  const matches = (c: GoogleCalendar) =>
    !needle ||
    c.summary.toLowerCase().includes(needle) ||
    c.id.toLowerCase().includes(needle);
  const unlisted =
    current.googleCalendarId &&
    !calendars.some((c) => c.id === current.googleCalendarId)
      ? current.googleCalendarId
      : null;
  const unlistedLabel = unlisted ? current.calendarSummary || unlisted : '';
  const available: PickerOption[] = [
    ...(unlisted &&
    (!needle ||
      unlistedLabel.toLowerCase().includes(needle) ||
      unlisted.toLowerCase().includes(needle))
      ? [
          {
            id: unlisted,
            label: unlistedLabel,
            tags: [t.instructorCalendar.notShared],
            disabled: false,
          },
        ]
      : []),
    ...calendars
      .filter((c) => !owners.has(c.id) && matches(c))
      .map((c) => ({
        id: c.id,
        label: calendarLabel(c),
        tags: c.canWrite ? [] : [t.instructorCalendar.readOnlyTag],
        disabled: false,
      })),
  ];
  const linked: PickerOption[] = calendars
    .filter((c) => owners.has(c.id) && matches(c))
    .map((c) => ({
      id: c.id,
      label: calendarLabel(c),
      tags: [
        t.instructorCalendar.linkedTo.replace('{name}', owners.get(c.id) ?? ''),
      ],
      disabled: true,
    }));
  const activeIndex = available.findIndex((o) => o.id === activeId);
  const pickedCalendar = calendars.find((c) => c.id === picked);
  const pickedText = pickedCalendar
    ? calendarLabel(pickedCalendar)
    : picked === unlisted && unlisted
      ? unlistedLabel
      : '';
  const unchanged = picked === (current.googleCalendarId ?? '');
  const optionId = (id: string) => `${listId}-${id}`;

  useEffect(() => {
    if (!open || !activeId) return;
    document
      .getElementById(`${listId}-${activeId}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [open, activeId, listId]);

  function openList() {
    setOpen(true);
    setActiveId(picked || null);
  }

  function closeList() {
    setOpen(false);
    setQuery(null);
    setActiveId(null);
  }

  function choose(option: PickerOption) {
    if (option.disabled) return;
    setPicked(option.id);
    save.reset();
    closeList();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        closeList();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (available.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next =
        activeIndex === -1
          ? step === 1
            ? 0
            : available.length - 1
          : (activeIndex + step + available.length) % available.length;
      setActiveId(available[next]?.id ?? null);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      const pick = available[activeIndex] ?? (needle ? available[0] : null);
      if (pick) choose(pick);
      else closeList();
    }
  }

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (picked) onSubmit(picked);
  }

  function renderOption(option: PickerOption) {
    const selected = option.id === picked;
    return (
      <li
        key={option.id}
        id={optionId(option.id)}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        className={cn(
          'flex items-start gap-2 px-3 py-2 text-sm',
          option.disabled
            ? 'cursor-not-allowed text-slate'
            : 'cursor-pointer text-ink hover:bg-navy-tint',
          option.id === activeId && 'bg-navy-tint',
        )}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(option)}
      >
        <span aria-hidden className="w-3 shrink-0 text-navy">
          {selected ? '✓' : ''}
        </span>
        <span className="min-w-0 break-words">
          {[option.label, ...option.tags].join(' · ')}
        </span>
      </li>
    );
  }

  return (
    <form onSubmit={onFormSubmit} noValidate className="flex flex-col gap-3">
      <Field label={t.instructorCalendar.pickLabel}>
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              role="combobox"
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={
                open && activeId ? optionId(activeId) : undefined
              }
              className="pr-9"
              placeholder={
                open
                  ? t.instructorCalendar.searchPlaceholder
                  : t.instructorCalendar.noCalendar
              }
              value={query ?? pickedText}
              onFocus={(e) => {
                e.target.select();
                openList();
              }}
              onClick={() => {
                if (!open) openList();
              }}
              onBlur={closeList}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActiveId(null);
              }}
              onKeyDown={onKeyDown}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate"
            >
              ▾
            </span>
            {open && (
              <div className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-grey/60 bg-surface py-1 shadow-pop">
                {available.length === 0 && linked.length === 0 ? (
                  <p role="status" className="px-3 py-2 text-sm text-slate">
                    {t.instructorCalendar.noMatches}
                  </p>
                ) : (
                  <ul
                    data-private
                    id={listId}
                    role="listbox"
                    aria-label={t.instructorCalendar.pickLabel}
                  >
                    {available.length > 0 && (
                      <li role="presentation">
                        <ul
                          role="group"
                          aria-label={t.instructorCalendar.groupAvailable}
                        >
                          <li
                            role="presentation"
                            className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-slate"
                          >
                            {t.instructorCalendar.groupAvailable}
                          </li>
                          {available.map(renderOption)}
                        </ul>
                      </li>
                    )}
                    {linked.length > 0 && (
                      <li role="presentation">
                        <ul
                          role="group"
                          aria-label={t.instructorCalendar.groupLinked}
                        >
                          <li
                            role="presentation"
                            className="px-3 pb-1 pt-2 text-xs font-medium uppercase text-slate"
                          >
                            {t.instructorCalendar.groupLinked}
                          </li>
                          {linked.map(renderOption)}
                        </ul>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </Field>
      {pickedCalendar && !pickedCalendar.canWrite && (
        <p className="flex items-start gap-1.5 text-sm text-status-rejected">
          <span aria-hidden>⚠</span>
          <span>{t.instructorCalendar.readOnlyWarning}</span>
        </p>
      )}
      <CalendarActions
        current={current}
        save={save}
        saveDisabled={!picked || unchanged}
        onClear={() => onSubmit(null)}
      />
    </form>
  );
}

function ManualCalendarForm({
  current,
  message,
  save,
  onSubmit,
}: {
  current: InstructorGoogleCalendar;
  message: string;
  save: SaveMutation;
  onSubmit: (googleCalendarId: string | null) => void;
}) {
  const t = useT();
  const [value, setValue] = useState(current.googleCalendarId ?? '');
  const next = value.trim() || null;

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(next);
  }

  return (
    <form onSubmit={onFormSubmit} noValidate className="flex flex-col gap-3">
      <Banner tone="pending">
        <p>{message}</p>
        <Link
          to="/admin/settings/google"
          className="font-medium text-navy underline"
        >
          {t.instructorCalendar.settingsLink}
        </Link>
      </Banner>
      <Field
        label={t.instructorCalendar.manualLabel}
        hint={t.instructorCalendar.manualHint}
      >
        {(p) => (
          <Input
            {...p}
            value={value}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setValue(e.target.value);
              save.reset();
            }}
          />
        )}
      </Field>
      <CalendarActions
        current={current}
        save={save}
        saveDisabled={next === null && current.googleCalendarId === null}
        onClear={() => onSubmit(null)}
      />
    </form>
  );
}

function CalendarActions({
  current,
  save,
  saveDisabled,
  onClear,
}: {
  current: InstructorGoogleCalendar;
  save: SaveMutation;
  saveDisabled: boolean;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="submit"
        variant="secondary"
        disabled={saveDisabled}
        loading={save.isPending}
      >
        {t.common.save}
      </Button>
      {current.googleCalendarId && (
        <Button
          type="button"
          variant="ghost"
          disabled={save.isPending}
          onClick={onClear}
        >
          {t.instructorCalendar.clear}
        </Button>
      )}
    </div>
  );
}
