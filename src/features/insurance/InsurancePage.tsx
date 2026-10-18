import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Banner, Button, Card, Modal, Spinner } from '@/components';
import { useSession } from '@/auth/SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import {
  LockIcon,
  OnboardingIncompleteLocked,
} from '@/features/documents/onboarding/Locked';
import { SeasonSelect } from '@/features/reference/SeasonSelect';
import { useMyInsurance } from './api';
import { useInsuranceDraft } from './draft';
import {
  DraftFlow,
  EDIT_PATH,
  LIST_PATH,
  REVIEW_PATH,
  SeasonPill,
  useDraftQuote,
  type DraftMode,
  type DraftState,
} from './DraftFlow';
import { useIsDesktop } from './layout';
import { useInsuranceText } from './LessonTree';
import { fill } from './money';
import { ProgressCard } from './ProgressCard';
import { RequestList } from './RequestList';
import { useToast } from './Toast';
import type { InsuranceLockReason, MyInsurance } from './types';

interface ListLocationState {
  submitted?: { id: string; no: string };
}

export function InsurancePage() {
  const t = useT();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { data, isLoading, isError, refetch } = useMyInsurance(
    searchParams.get('season'),
  );
  const mode: DraftMode | null =
    pathname === REVIEW_PATH
      ? 'review'
      : pathname === EDIT_PATH
        ? 'edit'
        : null;

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (isError || !data)
    return (
      <Card>
        <Banner tone="error">{t.insurance.loadFailed}</Banner>
        <Button
          className="mt-4"
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
        >
          {t.common.retry}
        </Button>
      </Card>
    );
  if (data.locked)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader data={data} />
        {data.lockReason === 'onboarding_incomplete' ? (
          <OnboardingIncompleteLocked
            title={t.insurance.onboardingTitle}
            body={t.insurance.onboardingBody}
            linkLabel={t.insurance.onboardingOpen}
          />
        ) : (
          <LockedInsurance reason={data.lockReason ?? 'pending_approval'} />
        )}
      </div>
    );
  return <InsuranceBody data={data} mode={mode} />;
}

function PageHeader({
  data,
  action,
  onSeason,
}: {
  data: MyInsurance;
  action?: ReactNode;
  onSeason?: (key: string) => void;
}) {
  const t = useT();
  return (
    <header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex flex-wrap items-center gap-2.5 text-[28px] leading-tight">
          {t.insurance.title}
          {!onSeason && <SeasonPill season={data.season?.key ?? null} />}
        </h1>
        <div className="flex flex-wrap items-center gap-2.5">
          {onSeason && (
            <SeasonSelect
              data-testid="season-select"
              aria-label={t.seasons.colKey}
              className="w-44"
              value={data.season?.key ?? ''}
              onChange={onSeason}
            />
          )}
          {action}
        </div>
      </div>
      <p className="mt-2.5 max-w-2xl text-[14.5px] text-slate">
        {t.insurance.headerCopy}
      </p>
    </header>
  );
}

function InsuranceBody({
  data,
  mode,
}: {
  data: MyInsurance;
  mode: DraftMode | null;
}) {
  const { user } = useSession();
  const state = useInsuranceDraft(user?.id ?? 'anonymous');
  const desktop = useIsDesktop();
  const { toast, showToast } = useToast({ topOnPhones: true });
  const location = useLocation();
  const navigate = useNavigate();
  const s = useT().insurance;
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const submitted = (location.state as ListLocationState | null)?.submitted;

  useEffect(() => {
    if (!submitted) return;
    setHighlightId(submitted.id);
    showToast(fill(s.submittedToast, { no: submitted.no }));
    navigate(
      { pathname: LIST_PATH, search: location.search },
      { replace: true, state: null },
    );
  }, [submitted, showToast, navigate, location.search, s.submittedToast]);

  const canCreate = data.season !== null;
  const list = (
    <ListView
      data={data}
      state={state}
      editing={mode !== null}
      canCreate={canCreate}
      highlightId={highlightId}
      onToast={showToast}
    />
  );

  return (
    <>
      {mode && canCreate ? (
        <DraftFlow
          data={data}
          mode={mode}
          desktop={desktop}
          state={state}
          onToast={showToast}
        >
          {list}
        </DraftFlow>
      ) : (
        list
      )}
      {toast}
    </>
  );
}

function ListView({
  data,
  state,
  editing,
  canCreate,
  highlightId,
  onToast,
}: {
  data: MyInsurance;
  state: DraftState;
  editing: boolean;
  canCreate: boolean;
  highlightId: string | null;
  onToast: (message: string) => void;
}) {
  const f = useInsuranceText();
  const s = f.s;
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const { search } = useLocation();
  const quote = useDraftQuote(state.draft, data);
  const [confirming, setConfirming] = useState(false);
  const draftLessons = state.draft?.lessons.length ?? 0;
  const hasDraft = draftLessons > 0;
  const openDraft = () => navigate({ pathname: EDIT_PATH, search });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        data={data}
        onSeason={(key) => setSearchParams({ season: key })}
        action={
          canCreate ? (
            <Button data-testid="new-request" onClick={openDraft}>
              {hasDraft ? s.resumeDraft : s.newRequest}
            </Button>
          ) : null
        }
      />
      {!canCreate && <Banner tone="pending">{s.noSeason}</Banner>}
      <ProgressCard
        data={data}
        draftCents={
          hasDraft && (!quote.season || quote.season.key === data.season?.key)
            ? quote.total
            : null
        }
      />
      {hasDraft && canCreate && !editing && (
        <Card className="flex flex-wrap items-center justify-between gap-2.5 border-l-4 border-l-status-pending p-4">
          <span data-testid="draft-banner" className="text-sm">
            {fill(s.draftBanner, { lessons: f.lessons(draftLessons) })}
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-red"
              onClick={() => setConfirming(true)}
            >
              {s.discard}
            </Button>
            <Button size="sm" variant="secondary" onClick={openDraft}>
              {s.keepEditing}
            </Button>
          </span>
        </Card>
      )}
      <RequestList
        requests={data.requests ?? []}
        records={data.records}
        highlightId={highlightId}
        canCreate={canCreate}
        onNew={openDraft}
      />
      {confirming && (
        <Modal
          title={s.discardTitle}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {s.keepEditing}
              </Button>
              <Button
                onClick={() => {
                  setConfirming(false);
                  state.discard();
                  onToast(s.discarded);
                }}
              >
                {s.discard}
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate">
            {fill(s.discardBody, { lessons: f.lessons(draftLessons) })}
          </p>
        </Modal>
      )}
    </div>
  );
}

function LockedInsurance({ reason }: { reason: InsuranceLockReason }) {
  const t = useT();
  const s = t.insurance;
  const rejected = reason === 'rejected';
  return (
    <>
      <div
        role="status"
        className={cn(
          'flex items-start gap-3 rounded-md border-l-[3px] px-4 py-3 text-sm',
          rejected
            ? 'border-l-status-rejected bg-red-tint'
            : 'border-l-status-pending bg-surface shadow-card',
        )}
      >
        <span
          className={cn(
            'grid h-7 w-7 flex-none place-items-center rounded-full',
            rejected
              ? 'bg-surface text-status-rejected'
              : 'bg-sunken text-status-pending',
          )}
        >
          <LockIcon />
        </span>
        <div>
          <p className="font-semibold text-navy">
            {rejected ? s.rejectedTitle : s.pendingTitle}
          </p>
          <p className="text-ink">
            {rejected ? s.rejectedBody : s.pendingBody}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
        <span
          className={cn(
            'grid h-12 w-12 place-items-center rounded-full bg-sunken',
            rejected ? 'text-status-rejected' : 'text-status-pending',
          )}
        >
          <LockIcon className="h-6 w-6" />
        </span>
        <p className="max-w-md text-sm text-slate">{s.lockedEmpty}</p>
      </div>
    </>
  );
}
