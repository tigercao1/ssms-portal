import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  Spinner,
} from '@/components';
import type {
  CalendarMatchStatus,
  GoogleCalendar,
  InstructorCalendarOverview,
  InstructorGoogleCalendarInput,
} from '@/lib/types';
import { useGoogleCalendars } from './googleApi';
import {
  useInstructorCalendars,
  useSetInstructorGoogleCalendar,
  useSuggestInstructorCalendars,
} from './lessonsApi';

export function CalendarStatusBadge({
  status,
}: {
  status: CalendarMatchStatus | null;
}) {
  const t = useT();
  const label =
    status === 'confirmed'
      ? t.calendarMatching.statusConfirmed
      : status === 'suggested'
        ? t.calendarMatching.statusSuggested
        : t.calendarMatching.statusNone;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium',
        status === 'confirmed' && 'border-status-approved text-ink',
        status === 'suggested' && 'border-status-pending text-ink',
        status === null && 'border-grey text-slate',
      )}
    >
      {label}
    </span>
  );
}

export function CalendarMatchingPage() {
  const t = useT();
  const overview = useInstructorCalendars();
  const connected = overview.data?.google.connected ?? false;
  const calendars = useGoogleCalendars(connected);
  const calendarList = calendars.data ?? [];
  const byId = new Map(calendarList.map((c) => [c.id, c]));
  const readOnly = calendarList.filter((c) => !c.canWrite);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.calendarMatching.title}</h1>
        <p className="max-w-3xl text-slate">{t.calendarMatching.intro}</p>
      </div>

      {overview.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : overview.isError || !overview.data ? (
        <Banner tone="error">
          {overview.error instanceof ApiError
            ? overview.error.message
            : t.errors.generic}
        </Banner>
      ) : (
        <>
          {!overview.data.google.connected && (
            <Banner tone="pending">
              <p>{t.calendarMatching.notConnected}</p>
              <Link
                to="/admin/settings/google"
                className="font-medium text-navy underline"
              >
                {t.calendarMatching.connectLink}
              </Link>
            </Banner>
          )}
          {overview.data.google.error && (
            <Banner tone="error">
              {t.calendarMatching.googleError.replace(
                '{message}',
                overview.data.google.error,
              )}
            </Banner>
          )}
          <SuggestCard />
          {overview.data.instructors.length === 0 ? (
            <EmptyState title={t.calendarMatching.empty} />
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead>
                    <tr className="border-b border-grey/60 text-left text-xs uppercase tracking-wide text-slate">
                      <th className="px-4 py-2 font-medium">
                        {t.calendarMatching.colInstructor}
                      </th>
                      <th className="px-4 py-2 font-medium">
                        {t.calendarMatching.colCalendar}
                      </th>
                      <th className="w-px whitespace-nowrap px-4 py-2 font-medium">
                        {t.calendarMatching.colStatus}
                      </th>
                      <th className="w-px whitespace-nowrap px-4 py-2 text-right font-medium">
                        {t.admin.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.data.instructors.map((entry, i) => (
                      <InstructorRow
                        key={entry.instructorId}
                        entry={entry}
                        striped={i % 2 === 1}
                        calendars={calendarList}
                        calendarById={byId}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {readOnly.length > 0 && <ReadOnlyCalendars calendars={readOnly} />}
        </>
      )}
    </div>
  );
}

function SuggestCard() {
  const t = useT();
  const suggest = useSuggestInstructorCalendars();
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate">{t.calendarMatching.suggestBody}</p>
        <Button
          variant="secondary"
          loading={suggest.isPending}
          onClick={() => suggest.mutate()}
        >
          {t.calendarMatching.suggest}
        </Button>
      </div>
      {suggest.isError && (
        <Banner tone="error" title={t.calendarMatching.suggestFailed}>
          {suggest.error instanceof ApiError
            ? suggest.error.message
            : t.errors.generic}
        </Banner>
      )}
      {suggest.isSuccess && (
        <Banner tone="approved">
          {t.calendarMatching.suggested.replace(
            '{count}',
            String(suggest.data.suggested),
          )}
        </Banner>
      )}
    </Card>
  );
}

function CantWriteWarning() {
  const t = useT();
  return (
    <p className="flex items-start gap-1.5 text-xs text-status-rejected">
      <span aria-hidden>⚠</span>
      <span>{t.calendarMatching.cantWrite}</span>
    </p>
  );
}

function InstructorRow({
  entry,
  striped,
  calendars,
  calendarById,
}: {
  entry: InstructorCalendarOverview;
  striped: boolean;
  calendars: GoogleCalendar[];
  calendarById: Map<string, GoogleCalendar>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const save = useSetInstructorGoogleCalendar();
  const [changing, setChanging] = useState(false);
  const [picked, setPicked] = useState('');
  const name =
    localizeField(entry.displayNameEn, entry.displayNameZh, locale) ||
    entry.email ||
    entry.instructorId;
  const linked = entry.googleCalendarId
    ? calendarById.get(entry.googleCalendarId)
    : undefined;
  const proposal = !entry.googleCalendarId ? entry.suggestion : null;
  const confirmTarget =
    entry.matchStatus === 'suggested' && entry.googleCalendarId
      ? {
          googleCalendarId: entry.googleCalendarId,
          calendarSummary: entry.calendarSummary,
        }
      : proposal
        ? {
            googleCalendarId: proposal.calendarId,
            calendarSummary: proposal.calendarSummary,
          }
        : null;
  const pickedCalendar = calendarById.get(picked);

  function submit(input: InstructorGoogleCalendarInput) {
    save.mutate(
      { instructorId: entry.instructorId, ...input },
      { onSuccess: () => setChanging(false) },
    );
  }

  return (
    <tr className={cn('align-top', striped && 'bg-sunken')}>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-ink">{name}</span>
          {entry.email && (
            <span className="break-all text-xs text-slate">{entry.email}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1">
          {entry.googleCalendarId ? (
            <>
              <span className="text-ink">
                {entry.calendarSummary ||
                  linked?.summary ||
                  entry.googleCalendarId}
              </span>
              <span className="break-all font-mono text-xs text-slate">
                {entry.googleCalendarId}
              </span>
              {linked && !linked.canWrite && <CantWriteWarning />}
            </>
          ) : proposal ? (
            <>
              <span className="text-ink">
                {t.calendarMatching.proposal.replace(
                  '{name}',
                  proposal.calendarSummary,
                )}
              </span>
              <span className="break-all font-mono text-xs text-slate">
                {proposal.calendarId} ·{' '}
                {proposal.matchedBy === 'email'
                  ? t.calendarMatching.matchedByEmail
                  : t.calendarMatching.matchedByName}
              </span>
              {calendarById.get(proposal.calendarId)?.canWrite === false && (
                <CantWriteWarning />
              )}
            </>
          ) : (
            <span className="text-slate">—</span>
          )}
          {changing && (
            <div className="mt-2 flex flex-col gap-2">
              <Field
                label={t.calendarMatching.pickLabel.replace('{name}', name)}
              >
                {(p) => (
                  <Select
                    {...p}
                    value={picked}
                    onChange={(e) => {
                      setPicked(e.target.value);
                      save.reset();
                    }}
                  >
                    <option value="">
                      {t.calendarMatching.pickPlaceholder}
                    </option>
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                        {c.summary !== c.id ? ` (${c.id})` : ''}
                        {c.canWrite ? '' : ` · ${t.calendarMatching.readOnly}`}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {pickedCalendar && !pickedCalendar.canWrite && (
                <CantWriteWarning />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!pickedCalendar}
                  loading={save.isPending}
                  onClick={() =>
                    pickedCalendar &&
                    submit({
                      googleCalendarId: pickedCalendar.id,
                      calendarSummary: pickedCalendar.summary,
                      matchStatus: 'confirmed',
                    })
                  }
                >
                  {t.common.save}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={save.isPending}
                  onClick={() => {
                    setChanging(false);
                    save.reset();
                  }}
                >
                  {t.common.cancel}
                </Button>
              </div>
            </div>
          )}
          {save.isError && (
            <Banner tone="error">
              {save.error instanceof ApiError && save.error.status === 409
                ? t.calendarMatching.calendarTaken
                : save.error instanceof ApiError
                  ? save.error.message
                  : t.errors.generic}
            </Banner>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <CalendarStatusBadge status={entry.matchStatus} />
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex justify-end gap-2">
          {confirmTarget && (
            <Button
              size="sm"
              aria-label={t.calendarMatching.confirmFor.replace('{name}', name)}
              disabled={save.isPending}
              onClick={() =>
                submit({ ...confirmTarget, matchStatus: 'confirmed' })
              }
            >
              {t.calendarMatching.confirm}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            aria-label={t.calendarMatching.changeFor.replace('{name}', name)}
            aria-expanded={changing}
            disabled={calendars.length === 0 || save.isPending}
            onClick={() => {
              setPicked(entry.googleCalendarId ?? '');
              setChanging((open) => !open);
              save.reset();
            }}
          >
            {t.calendarMatching.change}
          </Button>
          {entry.googleCalendarId && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t.calendarMatching.clearFor.replace('{name}', name)}
              disabled={save.isPending}
              onClick={() => submit({ googleCalendarId: null })}
            >
              {t.calendarMatching.clear}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ReadOnlyCalendars({ calendars }: { calendars: GoogleCalendar[] }) {
  const t = useT();
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{t.calendarMatching.readOnlyTitle}</h2>
        <p className="text-sm text-slate">{t.calendarMatching.readOnlyBody}</p>
      </div>
      <ul className="flex flex-col divide-y divide-grey/40 text-sm">
        {calendars.map((c) => (
          <li key={c.id} className="flex flex-col gap-0.5 py-2">
            <span className="flex items-center gap-1.5 text-ink">
              <span aria-hidden className="text-status-rejected">
                ⚠
              </span>
              {c.summary}
            </span>
            <span className="break-all font-mono text-xs text-slate">
              {c.id} · {c.accessRole}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
