import {
  forwardRef,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Banner, Button, Card, Input, Select } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { todayIso } from '@/features/documents/api/validity';
import { errorText, formatDay } from '@/features/admin/payroll/payrollFormat';
import { useSeasons, useTeachingLocations } from '@/features/reference/api';
import { errorCodeOf, useRegisterLesson, useSeasonInsurance } from './api';
import { BILLED_STUDENTS_MAX, dollars, listCents } from './money';
import type { InsuranceRecord, InsuranceSeason, SeasonCoverage } from './types';

export const WAIVER_URL_ZH = 'https://ssnow.club/pages/waiver';
export const WAIVER_URL_EN = 'https://ssnow.club/en/pages/waiver';

const OTHER = 'other';
export const MAX_STUDENTS = 50;

interface StudentRow {
  id: number;
  name: string;
  waiverConfirmed: boolean;
}

export interface RegisterLessonHandle {
  focus: () => void;
}

let nextRowId = 1;
const emptyRow = (): StudentRow => ({
  id: nextRowId++,
  name: '',
  waiverConfirmed: false,
});

function inSeason(date: string, season: InsuranceSeason) {
  return date >= season.startsOn && date <= season.endsOn;
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

function nearestSeason<S extends InsuranceSeason>(date: string, seasons: S[]) {
  const distance = (s: S) =>
    date < s.startsOn
      ? dayNumber(s.startsOn) - dayNumber(date)
      : dayNumber(date) - dayNumber(s.endsOn);
  return seasons.reduce<S | undefined>(
    (best, s) => (!best || distance(s) < distance(best) ? s : best),
    undefined,
  );
}

export const RegisterLessonCard = forwardRef<
  RegisterLessonHandle,
  {
    season: InsuranceSeason | null;
    coverage: SeasonCoverage;
    owedCents: number;
    capCents: number;
    onToast: (message: string) => void;
  }
>(function RegisterLessonCard(
  { season, coverage, owedCents, capCents, onToast },
  ref,
) {
  const t = useT();
  const s = t.insurance;
  const { locale } = useLocale();
  const headingId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const locations = useTeachingLocations();
  const register = useRegisterLesson();
  const seasons = useSeasons();
  const [dateInput, setDateInput] = useState<string | null>(null);
  const [hours, setHours] = useState<1 | 2>(1);
  const [location, setLocation] = useState('');
  const [locationOther, setLocationOther] = useState('');
  const [rows, setRows] = useState<StudentRow[]>(() => [emptyRow()]);
  const [touched, setTouched] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  useImperativeHandle(ref, () => ({
    focus: () => {
      cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      firstNameRef.current?.focus({ preventScroll: true });
    },
  }));

  const seasonsReady = !seasons.isPending;
  const knownSeasons: InsuranceSeason[] =
    seasons.data ?? (season ? [season] : []);
  const today = todayIso();
  const lessonDate =
    dateInput ??
    (seasonsReady && knownSeasons.some((x) => inSeason(today, x)) ? today : '');
  const lessonSeason = lessonDate
    ? knownSeasons.find((x) => inSeason(lessonDate, x))
    : undefined;
  const pageSeason = Boolean(lessonSeason && lessonSeason.key === season?.key);
  const seasonInsurance = useSeasonInsurance(
    lessonSeason?.key ?? null,
    !pageSeason,
  );
  const dateInsurance = !lessonSeason
    ? undefined
    : pageSeason
      ? { coverage, owedCents, capCents }
      : seasonInsurance.data;
  const dateCoverage = dateInsurance?.coverage;
  const quoteReady = seasonsReady && dateCoverage !== undefined;
  const outsideSeason = seasonsReady && Boolean(lessonDate) && !lessonSeason;
  const covered = quoteReady && dateCoverage !== 'none';
  const count = rows.length;
  const list = listCents(hours, count);
  const capLeft = dateInsurance
    ? Math.max(0, dateInsurance.capCents - dateInsurance.owedCents)
    : list;
  const amount = covered ? 0 : Math.min(list, capLeft);
  const crossesCap = !covered && amount < list;
  const missingName = rows.some((r) => !r.name.trim());
  const missingWaiver = rows.some((r) => !r.waiverConfirmed);
  const studentsBlocked = missingName || missingWaiver;
  const blocked = studentsBlocked || !quoteReady;
  const hintSeason = !seasonsReady
    ? undefined
    : outsideSeason
      ? nearestSeason(lessonDate, knownSeasons)
      : !lessonDate
        ? (seasons.data?.find((x) => x.isCurrent) ?? season ?? undefined)
        : undefined;
  const dateHint =
    hintSeason &&
    (outsideSeason ? s.outsideSeason : s.chooseLessonDate)
      .replace('{key}', hintSeason.key)
      .replace('{start}', formatDay(hintSeason.startsOn, locale))
      .replace('{end}', formatDay(hintSeason.endsOn, locale));

  function updateRow(id: number, patch: Partial<StudentRow>) {
    setTouched(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function body() {
    return {
      lessonDate,
      durationHours: hours,
      ...(location && location !== OTHER && { locationId: location }),
      ...(location === OTHER &&
        locationOther.trim() && { locationOther: locationOther.trim() }),
      students: rows.map((r) => ({
        name: r.name.trim(),
        waiverConfirmed: r.waiverConfirmed,
      })),
      idempotencyKey: idempotencyKey.current,
    };
  }

  function registered(record: InsuranceRecord) {
    onToast(
      (record.amountCents > 0 ? s.registeredToast : s.registeredFreeToast)
        .replace('{recordNo}', record.recordNo)
        .replace('{amount}', dollars(record.amountCents)),
    );
    idempotencyKey.current = crypto.randomUUID();
    setRows([emptyRow()]);
    setTouched(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (blocked || register.isPending) return;
    register.mutate(body(), { onSuccess: registered });
  }

  const submitError = register.isError
    ? errorCodeOf(register.error) === 'waiver_unconfirmed'
      ? s.waiverRequired
      : errorCodeOf(register.error) === 'no_season'
        ? s.noSeason
        : register.error instanceof ApiError && register.error.status === 403
          ? s.lockedSubmit
          : errorText(register.error, t.errors.generic)
    : null;

  const hoursText = (h: number) =>
    (h === 1 ? s.hoursOne : s.hoursMany).replace('{n}', String(h));
  const studentsText = (n: number) =>
    (n === 1 ? s.studentsOne : s.studentsMany).replace('{n}', String(n));
  const label = 'text-sm font-medium text-navy';

  return (
    <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <div ref={cardRef} className="flex scroll-mt-6 items-start gap-3">
        <span
          aria-hidden
          className="grid h-8 w-8 flex-none place-items-center rounded-md bg-navy text-sm font-semibold text-white"
        >
          1
        </span>
        <div>
          <h2 id={headingId} className="text-xl">
            {s.formTitle}
          </h2>
          <p className="text-sm text-slate">{s.formIntro}</p>
        </div>
      </div>
      <form
        aria-labelledby={headingId}
        className="flex flex-col gap-5"
        onSubmit={onSubmit}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${headingId}-date`} className={label}>
              {s.lessonDate}
            </label>
            <Input
              id={`${headingId}-date`}
              type="date"
              value={lessonDate}
              aria-invalid={outsideSeason}
              aria-describedby={dateHint ? `${headingId}-date-hint` : undefined}
              onChange={(e) => setDateInput(e.target.value)}
            />
            {dateHint && (
              <p
                id={`${headingId}-date-hint`}
                data-testid="date-hint"
                className={cn(
                  'text-xs',
                  outsideSeason
                    ? 'font-medium text-status-rejected'
                    : 'text-slate',
                )}
              >
                {dateHint}
              </p>
            )}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={cn(label, 'mb-1.5')}>{s.duration}</legend>
            <div className="grid grid-cols-2 gap-2">
              {([1, 2] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={hours === h}
                  onClick={() => setHours(h)}
                  className={cn(
                    'h-11 rounded-md border text-sm font-medium transition-colors',
                    hours === h
                      ? 'border-navy bg-navy-tint text-navy shadow-[inset_0_0_0_1px_var(--navy)]'
                      : 'border-grey bg-surface text-ink hover:bg-sunken',
                  )}
                >
                  {hoursText(h)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${headingId}-location`} className={label}>
            {s.skiArea}{' '}
            <span className="font-normal text-slate">{s.optional}</span>
          </label>
          <Select
            id={`${headingId}-location`}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">{s.skiAreaPlaceholder}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {localizeField(l.name, l.nameZh ?? null, locale) || l.name}
              </option>
            ))}
            <option value={OTHER}>{s.skiAreaOther}</option>
          </Select>
          {location === OTHER && (
            <Input
              aria-label={s.skiAreaOtherLabel}
              placeholder={s.skiAreaOtherLabel}
              maxLength={200}
              value={locationOther}
              onChange={(e) => setLocationOther(e.target.value)}
            />
          )}
        </div>
        <section
          aria-labelledby={`${headingId}-students`}
          className="flex flex-col gap-3 border-t border-grey/60 pt-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h3
              id={`${headingId}-students`}
              className="text-base font-semibold text-navy"
            >
              {s.students}
            </h3>
            <button
              type="button"
              disabled={rows.length >= MAX_STUDENTS}
              onClick={() => {
                setTouched(true);
                setRows((prev) => [...prev, emptyRow()]);
              }}
              className="text-sm font-semibold text-red hover:text-red-press disabled:cursor-not-allowed disabled:opacity-50"
            >
              {s.addStudent}
            </button>
          </div>
          <ol className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const n = i + 1;
              const nameMissing = touched && !row.name.trim();
              return (
                <li
                  key={row.id}
                  data-testid="student-row"
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sunken p-2.5 sm:flex-nowrap',
                    nameMissing &&
                      'shadow-[inset_3px_0_0_var(--status-rejected)]',
                  )}
                >
                  <span
                    aria-hidden
                    className="grid h-6 w-6 flex-none place-items-center rounded-full border border-grey bg-surface text-xs font-semibold text-navy"
                  >
                    {n}
                  </span>
                  <Input
                    ref={i === 0 ? firstNameRef : undefined}
                    aria-label={s.studentName.replace('{n}', String(n))}
                    aria-invalid={nameMissing}
                    placeholder={s.studentNamePlaceholder}
                    maxLength={200}
                    value={row.name}
                    onChange={(e) =>
                      updateRow(row.id, { name: e.target.value })
                    }
                    onBlur={() => setTouched(true)}
                    className="h-10 min-w-0 flex-1 basis-40"
                  />
                  <span className="ml-auto flex items-center gap-2 sm:ml-0">
                    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--navy)]"
                        checked={row.waiverConfirmed}
                        aria-label={s.waiverFor.replace('{n}', String(n))}
                        onChange={(e) =>
                          updateRow(row.id, {
                            waiverConfirmed: e.target.checked,
                          })
                        }
                      />
                      <span aria-hidden>{s.waiverSigned}</span>
                    </label>
                    <button
                      type="button"
                      aria-label={s.removeStudent.replace('{n}', String(n))}
                      disabled={rows.length === 1}
                      onClick={() => {
                        setTouched(true);
                        setRows((prev) => prev.filter((r) => r.id !== row.id));
                      }}
                      className="grid h-9 w-9 place-items-center rounded-md text-slate hover:bg-surface hover:text-status-rejected disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate"
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          <WaiverLinks onToast={onToast} />
        </section>
        <div className="flex flex-col gap-3 border-t border-grey/60 pt-5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0 text-sm">
              {covered ? (
                <p className="font-semibold text-navy">
                  {dateCoverage === 'season_pass'
                    ? s.coveredSeasonPass
                    : s.coveredCapped}
                </p>
              ) : (
                <>
                  <p
                    data-testid="price-breakdown"
                    className="font-semibold text-navy"
                  >
                    {s.breakdown
                      .replace('{hours}', hoursText(hours))
                      .replace(
                        '{students}',
                        studentsText(Math.min(count, BILLED_STUDENTS_MAX)),
                      )}
                  </p>
                  {crossesCap && (
                    <p
                      data-testid="cap-breakdown"
                      className="text-xs font-semibold text-status-pending"
                    >
                      {s.capBreakdown
                        .replace('{list}', dollars(list))
                        .replace('{amount}', dollars(amount))}
                    </p>
                  )}
                  <p className="text-xs text-slate">
                    {count > BILLED_STUDENTS_MAX ? s.overFourNote : s.rateNote}
                  </p>
                </>
              )}
            </div>
            <div className="flex-none text-right">
              <p className="text-xs text-slate">{s.amountLabel}</p>
              <p
                data-testid="price-amount"
                className="text-3xl font-bold tabular-nums text-navy"
              >
                {quoteReady ? dollars(amount) : '—'}
              </p>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={blocked}
            loading={register.isPending}
          >
            {!quoteReady
              ? s.submit
              : covered
                ? s.submitFree
                : s.submitDue.replace('{amount}', dollars(amount))}
          </Button>
          {studentsBlocked && (
            <p
              role="note"
              className="text-center text-sm font-medium text-status-rejected"
            >
              {s.waiverRequired}
            </p>
          )}
          {seasonInsurance.isError && (
            <Banner tone="error">
              {errorText(seasonInsurance.error, t.errors.generic)}
            </Banner>
          )}
          {submitError && <Banner tone="error">{submitError}</Banner>}
          <p className="text-center text-xs text-slate">{s.ruleNote}</p>
        </div>
      </form>
    </Card>
  );
});

function WaiverLinks({ onToast }: { onToast: (message: string) => void }) {
  const t = useT();
  const s = t.insurance;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      onToast(s.copied);
    } catch {
      onToast(s.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-[color-mix(in_srgb,var(--status-approved)_10%,transparent)] px-3 py-2.5 text-sm text-ink">
      <p>{s.waiverHelp}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void copy(WAIVER_URL_ZH)}
        >
          {s.copyWaiverZh}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void copy(WAIVER_URL_EN)}
        >
          {s.copyWaiverEn}
        </Button>
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
