import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
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
import type { AdminClass, LessonType } from '@/lib/types';
import { useTeachingLocations } from '@/features/reference/api';
import { useAdminInstructors } from '../api';
import { errorText } from '../LessonTypesPage';
import { useLessonTypes } from '../lessonsApi';
import { AvailabilityGrid, type SlotChoice } from './AvailabilityGrid';
import {
  useAvailability,
  useCreateBooking,
  fetchLastClass,
} from './bookingApi';
import {
  BookingErrorBanner,
  CustomerPicker,
  pickedName,
  type PickedCustomer,
} from './BookingParts';
import {
  formatSchoolDateTime,
  nextWeekday,
  schoolInstant,
  schoolParts,
} from './bookingRules';
import { BookingSettingsCard } from './BookingSettingsCard';
import type { BookableStatus, CreateBookingInput } from './types';

type Mode = 'grid' | 'past';

interface Preferred {
  instructorId: string;
  time: string;
}

const REPEAT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function BookLessonPage() {
  const t = useT();
  const { locale } = useLocale();
  const today = schoolParts(Date.now()).date;
  const [customers, setCustomers] = useState<PickedCustomer[]>([]);
  const [lessonTypeId, setLessonTypeId] = useState('');
  const [date, setDate] = useState(today);
  const [mode, setMode] = useState<Mode>('grid');
  const [slot, setSlot] = useState<SlotChoice | null>(null);
  const [preferred, setPreferred] = useState<Preferred | null>(null);
  const [booked, setBooked] = useState<AdminClass[] | null>(null);
  const lessonTypes = useLessonTypes();
  const activeTypes = (lessonTypes.data ?? []).filter((l) => l.active);
  const lessonType = activeTypes.find((l) => l.id === lessonTypeId) ?? null;
  const availability = useAvailability(
    mode === 'grid' && lessonTypeId && date ? { date, lessonTypeId } : null,
  );
  const last = useMutation({
    mutationFn: (customerId: string) => fetchLastClass(customerId),
    onSuccess: ({ last: previous }) => {
      if (!previous) return;
      if (
        previous.lessonTypeId &&
        activeTypes.some((l) => l.id === previous.lessonTypeId)
      ) {
        setLessonTypeId(previous.lessonTypeId);
      }
      setMode('grid');
      setSlot(null);
      setDate(nextWeekday(today, previous.weekday));
      setPreferred({
        instructorId: previous.instructorId,
        time: previous.time,
      });
    },
  });

  useEffect(() => {
    if (!preferred || !availability.data) return;
    const row = availability.data.instructors.find(
      (i) => i.instructorId === preferred.instructorId,
    );
    const match = row?.freeSlots.find(
      (s) => schoolParts(s).time === preferred.time,
    );
    if (row && match)
      setSlot({ instructorId: row.instructorId, startsAt: match });
    setPreferred(null);
  }, [preferred, availability.data]);

  const chosenRow = slot
    ? availability.data?.instructors.find(
        (i) => i.instructorId === slot.instructorId,
      )
    : undefined;
  const lastResult = last.data;

  function reset() {
    setSlot(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.booking.title}</h1>
        <p className="max-w-3xl text-slate">{t.booking.intro}</p>
      </div>

      {booked && (
        <Banner tone="approved" title={t.booking.bookedTitle}>
          <p>
            {t.booking.bookedBody
              .replace('{count}', String(booked.length))
              .replace(
                '{when}',
                booked[0]
                  ? formatSchoolDateTime(booked[0].startsAt, locale)
                  : '',
              )}{' '}
            <Link to="/admin/classes" className="underline">
              {t.booking.viewClasses}
            </Link>
          </p>
        </Banner>
      )}

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.booking.customerStep}</h2>
        <CustomerPicker
          selected={customers}
          onChange={(next) => {
            setCustomers(next);
            last.reset();
          }}
        />
        {customers[0] && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              loading={last.isPending}
              onClick={() => customers[0] && last.mutate(customers[0].id)}
            >
              {t.booking.sameAsLast}
            </Button>
            {lastResult && !lastResult.last && (
              <span className="text-sm text-slate">{t.booking.noHistory}</span>
            )}
            {lastResult?.last && (
              <span className="text-sm text-slate">
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
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg">{t.booking.lessonStep}</h2>
        <div
          role="group"
          aria-label={t.booking.modeLabel}
          className="inline-flex w-fit rounded-md border border-navy"
        >
          {(['grid', 'past'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                reset();
              }}
              className={
                mode === m
                  ? 'bg-navy px-4 py-2 text-sm text-white'
                  : 'px-4 py-2 text-sm text-navy hover:bg-navy-tint'
              }
            >
              {m === 'grid' ? t.booking.modeGrid : t.booking.modePast}
            </button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.booking.lessonType}>
            {(p) => (
              <Select
                {...p}
                value={lessonTypeId}
                onChange={(e) => {
                  setLessonTypeId(e.target.value);
                  reset();
                }}
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
          {mode === 'grid' && (
            <Field label={t.booking.date}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    reset();
                  }}
                />
              )}
            </Field>
          )}
        </div>

        {mode === 'grid' &&
          (!lessonType ? (
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
            <AvailabilityGrid
              availability={availability.data}
              selected={slot}
              onSelect={(choice) => {
                setSlot(choice);
                setBooked(null);
              }}
            />
          ) : null)}
      </Card>

      {mode === 'grid' && slot && lessonType && (
        <ConfirmBooking
          key={`${slot.instructorId}-${slot.startsAt}`}
          customers={customers}
          lessonType={lessonType}
          instructorId={slot.instructorId}
          instructorName={
            chosenRow
              ? localizeField(
                  chosenRow.displayNameEn,
                  chosenRow.displayNameZh,
                  locale,
                ) || chosenRow.displayNameEn
              : '—'
          }
          startsAt={slot.startsAt}
          past={false}
          onDone={(classes) => {
            setBooked(classes);
            setSlot(null);
          }}
          onCancel={() => setSlot(null)}
        />
      )}

      {mode === 'past' && (
        <PastLessonForm
          customers={customers}
          lessonType={lessonType}
          today={today}
          onDone={setBooked}
        />
      )}

      <BookingSettingsCard />
    </div>
  );
}

function ConfirmBooking({
  customers,
  lessonType,
  instructorId,
  instructorName,
  startsAt,
  past,
  status,
  addToCalendar,
  onDone,
  onCancel,
}: {
  customers: PickedCustomer[];
  lessonType: LessonType;
  instructorId: string;
  instructorName: string;
  startsAt: string;
  past: boolean;
  status?: BookableStatus;
  addToCalendar?: boolean;
  onDone: (classes: AdminClass[]) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const create = useCreateBooking();
  const locations = useTeachingLocations();
  const [notes, setNotes] = useState('');
  const [locationId, setLocationId] = useState('');
  const [repeat, setRepeat] = useState(1);
  const ready = customers.length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || create.isPending) return;
    const body: CreateBookingInput = {
      instructorId,
      lessonTypeId: lessonType.id,
      startsAt,
      customerIds: customers.map((c) => c.id),
      ...(notes.trim() && { notes: notes.trim() }),
      ...(locationId && { locationId }),
      ...(repeat > 1 && { repeat: { weekly: true as const, count: repeat } }),
      ...(past && { status, addToCalendar }),
    };
    create.mutate(body, { onSuccess: onDone });
  }

  return (
    <Card>
      <form
        onSubmit={submit}
        aria-label={t.booking.confirmTitle}
        className="flex flex-col gap-4"
      >
        <h2 className="text-lg">{t.booking.confirmTitle}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-slate">{t.booking.summaryCustomers}</dt>
          <dd className="text-ink">
            {customers.length > 0
              ? customers.map(pickedName).join(', ')
              : t.booking.noCustomerYet}
          </dd>
          <dt className="text-slate">{t.booking.summaryLesson}</dt>
          <dd className="text-ink">
            {localizeField(lessonType.nameEn, lessonType.nameZh, locale)} ·{' '}
            {t.lessons.minutes.replace('{n}', String(lessonType.durationMin))}
          </dd>
          <dt className="text-slate">{t.booking.summaryInstructor}</dt>
          <dd className="text-ink">{instructorName}</dd>
          <dt className="text-slate">{t.booking.summaryWhen}</dt>
          <dd className="text-ink">
            {formatSchoolDateTime(startsAt, locale)}
            {repeat > 1 &&
              ` · ${t.booking.repeatSummary.replace('{n}', String(repeat))}`}
          </dd>
        </dl>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.booking.location}>
            {(p) => (
              <Select
                {...p}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
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
          {!past && (
            <Field label={t.booking.repeat}>
              {(p) => (
                <Select
                  {...p}
                  value={repeat}
                  onChange={(e) => setRepeat(Number(e.target.value))}
                >
                  <option value={1}>{t.booking.repeatNone}</option>
                  {REPEAT_COUNTS.map((n) => (
                    <option key={n} value={n}>
                      {t.booking.repeatWeekly.replace('{n}', String(n))}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
        </div>
        <Field label={t.booking.notes}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {!ready && <Banner tone="pending">{t.booking.needCustomer}</Banner>}
        {create.isError && <BookingErrorBanner error={create.error} />}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={create.isPending} disabled={!ready}>
            {past ? t.booking.savePast : t.booking.book}
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t.common.cancel}
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function PastLessonForm({
  customers,
  lessonType,
  today,
  onDone,
}: {
  customers: PickedCustomer[];
  lessonType: LessonType | null;
  today: string;
  onDone: (classes: AdminClass[]) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const instructors = useAdminInstructors({});
  const [date, setDate] = useState(today);
  const [time, setTime] = useState('');
  const [instructorId, setInstructorId] = useState('');
  const [status, setStatus] = useState<BookableStatus>('completed');
  const [addToCalendar, setAddToCalendar] = useState(false);
  const startsAt = date && time ? schoolInstant(date, time) : null;
  const inPast = startsAt !== null && Date.parse(startsAt) < Date.now();
  const options = (instructors.data ?? [])
    .map((i) => ({
      id: i.id,
      name: localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const instructor = options.find((o) => o.id === instructorId);

  return (
    <>
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg">{t.booking.pastTitle}</h2>
          <p className="text-sm text-slate">{t.booking.pastBody}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.booking.date}>
            {(p) => (
              <Input
                {...p}
                type="date"
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field
            label={t.booking.startTime}
            error={startsAt && !inPast ? t.booking.pastMustBePast : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            )}
          </Field>
          <Field label={t.booking.instructor}>
            {(p) => (
              <Select
                {...p}
                value={instructorId}
                onChange={(e) => setInstructorId(e.target.value)}
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
          <Field label={t.booking.status}>
            {(p) => (
              <Select
                {...p}
                value={status}
                onChange={(e) => setStatus(e.target.value as BookableStatus)}
              >
                <option value="completed">{t.lessons.classCompleted}</option>
                <option value="no_show">{t.lessons.classNoShow}</option>
                <option value="scheduled">{t.lessons.classScheduled}</option>
              </Select>
            )}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={addToCalendar}
            onChange={(e) => setAddToCalendar(e.target.checked)}
          />
          {t.booking.addToCalendar}
        </label>
        {!lessonType && (
          <p className="text-sm text-slate">{t.booking.pickLessonFirst}</p>
        )}
      </Card>
      {lessonType && instructor && startsAt && inPast && (
        <ConfirmBooking
          key={`${instructor.id}-${startsAt}-${status}-${addToCalendar}`}
          customers={customers}
          lessonType={lessonType}
          instructorId={instructor.id}
          instructorName={instructor.name}
          startsAt={startsAt}
          past
          status={status}
          addToCalendar={addToCalendar}
          onDone={(classes) => {
            onDone(classes);
            setTime('');
          }}
        />
      )}
    </>
  );
}
