import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import type { Messages } from '@/i18n/core/types';
import { Banner, Button, Card } from '@/components';
import { ApiError } from '@/lib/api';
import { errorText } from '../LessonTypesPage';
import { useBookBatch } from './bookingApi';
import { Dialog, pickedName } from './BookingParts';
import {
  MAX_DRAFTS,
  newId,
  toBatchRow,
  type DraftBooking,
  type DraftError,
  type useBookingDrafts,
} from './bookingDrafts';
import { formatSchoolDateTime } from './bookingRules';

type Drafts = ReturnType<typeof useBookingDrafts>;
const DRAFT_ERROR_KEYS = {
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

function draftErrorText(t: Messages, error: DraftError): string {
  return Object.hasOwn(DRAFT_ERROR_KEYS, error.code)
    ? t.booking[DRAFT_ERROR_KEYS[error.code as keyof typeof DRAFT_ERROR_KEYS]]
    : error.message;
}

function provesNothingBooked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400;
}

export function BookingDraftList({
  drafts,
  editingId,
  onEdit,
  onCancelEdit,
}: {
  drafts: Drafts;
  editingId: string | null;
  onEdit: (row: DraftBooking) => void;
  onCancelEdit: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const batch = useBookBatch();
  const sending = useRef(false);
  const [booked, setBooked] = useState<DraftBooking[] | null>(null);
  const [failedCount, setFailedCount] = useState(0);
  const [failure, setFailure] = useState<unknown>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [firstSend, setFirstSend] = useState(false);
  const { rows, batchId, outcomeUnknown, update, remove, clear } = drafts;
  const tooMany = rows.length > MAX_DRAFTS;
  const busy = batch.isPending;
  const locked = outcomeUnknown && !firstSend;

  async function bookAll() {
    if (sending.current || !batchId || rows.length === 0 || tooMany) return;
    sending.current = true;
    const sent = rows;
    setFirstSend(!outcomeUnknown);
    setBooked(null);
    setFailure(null);
    update((cart) => ({ ...cart, outcomeUnknown: true }));
    try {
      const result = await batch.mutateAsync({
        batchId,
        bookings: sent.map(toBatchRow),
      });
      const outcome = new Map(
        result.results.flatMap((r) => {
          const row = sent[r.index];
          return row ? [[row.id, r] as const] : [];
        }),
      );
      const created = sent.filter(
        (r) => outcome.get(r.id)?.status === 'created',
      );
      update((cart) => ({
        ...cart,
        outcomeUnknown: false,
        batchId: created.length > 0 ? newId() : cart.batchId,
        rows: cart.rows.flatMap((row) => {
          const r = outcome.get(row.id);
          if (r?.status === 'created') return [];
          if (r?.status === 'failed')
            return [{ ...row, error: { code: r.code, message: r.message } }];
          return [row];
        }),
      }));
      setBooked(created);
      setFailedCount(sent.length - created.length);
    } catch (error) {
      if (provesNothingBooked(error))
        update((cart) => ({ ...cart, outcomeUnknown: false }));
      setFailure(error);
    } finally {
      sending.current = false;
      setFirstSend(false);
    }
  }

  if (rows.length === 0 && !booked?.length) return null;

  return (
    <Card className="flex min-w-0 flex-col gap-4">
      {booked && booked.length > 0 && (
        <Banner
          tone="approved"
          title={t.booking.batchBookedTitle.replace(
            '{n}',
            String(booked.length),
          )}
        >
          <ul data-private className="list-disc pl-5">
            {booked.map((row) => (
              <li key={row.id} className="break-words">
                {row.customers.map(pickedName).join(', ')} ·{' '}
                {formatSchoolDateTime(row.startsAt, locale)}
              </li>
            ))}
          </ul>
          <Link to="/admin/classes" className="underline">
            {t.booking.viewClasses}
          </Link>
        </Banner>
      )}
      {booked && failedCount > 0 && (
        <Banner tone="pending">
          {t.booking.batchFailedSome.replace('{n}', String(failedCount))}
        </Banner>
      )}
      {rows.length > 0 && (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg">{t.booking.draftsTitle}</h2>
            <p aria-live="polite" className="text-sm text-slate">
              {t.booking.draftsCount.replace('{n}', String(rows.length))}
            </p>
          </div>
          <ul
            aria-label={t.booking.draftsTitle}
            className="flex flex-col divide-y divide-grey/40"
          >
            {rows.map((row) => (
              <DraftRow
                key={row.id}
                row={row}
                disabled={busy || outcomeUnknown}
                editing={row.id === editingId}
                onEdit={() => onEdit(row)}
                onRemove={() => remove(row.id)}
              />
            ))}
          </ul>
          {tooMany && (
            <Banner tone="pending">
              {t.booking.draftsTooMany
                .replace('{max}', String(MAX_DRAFTS))
                .replace('{n}', String(rows.length))}
            </Banner>
          )}
          {locked ? (
            <Banner tone="error">
              <p>{t.booking.batchOffline}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="secondary" loading={busy} onClick={bookAll}>
                  {t.booking.retry}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmClear(true)}
                >
                  {t.booking.discardList}
                </Button>
              </div>
            </Banner>
          ) : (
            failure !== null && (
              <Banner tone="error">
                {errorText(failure, t.errors.generic)}
              </Banner>
            )
          )}
          {editingId && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
              <p>{t.booking.finishEditing}</p>
              <Button variant="ghost" onClick={onCancelEdit}>
                {t.common.cancel}
              </Button>
            </div>
          )}
          {!locked && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmClear(true)}
              >
                {t.booking.clearList}
              </Button>
              <Button
                loading={busy}
                disabled={tooMany || editingId !== null}
                onClick={bookAll}
              >
                {t.booking.bookAll.replace('{n}', String(rows.length))}
              </Button>
            </div>
          )}
        </>
      )}
      {confirmClear && (
        <Dialog
          title={
            outcomeUnknown
              ? t.booking.discardListTitle
              : t.booking.clearListTitle
          }
          onClose={() => setConfirmClear(false)}
        >
          <p className="text-sm text-ink">
            {(outcomeUnknown
              ? t.booking.discardListBody
              : t.booking.clearListBody
            ).replace('{n}', String(rows.length))}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              {t.booking.keepList}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clear();
                setFailure(null);
                setConfirmClear(false);
              }}
            >
              {outcomeUnknown ? t.booking.discardList : t.booking.clearList}
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

function DraftRow({
  row,
  disabled,
  editing,
  onEdit,
  onRemove,
}: {
  row: DraftBooking;
  disabled: boolean;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const names = row.customers.map(pickedName).join(', ');
  const when = formatSchoolDateTime(row.startsAt, locale);
  const status =
    row.status === 'completed'
      ? t.lessons.classCompleted
      : row.status === 'no_show'
        ? t.lessons.classNoShow
        : null;
  return (
    <li className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <p data-private className="break-words font-medium text-ink">
          {names}
        </p>
        <p className="break-words text-ink">
          {localizeField(row.lessonTypeNameEn, row.lessonTypeNameZh, locale)} ·{' '}
          {localizeField(row.instructorNameEn, row.instructorNameZh, locale) ||
            row.instructorNameEn}
        </p>
        <p className="text-ink">
          {when}
          {status && ` · ${status}`}
        </p>
        {row.notes && (
          <p data-private className="break-words text-slate">
            {t.booking.draftsNotes.replace('{notes}', row.notes)}
          </p>
        )}
        {row.error && (
          <p className="break-words text-status-rejected">
            {draftErrorText(t, row.error)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={disabled || editing}
          aria-label={t.booking.editDraft
            .replace('{name}', names)
            .replace('{when}', when)}
          onClick={onEdit}
        >
          {t.booking.edit}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || editing}
          aria-label={t.booking.removeDraft
            .replace('{name}', names)
            .replace('{when}', when)}
          onClick={onRemove}
        >
          {t.booking.remove}
        </Button>
      </div>
    </li>
  );
}
