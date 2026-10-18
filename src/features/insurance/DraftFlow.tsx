import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useNavigate } from 'react-router-dom';
import { Banner, Button, Card, Modal } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorText } from '@/features/admin/payroll/payrollFormat';
import { errorCodeOf, errorIndexesOf, useSubmitRequest } from './api';
import {
  draftBody,
  MAX_LESSONS,
  newDraft,
  validateDraft,
  type InsuranceDraft,
} from './draft';
import { DraftEditor, jumpToIssue, useLocationName } from './DraftEditor';
import { LessonTree, useInsuranceText } from './LessonTree';
import { dollars, fill, priceLessons } from './money';
import { ProgressCard } from './ProgressCard';
import type { MyInsurance } from './types';

export type DraftMode = 'edit' | 'review';

export interface DraftState {
  draft: InsuranceDraft | null;
  update: (recipe: (draft: InsuranceDraft) => InsuranceDraft) => void;
  discard: () => void;
}

export const LIST_PATH = '/insurance';
export const EDIT_PATH = '/insurance/new';
export const REVIEW_PATH = '/insurance/new/review';

export function useDraftQuote(draft: InsuranceDraft | null, data: MyInsurance) {
  const t = useT();
  return useMemo(() => {
    const lessons = draft?.lessons ?? [];
    const priced = priceLessons(
      lessons.map((l) => ({
        durationHours: l.durationHours,
        studentCount: l.students.length,
      })),
      {
        owedCents: data.owedCents,
        capCents: data.capCents,
        seasonPass: data.coverage === 'season_pass',
      },
    );
    return {
      priced,
      total: priced.reduce((sum, p) => sum + p.amountCents, 0),
      issues: validateDraft({ lessons }, data.season, t),
    };
  }, [draft, data, t]);
}

function submitErrorText(
  error: unknown,
  draft: InsuranceDraft,
  t: Messages,
): string[] {
  const s = t.insurance;
  const code = errorCodeOf(error);
  const indexes = errorIndexesOf(error);
  if (code === 'waiver_unconfirmed' && indexes.length > 0)
    return indexes.map(({ lessonIndex, studentIndex }) => {
      const name =
        draft.lessons[lessonIndex]?.students[studentIndex ?? -1]?.name.trim();
      return name
        ? fill(s.errWaiver, { n: lessonIndex + 1, name })
        : fill(s.errWaiverNoName, {
            n: lessonIndex + 1,
            m: (studentIndex ?? 0) + 1,
          });
    });
  if (code === 'no_season')
    return indexes.length > 0
      ? indexes.map(({ lessonIndex }) =>
          fill(s.errNoSeason, { n: lessonIndex + 1 }),
        )
      : [s.noSeason];
  if (code === 'mixed_seasons') return [s.errMixedSeasons];
  if (code === 'too_many_lessons')
    return [fill(s.maxLessons, { max: MAX_LESSONS })];
  if (error instanceof ApiError && error.status === 403)
    return [s.lockedSubmit];
  return [errorText(error, t.errors.generic)];
}

function savedTime(savedAt: number) {
  const d = new Date(savedAt);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DraftFlow({
  data,
  mode,
  desktop,
  state,
  onToast,
  children,
}: {
  data: MyInsurance;
  mode: DraftMode;
  desktop: boolean;
  state: DraftState;
  onToast: (message: string) => void;
  children?: ReactNode;
}) {
  const t = useT();
  const f = useInsuranceText();
  const s = f.s;
  const navigate = useNavigate();
  const empty = useMemo(newDraft, []);
  const draft = state.draft ?? empty;
  const { priced, total, issues } = useDraftQuote(draft, data);
  const submit = useSubmitRequest();
  const placeOf = useLocationName();
  const [confirming, setConfirming] = useState(false);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(typingTimer.current), []);
  const count = draft.lessons.length;
  const seasonPass = data.coverage === 'season_pass';

  const sent = useRef(false);

  if (sent.current) return <>{children}</>;
  if (mode === 'review' && (count === 0 || issues.length > 0))
    return <Navigate to={EDIT_PATH} replace />;

  function attemptReview() {
    if (count === 0) return;
    if (issues.length > 0) {
      state.update((d) => ({ ...d, showErrors: true }));
      jumpToIssue(issues[0]!, draft, state.update);
      return;
    }
    navigate(REVIEW_PATH);
  }

  function send() {
    if (submit.isPending) return;
    submit.mutate(draftBody(draft), {
      onSuccess: (request) => {
        sent.current = true;
        navigate(LIST_PATH, {
          state: { submitted: { id: request.id, no: request.requestNo } },
        });
        state.discard();
      },
    });
  }

  function requestClose() {
    if (count > 0) setConfirming(true);
    else {
      state.discard();
      navigate(LIST_PATH);
    }
  }

  function discardDraft() {
    setConfirming(false);
    state.discard();
    navigate(LIST_PATH);
    onToast(s.discarded);
  }

  const dockSummary = fill(s.dockSummary, {
    lessons: f.lessons(count),
    amount: dollars(total),
  });

  const editBody = (
    <>
      <ProgressCard data={data} draftCents={total} />
      <p className="my-2.5 text-[12.5px] font-semibold text-status-approved">
        ✓ {fill(s.draftSaved, { time: savedTime(draft.savedAt) })}
        <span className="font-normal text-slate">{s.draftSavedNote}</span>
      </p>
      <DraftEditor
        draft={draft}
        update={state.update}
        issues={issues}
        priced={priced}
        seasonPass={seasonPass}
        onToast={onToast}
      />
    </>
  );

  const reviewBody = (
    <>
      <ProgressCard data={data} draftCents={total} />
      <Card className="mt-3 p-4 sm:p-5">
        <p className="mb-3.5 text-[13px] text-slate">{s.reviewIntro}</p>
        <div data-testid="review-tree">
          <LessonTree
            withFormula
            lessons={draft.lessons.map((l, i) => ({
              key: l.id,
              lessonDate: l.lessonDate,
              durationHours: l.durationHours,
              place: placeOf(l),
              students: l.students.map((st) => ({
                name: st.name.trim(),
                waiverConfirmed: st.waiverConfirmed,
              })),
              listCents: priced[i]!.listCents,
              amountCents: priced[i]!.amountCents,
              seasonPass,
            }))}
          />
        </div>
        <div className="mt-1 flex items-baseline justify-between border-t-2 border-grey/40 pt-2.5 font-bold text-navy">
          <span>{s.totalDue}</span>
          <span
            data-testid="review-total"
            className="font-display text-xl tabular-nums"
          >
            {dollars(total)}
          </span>
        </div>
      </Card>
      {submit.isError && (
        <div className="mt-3">
          <Banner tone="error">
            {submitErrorText(submit.error, draft, t).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </Banner>
        </div>
      )}
    </>
  );

  const dock = (
    <>
      <p
        data-testid="dock-summary"
        className="flex min-w-0 flex-col font-bold leading-snug text-navy"
      >
        {dockSummary}
        {count === 0 && (
          <small className="text-[12.5px] font-normal text-slate">
            {s.needLesson}
          </small>
        )}
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        {mode === 'edit' ? (
          <Button disabled={count === 0} onClick={attemptReview}>
            {s.review}
          </Button>
        ) : (
          <Button loading={submit.isPending} onClick={send}>
            {fill(s.submit, { amount: dollars(total) })}
          </Button>
        )}
      </div>
    </>
  );

  const confirm = confirming && (
    <Modal
      title={s.discardTitle}
      onClose={() => setConfirming(false)}
      footer={
        <>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {s.keepEditing}
          </Button>
          <Button onClick={discardDraft}>{s.discard}</Button>
        </>
      }
    >
      <p className="text-sm text-slate">
        {fill(s.discardBody, { lessons: f.lessons(count) })}
      </p>
    </Modal>
  );

  if (desktop)
    return (
      <>
        {children}
        <Drawer
          title={mode === 'edit' ? s.newRequest : s.reviewTitle}
          season={data.season?.key ?? null}
          onClose={requestClose}
          closeLabel={t.common.close}
          blocked={confirming}
          back={
            mode === 'review' ? (
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2"
                onClick={() => navigate(EDIT_PATH)}
              >
                ← {s.backToEdit}
              </Button>
            ) : null
          }
          footer={dock}
        >
          {mode === 'edit' ? editBody : reviewBody}
        </Drawer>
        {confirm}
      </>
    );

  return (
    <div
      className="flex flex-col"
      onFocusCapture={(e) => {
        if (!isTextField(e.target)) return;
        clearTimeout(typingTimer.current);
        setTyping(true);
      }}
      onBlurCapture={() => {
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 250);
      }}
    >
      <div className="-ml-2 mb-1.5">
        <Button
          variant="ghost"
          onClick={() => navigate(mode === 'edit' ? LIST_PATH : EDIT_PATH)}
        >
          ← {mode === 'edit' ? s.backToList : s.backToEdit}
        </Button>
      </div>
      <h1 className="mb-3.5 flex flex-wrap items-center gap-2.5 text-[28px] leading-tight">
        {mode === 'edit' ? s.newRequest : s.reviewTitle}
        <SeasonPill season={data.season?.key ?? null} />
      </h1>
      {mode === 'edit' ? editBody : reviewBody}
      <div
        data-testid="dock"
        className={cn(
          'sticky bottom-0 z-10 -mx-4 -mb-8 mt-5 flex flex-wrap items-center justify-between gap-2.5 border-t border-grey/60 bg-surface px-4 py-2.5 shadow-[0_-8px_20px_-12px_rgba(28,34,51,0.3)]',
          typing && 'hidden',
        )}
      >
        {dock}
      </div>
    </div>
  );
}

function isTextField(target: EventTarget) {
  return (
    target instanceof HTMLInputElement &&
    target.type !== 'checkbox' &&
    target.type !== 'radio'
  );
}

export function SeasonPill({ season }: { season: string | null }) {
  if (!season) return null;
  return (
    <span
      data-testid="season-badge"
      className="rounded-full bg-navy-tint px-2.5 py-0.5 font-body text-xs font-bold text-navy"
    >
      {season}
    </span>
  );
}

function Drawer({
  title,
  season,
  back,
  onClose,
  closeLabel,
  blocked,
  footer,
  children,
}: {
  title: string;
  season: string | null;
  back: ReactNode;
  onClose: () => void;
  closeLabel: string;
  blocked: boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !blockedRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        data-testid="drawer-scrim"
        className="absolute inset-0 bg-ink/45"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-[min(580px,100vw)] flex-col bg-canvas shadow-pop focus:outline-none"
      >
        <div className="flex items-center gap-2 border-b border-grey/60 bg-surface py-2 pl-4 pr-2.5">
          {back}
          <h2
            id={titleId}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[19px]"
          >
            {title}
            <SeasonPill season={season} />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid h-10 w-10 flex-none place-items-center rounded-md border border-grey/60 text-xl leading-none text-slate hover:border-red hover:text-red"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3.5">
          {children}
        </div>
        <div
          data-testid="dock"
          className="flex flex-wrap items-center justify-between gap-2.5 border-t border-grey/60 bg-surface px-4 py-2.5"
        >
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  );
}
