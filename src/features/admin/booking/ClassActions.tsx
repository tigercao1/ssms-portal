import { useState, type FormEvent } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import {
  Banner,
  Button,
  Field,
  Input,
  RowActions,
  Select,
  Textarea,
  type ActionsMenuItem,
} from '@/components';
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
  SendEmailsField,
  WarningsBanner,
  pickedName,
  warningLines,
  type PickedCustomer,
} from './BookingParts';
import {
  formatSchoolDateTime,
  isPastStart,
  schoolInstant,
  schoolParts,
} from './bookingRules';
import type {
  BookableStatus,
  BookingWarning,
  UpdateBookingInput,
} from './types';

type Open = 'move' | 'cancel' | null;

function participantsOf(item: AdminClass): PickedCustomer[] {
  return item.participants.map((p) => ({
    id: p.customerId,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email,
    phone: p.phone,
  }));
}

function useWarningText(
  customers: PickedCustomer[],
  instructorName: (id: string) => string | null,
) {
  const t = useT();
  return (warnings: BookingWarning[]) =>
    warningLines(t, warnings, {
      customer: (id) => {
        const c = customers.find((x) => x.id === id);
        return c ? pickedName(c) : null;
      },
      instructor: instructorName,
    });
}

function WarningsResult({
  title,
  lines,
  onClose,
}: {
  title: string;
  lines: string[];
  onClose: () => void;
}) {
  const t = useT();
  return (
    <>
      <WarningsBanner title={title} lines={lines} />
      <div className="flex justify-end">
        <Button onClick={onClose}>{t.booking.done}</Button>
      </div>
    </>
  );
}

export function ClassActions({ item }: { item: AdminClass }) {
  const t = useT();
  const { locale } = useLocale();
  const [open, setOpen] = useState<Open>(null);
  const status = useSetClassStatus();
  const cancelled = item.status === 'cancelled';

  function mark(next: BookableStatus) {
    status.mutate({ id: item.id, status: next });
  }

  const pending = status.isPending;
  const items: ActionsMenuItem[] = cancelled
    ? [
        {
          key: 'restore',
          label: t.booking.actionRestore,
          variant: 'ghost',
          loading: pending,
          onSelect: () => mark('scheduled'),
        },
      ]
    : [
        {
          key: 'move',
          label: t.booking.actionMove,
          disabled: pending,
          onSelect: () => setOpen('move'),
        },
        ...(item.status !== 'completed'
          ? [
              {
                key: 'completed',
                label: t.booking.actionCompleted,
                disabled: pending,
                onSelect: () => mark('completed'),
              },
            ]
          : []),
        ...(item.status !== 'no_show'
          ? [
              {
                key: 'no_show',
                label: t.booking.actionNoShow,
                disabled: pending,
                onSelect: () => mark('no_show'),
              },
            ]
          : []),
        ...(item.status !== 'scheduled'
          ? [
              {
                key: 'scheduled',
                label: t.booking.actionScheduled,
                disabled: pending,
                onSelect: () => mark('scheduled'),
              },
            ]
          : []),
        {
          key: 'cancel',
          label: t.booking.actionCancel,
          destructive: true,
          disabled: pending,
          onSelect: () => setOpen('cancel'),
        },
      ];

  return (
    <div className="flex flex-col items-end gap-2">
      <RowActions
        items={items}
        busy={pending}
        label={t.common.moreActionsFor.replace(
          '{name}',
          formatSchoolDateTime(item.startsAt, locale),
        )}
      />
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
  const [sendEmails, setSendEmails] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const instructor =
    localizeField(item.instructorName, item.instructorNameZh, locale) || null;
  const warningText = useWarningText(participantsOf(item), (id) =>
    id === item.instructorId ? instructor : null,
  );
  if (warnings.length > 0)
    return (
      <Dialog title={t.booking.cancelTitle} onClose={onClose}>
        <WarningsResult
          title={t.booking.cancelledWarningsTitle}
          lines={warnings}
          onClose={onClose}
        />
      </Dialog>
    );
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
      <SendEmailsField
        label={t.booking.sendEmailsCancel}
        checked={sendEmails}
        past={isPastStart(item.startsAt, Date.now())}
        onChange={setSendEmails}
      />
      {cancel.isError && <BookingErrorBanner error={cancel.error} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t.booking.keep}
        </Button>
        <Button
          variant="danger"
          loading={cancel.isPending}
          onClick={() =>
            cancel.mutate(
              { id: item.id, sendEmails },
              {
                onSuccess: (saved) => {
                  const lines = warningText(saved.warnings);
                  if (lines.length > 0) setWarnings(lines);
                  else onClose();
                },
              },
            )
          }
        >
          {t.booking.cancelConfirm}
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
  const [customers, setCustomers] = useState<PickedCustomer[]>(() =>
    participantsOf(item),
  );
  const [sendEmails, setSendEmails] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

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

  const timeChanged = date !== start.date || time !== start.time;
  const startsAt =
    timeChanged && date && time ? schoolInstant(date, time) : null;
  const originalIds = item.participants.map((p) => p.customerId).join(',');
  const nextIds = customers.map((c) => c.id).join(',');
  const body: UpdateBookingInput = {
    ...(startsAt && { startsAt }),
    ...(instructorId !== item.instructorId && { instructorId }),
    ...(lessonTypeId && lessonTypeId !== item.lessonTypeId && { lessonTypeId }),
    ...(nextIds !== originalIds &&
      customers.length > 0 && { customerIds: customers.map((c) => c.id) }),
    ...(notes.trim() !== (item.notes ?? '') && { notes: notes.trim() || null }),
  };
  const changed = Object.keys(body).length > 0;
  const warningText = useWarningText(
    [...customers, ...participantsOf(item)],
    (id) => instructorOptions.find((o) => o.id === id)?.name ?? null,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!changed || update.isPending) return;
    update.mutate(
      { id: item.id, ...body, ...(!sendEmails && { sendEmails: false }) },
      {
        onSuccess: (saved) => {
          const lines = warningText(saved.warnings);
          if (lines.length > 0) setWarnings(lines);
          else onClose();
        },
      },
    );
  }

  if (warnings.length > 0)
    return (
      <Dialog title={t.booking.moveTitle} onClose={onClose}>
        <WarningsResult
          title={t.booking.movedWarningsTitle}
          lines={warnings}
          onClose={onClose}
        />
      </Dialog>
    );

  return (
    <Dialog title={t.booking.moveTitle} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
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
        <SendEmailsField
          label={t.booking.sendEmailsMove}
          checked={sendEmails}
          past={isPastStart(startsAt ?? item.startsAt, Date.now())}
          onChange={setSendEmails}
        />
        {customers.length === 0 && (
          <Banner tone="pending">{t.booking.needCustomer}</Banner>
        )}
        {update.isError && <BookingErrorBanner error={update.error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!changed}>
            {t.booking.saveChanges}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
