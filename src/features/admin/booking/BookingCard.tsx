import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Locale, Messages } from '@/i18n/core/types';
import {
  Banner,
  Button,
  Card,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from '@/components';
import { cn } from '@/lib/cn';
import type { AdminClass } from '@/lib/types';
import { useTeachingLocations } from '@/features/reference/api';
import { useAdminInstructors } from '../api';
import { errorText } from '../LessonTypesPage';
import { useLessonTypes } from '../lessonsApi';
import { SlotPicker } from './SlotPicker';
import { fetchLastClass, useAvailability } from './bookingApi';
import { CustomerPicker, pickedName } from './BookingParts';
import {
  addMinutes,
  formatSchoolDateTime,
  formatSchoolTime,
  nextWeekday,
  schoolInstant,
  schoolParts,
} from './bookingRules';
import type { CardGap, CardMode, DraftCard, DraftError } from './bookingDrafts';
import type { BookableStatus } from './types';

type Patch = Partial<Omit<DraftCard, 'id'>>;

const ERROR_KEYS = {
  INSTRUCTOR_BUSY: 'errInstructorBusy',
  CUSTOMER_NOT_FOUND: 'errCustomerNotFound',
  LESSON_TYPE_INACTIVE: 'errLessonTypeInactive',
  FUTURE_STATUS: 'errFutureStatus',
  BATCH_ROW_CONFLICT: 'errBatchRowConflict',
  CALENDAR_UNAVAILABLE: 'errCalendarUnavailable',
  GOOGLE_NOT_CONNECTED: 'errGoogleNotConnected',
  GOOGLE_NOT_CONFIGURED: 'errGoogleNotConfigured',
  GOOGLE_WRITE_FAILED: 'errGoogleWriteFailed',
} as const satisfies Record<string, keyof Messages['booking']>;

const GAP_KEYS = {
  customer: 'gapCustomer',
  lessonType: 'gapLessonType',
  instructor: 'gapInstructor',
  startTime: 'gapStartTime',
  pastTime: 'gapPastTime',
} as const satisfies Record<CardGap, keyof Messages['booking']>;

export function cardErrorText(t: Messages, error: DraftError): string {
  return Object.hasOwn(ERROR_KEYS, error.code)
    ? t.booking[ERROR_KEYS[error.code as keyof typeof ERROR_KEYS]]
    : error.message;
}

export function gapsText(t: Messages, gaps: CardGap[]): string {
  return gaps.map((g) => t.booking[GAP_KEYS[g]]).join(', ');
}

function summaryParts(card: DraftCard, t: Messages, locale: Locale) {
  const parts: string[] = [];
  if (card.lessonTypeId)
    parts.push(
      localizeField(card.lessonTypeNameEn, card.lessonTypeNameZh, locale) ||
        card.lessonTypeNameEn,
    );
  if (card.startsAt) {
    const end = card.durationMin
      ? `–${formatSchoolTime(addMinutes(card.startsAt, card.durationMin), locale)}`
      : '';
    parts.push(`${formatSchoolDateTime(card.startsAt, locale)}${end}`);
  }
  if (card.instructorId)
    parts.push(
      localizeField(card.instructorNameEn, card.instructorNameZh, locale) ||
        card.instructorNameEn,
    );
  if (card.status === 'completed') parts.push(t.lessons.classCompleted);
  if (card.status === 'no_show') parts.push(t.lessons.classNoShow);
  return parts;
}

type BadgeTone = 'ready' | 'incomplete' | 'failed' | 'booked';

function CardBadge({ tone }: { tone: BadgeTone }) {
  const t = useT();
  const label = {
    ready: t.booking.cardReady,
    incomplete: t.booking.cardIncomplete,
    failed: t.booking.cardFailed,
    booked: t.booking.cardBooked,
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium',
        tone === 'ready' && 'bg-navy-tint text-navy',
        tone === 'incomplete' && 'bg-sunken text-slate',
        tone === 'failed' && 'bg-sunken text-status-rejected',
        tone === 'booked' && 'bg-sunken text-status-approved',
      )}
    >
      {label}
    </span>
  );
}

function cardTone(card: DraftCard, gaps: CardGap[]): BadgeTone {
  if (card.error) return 'failed';
  return gaps.length > 0 ? 'incomplete' : 'ready';
}

export function BookedCardLine({
  card,
  classes,
}: {
  card: DraftCard;
  classes: AdminClass[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const names = card.customers.map(pickedName).join(', ');
  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-lg border border-grey/60 bg-surface px-4 py-3 text-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p data-private className="min-w-0 break-words font-medium text-ink">
          {names}
        </p>
        <CardBadge tone="booked" />
      </div>
      <p className="break-words text-ink">
        {summaryParts(card, t, locale).join(' · ')}
      </p>
      {classes.length > 1 && (
        <p className="text-slate">
          {t.booking.bookedBody
            .replace('{count}', String(classes.length))
            .replace(
              '{when}',
              classes[0]
                ? formatSchoolDateTime(classes[0].startsAt, locale)
                : '',
            )}
        </p>
      )}
    </li>
  );
}

export function CardSummary({
  card,
  number,
  gaps,
  disabled,
  focusEdit,
  onEdit,
  onRemove,
}: {
  card: DraftCard;
  number: number;
  gaps: CardGap[];
  disabled: boolean;
  focusEdit: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const headingId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const names = card.customers.map(pickedName).join(', ');
  const title = t.booking.cardTitle.replace('{n}', String(number));

  useEffect(() => {
    if (focusEdit)
      sectionRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-expanded]')
        ?.focus();
  }, [focusEdit]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-2 rounded-lg border border-grey/60 bg-surface px-4 py-3 shadow-card"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 id={headingId} className="text-base">
          {title}
        </h2>
        <CardBadge tone={cardTone(card, gaps)} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <p data-private className="break-words font-medium text-ink">
          {names || t.booking.noCustomerYet}
        </p>
        <p className="break-words text-ink">
          {summaryParts(card, t, locale).join(' · ')}
        </p>
        {card.notes.trim() && (
          <p data-private className="break-words text-slate">
            {t.booking.cardNotes.replace('{notes}', card.notes.trim())}
          </p>
        )}
        {gaps.length > 0 && (
          <p className="break-words text-slate">
            {t.booking.cardMissing.replace('{items}', gapsText(t, gaps))}
          </p>
        )}
        {card.error && (
          <p className="break-words text-status-rejected">
            {cardErrorText(t, card.error)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          aria-expanded={false}
          aria-label={t.booking.editCard.replace('{n}', String(number))}
          disabled={disabled}
          onClick={onEdit}
        >
          {t.booking.edit}
        </Button>
        <Button
          variant="ghost"
          aria-label={t.booking.removeCard.replace('{n}', String(number))}
          disabled={disabled}
          onClick={onRemove}
        >
          {t.booking.remove}
        </Button>
      </div>
    </section>
  );
}

export function CardEditor({
  card,
  number,
  gaps,
  today,
  focusFirst,
  onChange,
  onFold,
  onRemove,
}: {
  card: DraftCard;
  number: number;
  gaps: CardGap[];
  today: string;
  focusFirst: number;
  onChange: (patch: Patch) => void;
  onFold: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const headingId = useId();
  const bodyId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const lessonTypes = useLessonTypes();
  const locations = useTeachingLocations();
  const activeTypes = (lessonTypes.data ?? []).filter((l) => l.active);
  const lessonType = activeTypes.find((l) => l.id === card.lessonTypeId);
  const title = t.booking.cardTitle.replace('{n}', String(number));
  const [preferred, setPreferred] = useState<Preferred | null>(null);
  const clearPreferred = useCallback(() => setPreferred(null), []);

  useEffect(() => {
    if (focusFirst) bodyRef.current?.querySelector('input')?.focus();
  }, [focusFirst]);

  function chooseMode(mode: CardMode) {
    if (mode === card.mode) return;
    const cleared = {
      mode,
      instructorId: '',
      instructorNameEn: '',
      instructorNameZh: null,
      startsAt: '',
      time: '',
    };
    if (mode === 'past')
      onChange({
        ...cleared,
        status: 'completed',
        addToCalendar: false,
        date: card.date > today ? today : card.date,
      });
    else
      onChange({
        ...cleared,
        status: undefined,
        addToCalendar: undefined,
        date: card.date < today ? today : card.date,
      });
  }

  function chooseLessonType(id: string) {
    const next = activeTypes.find((l) => l.id === id);
    onChange({
      lessonTypeId: id,
      lessonTypeNameEn: next?.nameEn ?? '',
      lessonTypeNameZh: next?.nameZh ?? null,
      durationMin: next?.durationMin ?? 0,
      ...(card.mode === 'grid' && { startsAt: '' }),
    });
  }

  return (
    <Card className="flex min-w-0 flex-col gap-5 p-4 sm:p-6">
      <section aria-labelledby={headingId} className="flex flex-col gap-5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 id={headingId} className="text-lg">
              {title}
            </h2>
            <CardBadge tone={cardTone(card, gaps)} />
          </div>
          <Button
            variant="ghost"
            aria-expanded
            aria-controls={bodyId}
            aria-label={t.booking.foldCard.replace('{n}', String(number))}
            onClick={onFold}
          >
            {t.booking.foldCardShort}
          </Button>
        </div>
        <div ref={bodyRef} id={bodyId} className="flex min-w-0 flex-col gap-5">
          {card.error && (
            <Banner tone="error">{cardErrorText(t, card.error)}</Banner>
          )}
          <CustomerFields
            card={card}
            today={today}
            onChange={onChange}
            onPreferred={setPreferred}
          />
          <div
            role="group"
            aria-label={t.booking.modeLabel}
            className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-navy sm:inline-grid sm:w-fit"
          >
            {(['grid', 'past'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={card.mode === m}
                onClick={() => chooseMode(m)}
                className={cn(
                  'min-h-11 px-4 py-1 text-sm leading-tight transition-colors',
                  m === 'past' && 'border-l border-navy',
                  card.mode === m
                    ? 'bg-navy text-white'
                    : 'text-navy hover:bg-navy-tint',
                )}
              >
                {m === 'grid' ? t.booking.modeGrid : t.booking.modePast}
              </button>
            ))}
          </div>
          {card.mode === 'past' && (
            <p className="-mt-3 text-sm text-slate">{t.booking.pastBody}</p>
          )}
          <Field label={t.booking.lessonType}>
            {(p) => (
              <Select
                {...p}
                value={card.lessonTypeId}
                onChange={(e) => chooseLessonType(e.target.value)}
              >
                <option value="">{t.booking.chooseLessonType}</option>
                {activeTypes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {localizeField(l.nameEn, l.nameZh, locale)} ·{' '}
                    {t.lessons.minutes.replace('{n}', String(l.durationMin))}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {card.mode === 'grid' ? (
            <GridFields
              card={card}
              today={today}
              hasLessonType={!!lessonType}
              preferred={preferred}
              onPreferredDone={clearPreferred}
              onChange={onChange}
            />
          ) : (
            <PastFields card={card} today={today} onChange={onChange} />
          )}
          <Field label={t.booking.location}>
            {(p) => (
              <Select
                {...p}
                value={card.locationId}
                onChange={(e) => onChange({ locationId: e.target.value })}
              >
                <option value="">{t.booking.noLocation}</option>
                {(locations.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.booking.notes}>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={card.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
              />
            )}
          </Field>
          {gaps.length > 0 && (
            <p className="text-sm text-slate">
              {t.booking.cardMissing.replace('{items}', gapsText(t, gaps))}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              aria-label={t.booking.removeCard.replace('{n}', String(number))}
              onClick={onRemove}
            >
              {t.booking.remove}
            </Button>
          </div>
        </div>
      </section>
    </Card>
  );
}

interface Preferred {
  instructorId: string;
  time: string;
}

function CustomerFields({
  card,
  today,
  onChange,
  onPreferred,
}: {
  card: DraftCard;
  today: string;
  onChange: (patch: Patch) => void;
  onPreferred: (preferred: Preferred) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const lessonTypes = useLessonTypes();
  const activeTypes = (lessonTypes.data ?? []).filter((l) => l.active);
  const last = useMutation({
    mutationFn: (customerId: string) => fetchLastClass(customerId),
    onSuccess: ({ last: previous }) => {
      if (!previous) return;
      const type = activeTypes.find((l) => l.id === previous.lessonTypeId);
      onChange({
        mode: 'grid',
        ...(type && {
          lessonTypeId: type.id,
          lessonTypeNameEn: type.nameEn,
          lessonTypeNameZh: type.nameZh,
          durationMin: type.durationMin,
        }),
        date: nextWeekday(today, previous.weekday),
        instructorId: '',
        instructorNameEn: '',
        instructorNameZh: null,
        startsAt: '',
        time: '',
        status: undefined,
        addToCalendar: undefined,
      });
      onPreferred({ instructorId: previous.instructorId, time: previous.time });
    },
  });
  const lastResult = last.data;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CustomerPicker
        selected={card.customers}
        onChange={(next) => {
          onChange({ customers: next });
          last.reset();
        }}
      />
      {card.customers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            loading={last.isPending}
            onClick={() =>
              card.customers[0] && last.mutate(card.customers[0].id)
            }
          >
            {t.booking.sameAsLast}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onChange({ customers: [] });
              last.reset();
            }}
          >
            {t.booking.clearCustomers}
          </Button>
          {lastResult && !lastResult.last && (
            <span className="text-sm text-slate">{t.booking.noHistory}</span>
          )}
          {lastResult?.last && (
            <span data-private className="text-sm text-slate">
              {t.booking.lastWas
                .replace(
                  '{lesson}',
                  localizeField(
                    lastResult.last.lessonTypeNameEn,
                    lastResult.last.lessonTypeNameZh,
                    locale,
                  ) || t.lessons.noLessonType,
                )
                .replace(
                  '{instructor}',
                  localizeField(
                    lastResult.last.instructorName,
                    lastResult.last.instructorNameZh,
                    locale,
                  ) || '—',
                )
                .replace(
                  '{when}',
                  formatSchoolDateTime(lastResult.last.startsAt, locale),
                )}
            </span>
          )}
          {last.isError && (
            <span className="text-sm text-status-rejected">
              {errorText(last.error, t.errors.generic)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function GridFields({
  card,
  today,
  hasLessonType,
  preferred,
  onPreferredDone,
  onChange,
}: {
  card: DraftCard;
  today: string;
  hasLessonType: boolean;
  preferred: Preferred | null;
  onPreferredDone: () => void;
  onChange: (patch: Patch) => void;
}) {
  const t = useT();
  const availability = useAvailability(
    hasLessonType && card.date
      ? { date: card.date, lessonTypeId: card.lessonTypeId }
      : null,
  );
  useEffect(() => {
    if (!preferred || !availability.data) return;
    const row = availability.data.instructors.find(
      (i) => i.instructorId === preferred.instructorId,
    );
    const match = row?.freeSlots.find(
      (s) => schoolParts(s).time === preferred.time,
    );
    onPreferredDone();
    if (!row || row.freeSlots.length === 0) return;
    onChange({
      instructorId: row.instructorId,
      instructorNameEn: row.displayNameEn,
      instructorNameZh: row.displayNameZh,
      startsAt: match ?? '',
    });
  }, [preferred, availability.data, onChange, onPreferredDone]);

  function namesOf(id: string) {
    const row = availability.data?.instructors.find(
      (i) => i.instructorId === id,
    );
    return {
      instructorNameEn: row?.displayNameEn ?? '',
      instructorNameZh: row?.displayNameZh ?? null,
    };
  }

  return (
    <>
      <Field label={t.booking.date}>
        {(p) => (
          <Input
            {...p}
            type="date"
            min={today}
            value={card.date}
            onChange={(e) => onChange({ date: e.target.value, startsAt: '' })}
          />
        )}
      </Field>
      {!hasLessonType ? (
        <p className="text-sm text-slate">{t.booking.pickLessonFirst}</p>
      ) : availability.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : availability.isError ? (
        <Banner tone="error">
          {errorText(availability.error, t.errors.generic)}
        </Banner>
      ) : availability.data ? (
        <SlotPicker
          availability={availability.data}
          instructorId={card.instructorId || null}
          onInstructor={(id) => {
            onChange({
              instructorId: id ?? '',
              ...(id
                ? namesOf(id)
                : { instructorNameEn: '', instructorNameZh: null }),
              startsAt: '',
            });
          }}
          selected={
            card.startsAt && card.instructorId
              ? { instructorId: card.instructorId, startsAt: card.startsAt }
              : null
          }
          onSelect={(choice) =>
            onChange(
              choice
                ? {
                    instructorId: choice.instructorId,
                    ...namesOf(choice.instructorId),
                    startsAt: choice.startsAt,
                  }
                : { startsAt: '' },
            )
          }
        />
      ) : null}
    </>
  );
}

function PastFields({
  card,
  today,
  onChange,
}: {
  card: DraftCard;
  today: string;
  onChange: (patch: Patch) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const options = (instructors.data ?? [])
    .map((i) => ({
      id: i.id,
      nameEn: i.displayNameEn || i.email,
      nameZh: i.displayNameZh,
      name: localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const inFuture =
    card.startsAt !== '' && Date.parse(card.startsAt) >= Date.now();

  function when(date: string, time: string) {
    return {
      date,
      time,
      startsAt: date && time ? schoolInstant(date, time) : '',
    };
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t.booking.date}>
        {(p) => (
          <Input
            {...p}
            type="date"
            max={today}
            value={card.date}
            onChange={(e) => onChange(when(e.target.value, card.time))}
          />
        )}
      </Field>
      <Field label={t.booking.instructor}>
        {(p) => (
          <Select
            {...p}
            value={card.instructorId}
            onChange={(e) => {
              const o = options.find((x) => x.id === e.target.value);
              onChange({
                instructorId: e.target.value,
                instructorNameEn: o?.nameEn ?? '',
                instructorNameZh: o?.nameZh ?? null,
              });
            }}
          >
            <option value="">{t.booking.chooseInstructor}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label={t.booking.startTime}
        error={inFuture ? t.booking.pastMustBePast : undefined}
      >
        {(p) => (
          <Input
            {...p}
            type="time"
            step={300}
            value={card.time}
            onChange={(e) => onChange(when(card.date, e.target.value))}
          />
        )}
      </Field>
      <Field label={t.booking.status}>
        {(p) => (
          <Select
            {...p}
            value={card.status ?? 'completed'}
            onChange={(e) =>
              onChange({ status: e.target.value as BookableStatus })
            }
          >
            <option value="completed">{t.lessons.classCompleted}</option>
            <option value="no_show">{t.lessons.classNoShow}</option>
            <option value="scheduled">{t.lessons.classScheduled}</option>
          </Select>
        )}
      </Field>
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink sm:col-span-2">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={card.addToCalendar ?? false}
          onChange={(e) => onChange({ addToCalendar: e.target.checked })}
        />
        {t.booking.addToCalendar}
      </label>
    </div>
  );
}
