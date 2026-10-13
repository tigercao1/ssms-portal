import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Banner, Button, Field, Input, Select, Textarea } from '@/components';
import type { AdminClass } from '@/lib/types';
import { useAdminInstructors } from '../api';
import { useLessonTypes } from '../lessonsApi';
import {
  useCancelBooking,
  useSetClassStatus,
  useUpdateBooking,
} from './bookingApi';
import {
  BookingErrorBanner,
  CustomerPicker,
  Dialog,
  type PickedCustomer,
} from './BookingParts';
import {
  formatSchoolDateTime,
  schoolInstant,
  schoolParts,
} from './bookingRules';
import type { BookableStatus, UpdateBookingInput } from './types';

type Open = 'menu' | 'move' | 'cancel' | null;

export function ClassActions({ item }: { item: AdminClass }) {
  const t = useT();
  const [open, setOpen] = useState<Open>(null);
  const status = useSetClassStatus();
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelled = item.status === 'cancelled';

  useEffect(() => {
    if (open !== 'menu') return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function mark(next: BookableStatus) {
    setOpen(null);
    status.mutate({ id: item.id, status: next });
  }

  const items: { label: string; run: () => void }[] = cancelled
    ? [{ label: t.booking.actionRestore, run: () => mark('scheduled') }]
    : [
        { label: t.booking.actionMove, run: () => setOpen('move') },
        ...(item.status !== 'completed'
          ? [{ label: t.booking.actionCompleted, run: () => mark('completed') }]
          : []),
        ...(item.status !== 'no_show'
          ? [{ label: t.booking.actionNoShow, run: () => mark('no_show') }]
          : []),
        ...(item.status !== 'scheduled'
          ? [{ label: t.booking.actionScheduled, run: () => mark('scheduled') }]
          : []),
        { label: t.booking.actionCancel, run: () => setOpen('cancel') },
      ];

  return (
    <div className="flex flex-col items-end gap-2">
      <div ref={menuRef} className="relative">
        <Button
          variant="ghost"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open === 'menu'}
          loading={status.isPending}
          onClick={() => setOpen(open === 'menu' ? null : 'menu')}
        >
          {t.booking.actions}
        </Button>
        {open === 'menu' && (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 flex min-w-[12rem] flex-col rounded-md border border-grey/60 bg-surface py-1 shadow-pop"
          >
            {items.map((entry) => (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                className="px-4 py-2 text-left text-sm text-ink hover:bg-navy-tint"
                onClick={entry.run}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {status.isError && <BookingErrorBanner error={status.error} />}
      {open === 'move' && (
        <MoveDialog item={item} onClose={() => setOpen(null)} />
      )}
      {open === 'cancel' && (
        <CancelDialog item={item} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function CancelDialog({
  item,
  onClose,
}: {
  item: AdminClass;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const cancel = useCancelBooking();
  return (
    <Dialog title={t.booking.cancelTitle} onClose={onClose}>
      <p className="text-sm text-ink">
        {t.booking.cancelBody.replace(
          '{when}',
          formatSchoolDateTime(item.startsAt, locale),
        )}
      </p>
      {item.googleCalendarId && (
        <p className="text-sm text-slate">{t.booking.cancelGoogle}</p>
      )}
      {cancel.isError && <BookingErrorBanner error={cancel.error} />}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="danger"
          loading={cancel.isPending}
          onClick={() => cancel.mutate(item.id, { onSuccess: onClose })}
        >
          {t.booking.cancelConfirm}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t.booking.keep}
        </Button>
      </div>
    </Dialog>
  );
}

function MoveDialog({
  item,
  onClose,
}: {
  item: AdminClass;
  onClose: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const update = useUpdateBooking();
  const instructors = useAdminInstructors({});
  const lessonTypes = useLessonTypes();
  const start = schoolParts(item.startsAt);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [instructorId, setInstructorId] = useState(item.instructorId);
  const [lessonTypeId, setLessonTypeId] = useState(item.lessonTypeId ?? '');
  const [notes, setNotes] = useState(item.notes ?? '');
  const [customers, setCustomers] = useState<PickedCustomer[]>(
    item.participants.map((p) => ({
      id: p.customerId,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
    })),
  );

  const instructorOptions = (instructors.data ?? [])
    .map((i) => ({
      id: i.id,
      name: localizeField(i.displayNameEn, i.displayNameZh, locale) || i.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!instructorOptions.some((o) => o.id === item.instructorId)) {
    instructorOptions.unshift({
      id: item.instructorId,
      name:
        localizeField(item.instructorName, item.instructorNameZh, locale) ||
        '—',
    });
  }

  const startsAt = date && time ? schoolInstant(date, time) : null;
  const originalIds = item.participants.map((p) => p.customerId).join(',');
  const nextIds = customers.map((c) => c.id).join(',');
  const body: UpdateBookingInput = {
    ...(startsAt &&
      Date.parse(startsAt) !== Date.parse(item.startsAt) && { startsAt }),
    ...(instructorId !== item.instructorId && { instructorId }),
    ...(lessonTypeId && lessonTypeId !== item.lessonTypeId && { lessonTypeId }),
    ...(nextIds !== originalIds &&
      customers.length > 0 && { customerIds: customers.map((c) => c.id) }),
    ...(notes.trim() !== (item.notes ?? '') && { notes: notes.trim() || null }),
  };
  const changed = Object.keys(body).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!changed || update.isPending) return;
    update.mutate({ id: item.id, ...body }, { onSuccess: onClose });
  }

  return (
    <Dialog title={t.booking.moveTitle} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.booking.date}>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
          <Field label={t.booking.startTime}>
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
                {instructorOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t.booking.lessonType}>
            {(p) => (
              <Select
                {...p}
                value={lessonTypeId}
                onChange={(e) => setLessonTypeId(e.target.value)}
              >
                {!item.lessonTypeId && (
                  <option value="">{t.lessons.noLessonType}</option>
                )}
                {(lessonTypes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {localizeField(l.nameEn, l.nameZh, locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <CustomerPicker selected={customers} onChange={setCustomers} />
        <Field label={t.booking.notes}>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}
        </Field>
        {item.googleCalendarId && (
          <p className="text-sm text-slate">{t.booking.moveGoogle}</p>
        )}
        {customers.length === 0 && (
          <Banner tone="pending">{t.booking.needCustomer}</Banner>
        )}
        {update.isError && <BookingErrorBanner error={update.error} />}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={update.isPending} disabled={!changed}>
            {t.booking.saveChanges}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
