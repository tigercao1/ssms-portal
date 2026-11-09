import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '@/auth/SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Field, Select } from '@/components';
import { ApiError } from '@/lib/api';
import type { AdminClass } from '@/lib/types';
import { errorText } from '../LessonTypesPage';
import { useBookBatch, useCreateBooking } from './bookingApi';
import { BookingErrorBanner, Dialog } from './BookingParts';
import {
  BookedCardLine,
  CardEditor,
  CardSummary,
  gapsText,
} from './BookingCard';
import {
  MAX_DRAFTS,
  blankCard,
  cardGaps,
  newId,
  toBatchRow,
  toCreateInput,
  useBookingDrafts,
  type DraftCard,
} from './bookingDrafts';
import { schoolParts } from './bookingRules';
import { BookingSettingsCard } from './BookingSettingsCard';
import { SyncToastHost } from './CalendarSync';

const REPEAT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

interface BookedCard {
  card: DraftCard;
  classes: AdminClass[];
}

interface Outcome {
  booked: BookedCard[];
  failed: number;
}

function provesNothingBooked(error: unknown): boolean {
  return error instanceof ApiError && error.status === 400;
}

export function BookLessonPage() {
  const t = useT();
  const today = schoolParts(Date.now()).date;
  const now = Date.now();
  const { user } = useSession();
  const drafts = useBookingDrafts(user?.id ?? 'anonymous');
  const { outcomeUnknown, batchId, update, edit, clear } = drafts;
  const [blank, setBlank] = useState(() => blankCard(today));
  const cards = drafts.cards.length > 0 ? drafts.cards : [blank];
  const [openId, setOpenId] = useState<string | null>(() => {
    if (cards.length === 1) return cards[0]?.id ?? null;
    return cards.find((c) => cardGaps(c, now).length > 0)?.id ?? null;
  });
  const [focus, setFocus] = useState<{ target: string; seq: number } | null>(
    null,
  );
  const [repeat, setRepeat] = useState(1);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [firstSend, setFirstSend] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const sending = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const create = useCreateBooking();
  const batch = useBookBatch();

  const busy = batch.isPending || create.isPending;
  const frozen = outcomeUnknown || busy;
  const locked = outcomeUnknown && !firstSend;
  const open = outcomeUnknown || batch.isPending ? null : openId;
  const gaps = new Map(cards.map((c) => [c.id, cardGaps(c, now)]));
  const incomplete = cards
    .map((card, index) => ({ card, index, gaps: gaps.get(card.id) ?? [] }))
    .filter((c) => c.gaps.length > 0);
  const single = cards.length === 1;
  const singleCard = single ? cards[0] : undefined;
  const canRepeat = !outcomeUnknown && singleCard?.mode === 'grid';
  const tooMany = cards.length > MAX_DRAFTS;
  const full = cards.length >= MAX_DRAFTS;
  const ready = incomplete.length === 0 && !tooMany;
  if (!canRepeat && repeat !== 1) setRepeat(1);

  const patch = useCallback(
    (id: string, change: Partial<DraftCard>) =>
      edit((stored) =>
        (stored.length > 0 ? stored : [blank]).map((c) =>
          c.id === id ? { ...c, ...change, id, error: undefined } : c,
        ),
      ),
    [edit, blank],
  );

  function focusOn(target: string) {
    setFocus((f) => ({ target, seq: (f?.seq ?? 0) + 1 }));
  }

  const focusToken = (target: string) =>
    focus?.target === target ? focus.seq : 0;

  function freshCard(from?: DraftCard) {
    const next = blankCard(today, from);
    setBlank(next);
    setOpenId(next.id);
    return next;
  }

  function showStatus() {
    statusRef.current?.focus();
  }

  function addCard() {
    if (frozen || full) return;
    const next = blankCard(today, cards.at(-1));
    edit((stored) => [...(stored.length > 0 ? stored : [blank]), next]);
    setOpenId(next.id);
    focusOn(`edit:${next.id}`);
  }

  function removeCard(id: string) {
    if (frozen) return;
    const rest = cards.filter((c) => c.id !== id);
    edit((stored) => stored.filter((c) => c.id !== id));
    if (rest.length === 0) {
      const next = freshCard();
      focusOn(`edit:${next.id}`);
    } else {
      if (openId === id) setOpenId(null);
      focusOn('add');
    }
  }

  function openCard(id: string) {
    setOpenId(id);
    focusOn(`edit:${id}`);
  }

  function foldCard(id: string) {
    setOpenId(null);
    focusOn(`fold:${id}`);
  }

  function bookOne(card: DraftCard) {
    if (sending.current || create.isPending) return;
    sending.current = true;
    setOutcome(null);
    setFailure(null);
    create.mutate(toCreateInput(card, canRepeat ? repeat : 1), {
      onSuccess: (classes) => {
        edit((stored) => stored.filter((c) => c.id !== card.id));
        freshCard(card);
        setRepeat(1);
        setOutcome({ booked: [{ card, classes }], failed: 0 });
      },
      onSettled: () => {
        sending.current = false;
        showStatus();
      },
    });
  }

  async function bookAll() {
    if (sending.current || !batchId || tooMany) return;
    const sent = drafts.cards;
    if (sent.length === 0) return;
    sending.current = true;
    setFirstSend(!outcomeUnknown);
    setOutcome(null);
    setFailure(null);
    create.reset();
    update((cart) => ({ ...cart, outcomeUnknown: true }));
    try {
      const result = await batch.mutateAsync({
        batchId,
        bookings: sent.map(toBatchRow),
      });
      const byId = new Map(
        result.results.flatMap((r) => {
          const card = sent[r.index];
          return card ? [[card.id, r] as const] : [];
        }),
      );
      const booked = sent.flatMap((card) => {
        const r = byId.get(card.id);
        return r?.status === 'created' ? [{ card, classes: r.classes }] : [];
      });
      const remaining = sent.length - booked.length;
      update((cart) => ({
        ...cart,
        outcomeUnknown: false,
        batchId: booked.length > 0 ? newId() : cart.batchId,
        cards: cart.cards.flatMap((card) => {
          const r = byId.get(card.id);
          if (r?.status === 'created') return [];
          if (r?.status === 'failed')
            return [{ ...card, error: { code: r.code, message: r.message } }];
          return [card];
        }),
      }));
      if (remaining === 0) freshCard(sent.at(-1));
      else setOpenId(null);
      setOutcome({ booked, failed: remaining });
    } catch (error) {
      if (provesNothingBooked(error))
        update((cart) => ({ ...cart, outcomeUnknown: false }));
      setFailure(error);
    } finally {
      sending.current = false;
      setFirstSend(false);
      showStatus();
    }
  }

  function commit() {
    if (!ready || busy) return;
    if (single && singleCard && !outcomeUnknown) bookOne(singleCard);
    else void bookAll();
  }

  const commitLabel =
    single && !outcomeUnknown
      ? singleCard?.mode === 'past'
        ? t.booking.savePast
        : t.booking.book
      : t.booking.bookAll.replace('{n}', String(cards.length));
  const bookedCount = outcome?.booked.reduce((n, b) => n + b.classes.length, 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{t.booking.title}</h1>
        <p className="max-w-3xl text-slate">{t.booking.intro}</p>
      </div>
      <SyncToastHost />

      {outcome && outcome.booked.length > 0 && (
        <ul
          aria-label={t.booking.bookedListLabel}
          className="flex flex-col gap-2"
        >
          {outcome.booked.map((b) => (
            <BookedCardLine
              key={`booked-${b.card.id}`}
              card={b.card}
              classes={b.classes}
            />
          ))}
        </ul>
      )}

      <div className="flex min-w-0 flex-col gap-4">
        {cards.map((card, index) =>
          card.id === open ? (
            <CardEditor
              key={card.id}
              card={card}
              number={index + 1}
              gaps={gaps.get(card.id) ?? []}
              today={today}
              focusFirst={focusToken(`edit:${card.id}`)}
              onChange={(change) => patch(card.id, change)}
              onFold={() => foldCard(card.id)}
              onRemove={() => removeCard(card.id)}
            />
          ) : (
            <CardSummary
              key={card.id}
              card={card}
              number={index + 1}
              gaps={gaps.get(card.id) ?? []}
              disabled={frozen}
              focusEdit={focusToken(`fold:${card.id}`)}
              onEdit={() => openCard(card.id)}
              onRemove={() => removeCard(card.id)}
            />
          ),
        )}
      </div>

      <Card className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
        <div
          ref={statusRef}
          tabIndex={-1}
          aria-live="polite"
          className="flex flex-col gap-3 focus:outline-none"
        >
          {outcome && outcome.booked.length > 0 && (
            <Banner
              tone="approved"
              title={t.booking.batchBookedTitle.replace(
                '{n}',
                String(bookedCount),
              )}
            >
              <Link to="/admin/classes" className="underline">
                {t.booking.viewClasses}
              </Link>
            </Banner>
          )}
          {outcome && outcome.failed > 0 && (
            <Banner tone="pending">
              {t.booking.batchFailedSome.replace('{n}', String(outcome.failed))}
            </Banner>
          )}
          {create.isError && <BookingErrorBanner error={create.error} />}
          {locked ? (
            <Banner tone="error">
              <p>{t.booking.batchOffline}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() => void bookAll()}
                >
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
        </div>
        {!outcomeUnknown && incomplete.length > 0 && (
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium text-ink">{t.booking.cardsBlocked}</p>
            <ul className="list-disc pl-5 text-slate">
              {incomplete.map((c) => (
                <li key={c.card.id} className="break-words">
                  {t.booking.cardsBlockedLine
                    .replace('{n}', String(c.index + 1))
                    .replace('{items}', gapsText(t, c.gaps))}
                </li>
              ))}
            </ul>
          </div>
        )}
        {tooMany && (
          <Banner tone="pending">
            {t.booking.draftsTooMany
              .replace('{max}', String(MAX_DRAFTS))
              .replace('{n}', String(cards.length))}
          </Banner>
        )}
        {full && !tooMany && !outcomeUnknown && (
          <p className="text-sm text-slate">
            {t.booking.listFull.replace('{n}', String(MAX_DRAFTS))}
          </p>
        )}
        {canRepeat && (
          <div className="sm:max-w-xs">
            <Field label={t.booking.repeat}>
              {(p) => (
                <Select
                  {...p}
                  value={repeat}
                  disabled={busy}
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
          </div>
        )}
        {!locked && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {cards.length > 1 && (
              <Button
                variant="ghost"
                disabled={frozen}
                onClick={() => setConfirmClear(true)}
              >
                {t.booking.clearList}
              </Button>
            )}
            <AddCardButton
              disabled={frozen || full}
              focus={focusToken('add')}
              onClick={addCard}
            />
            <Button loading={busy} disabled={!ready} onClick={commit}>
              {commitLabel}
            </Button>
          </div>
        )}
      </Card>

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
            ).replace('{n}', String(drafts.cards.length))}
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
                const next = freshCard();
                focusOn(`edit:${next.id}`);
              }}
            >
              {outcomeUnknown ? t.booking.discardList : t.booking.clearList}
            </Button>
          </div>
        </Dialog>
      )}

      <BookingSettingsCard />
    </div>
  );
}

function AddCardButton({
  disabled,
  focus,
  onClick,
}: {
  disabled: boolean;
  focus: number;
  onClick: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (focus) ref.current?.querySelector('button')?.focus();
  }, [focus]);
  return (
    <span ref={ref} className="contents">
      <Button variant="secondary" disabled={disabled} onClick={onClick}>
        {t.booking.addCard}
      </Button>
    </span>
  );
}
