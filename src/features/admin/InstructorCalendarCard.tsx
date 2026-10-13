import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Banner, Button, Card, Field, Input, Select, Spinner } from '@/components';
import type {
  CalendarMatchStatus,
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

interface Suggestion {
  calendarId: string;
  summary: string;
}

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{t.instructorCalendar.title}</h2>
        {current.data?.matchStatus && (
          <CalendarStatusBadge status={current.data.matchStatus} />
        )}
      </div>
      {loading ? (
        <Spinner />
      ) : current.isError || !current.data ? (
        <Banner tone="error">{t.errors.generic}</Banner>
      ) : (
        <CalendarEditor
          key={`${current.data.googleCalendarId}:${current.data.matchStatus}`}
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

function CalendarStatusBadge({ status }: { status: CalendarMatchStatus }) {
  const t = useT();
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium text-ink',
        status === 'confirmed'
          ? 'border-status-approved'
          : 'border-status-pending',
      )}
    >
      {status === 'confirmed'
        ? t.instructorCalendar.statusConfirmed
        : t.instructorCalendar.statusSuggested}
    </span>
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
  const own = overview?.instructors.find(
    (entry) => entry.instructorId === current.instructorId,
  );
  const suggestion: Suggestion | null =
    current.matchStatus === 'suggested' && current.googleCalendarId
      ? {
          calendarId: current.googleCalendarId,
          summary: current.calendarSummary || current.googleCalendarId,
        }
      : !current.googleCalendarId &&
          own?.suggestion &&
          !owners.has(own.suggestion.calendarId)
        ? {
            calendarId: own.suggestion.calendarId,
            summary: own.suggestion.calendarSummary,
          }
        : null;

  function submit(googleCalendarId: string | null) {
    save.mutate({
      instructorId: current.instructorId,
      googleCalendarId,
      ...(googleCalendarId !== null && { matchStatus: 'confirmed' as const }),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {suggestion && (
        <Banner tone="pending">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {t.instructorCalendar.suggestion.replace(
                '{name}',
                suggestion.summary,
              )}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={save.isPending}
              onClick={() => submit(suggestion.calendarId)}
            >
              {t.instructorCalendar.confirm}
            </Button>
          </div>
        </Banner>
      )}
      {calendars && !unavailable ? (
        <CalendarPicker
          current={current}
          calendars={calendars}
          owners={owners}
          suggestedId={suggestion?.calendarId ?? null}
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

function optionLabel(calendar: GoogleCalendar, extras: string[]) {
  return [
    calendar.summary !== calendar.id
      ? `${calendar.summary} (${calendar.id})`
      : calendar.id,
    ...extras,
  ].join(' · ');
}

function CalendarPicker({
  current,
  calendars,
  owners,
  suggestedId,
  save,
  onSubmit,
}: {
  current: InstructorGoogleCalendar;
  calendars: GoogleCalendar[];
  owners: Map<string, string>;
  suggestedId: string | null;
  save: SaveMutation;
  onSubmit: (googleCalendarId: string | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(current.googleCalendarId ?? '');
  const needle = query.trim().toLowerCase();
  const visible = (c: GoogleCalendar) =>
    c.id === picked ||
    !needle ||
    c.summary.toLowerCase().includes(needle) ||
    c.id.toLowerCase().includes(needle);
  const unlisted =
    current.googleCalendarId &&
    !calendars.some((c) => c.id === current.googleCalendarId)
      ? current.googleCalendarId
      : null;
  const available = calendars
    .filter((c) => !owners.has(c.id) && visible(c))
    .sort((a, b) => Number(b.id === suggestedId) - Number(a.id === suggestedId));
  const linked = calendars.filter((c) => owners.has(c.id) && visible(c));
  const pickedCalendar = calendars.find((c) => c.id === picked);
  const unchanged =
    picked === (current.googleCalendarId ?? '') &&
    current.matchStatus === 'confirmed';

  function onFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (picked) onSubmit(picked);
  }

  return (
    <form onSubmit={onFormSubmit} noValidate className="flex flex-col gap-3">
      <Field label={t.instructorCalendar.searchLabel}>
        {(p) => (
          <Input
            {...p}
            type="search"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </Field>
      <Field label={t.instructorCalendar.pickLabel}>
        {(p) => (
          <Select
            {...p}
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value);
              save.reset();
            }}
          >
            <option value="">{t.instructorCalendar.noCalendar}</option>
            {(available.length > 0 || unlisted) && (
              <optgroup label={t.instructorCalendar.groupAvailable}>
                {unlisted && (
                  <option value={unlisted}>
                    {[
                      current.calendarSummary || unlisted,
                      t.instructorCalendar.notShared,
                    ].join(' · ')}
                  </option>
                )}
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    {optionLabel(c, [
                      ...(c.id === suggestedId
                        ? [t.instructorCalendar.suggestedTag]
                        : []),
                      ...(c.canWrite ? [] : [t.instructorCalendar.readOnlyTag]),
                    ])}
                  </option>
                ))}
              </optgroup>
            )}
            {linked.length > 0 && (
              <optgroup label={t.instructorCalendar.groupLinked}>
                {linked.map((c) => (
                  <option key={c.id} value={c.id} disabled>
                    {optionLabel(c, [
                      t.instructorCalendar.linkedTo.replace(
                        '{name}',
                        owners.get(c.id) ?? '',
                      ),
                    ])}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        )}
      </Field>
      {needle && available.length === 0 && linked.length === 0 && (
        <p className="text-sm text-slate">{t.instructorCalendar.noMatches}</p>
      )}
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
