import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Banner,
  Button,
  Card,
  Spinner,
  StatusBanner,
  StatusIcon,
} from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { useMyInsurance } from './api';
import { InsuranceRecords } from './InsuranceRecords';
import { dollars } from './money';
import {
  RegisterLessonCard,
  type RegisterLessonHandle,
} from './RegisterLessonCard';
import { useToast } from './Toast';
import type { InsuranceLockReason, MyInsurance } from './types';

export function InsurancePage() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMyInsurance();

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl">{t.insurance.title}</h1>
          <p className="mt-1 text-sm text-slate">{t.insurance.headerCopy}</p>
        </div>
        {data.season && (
          <p className="sm:text-right">
            <span className="block text-xs text-slate">
              {t.insurance.seasonBadgeLabel}
            </span>
            <span
              data-testid="season-badge"
              className="text-lg font-semibold tabular-nums text-navy"
            >
              {data.season.key}
            </span>
          </p>
        )}
      </header>
      {data.locked ? (
        <InsuranceLockedState reason={data.lockReason ?? 'pending_approval'} />
      ) : (
        <InsuranceBody data={data} />
      )}
    </div>
  );
}

function InsuranceBody({ data }: { data: MyInsurance }) {
  const formRef = useRef<RegisterLessonHandle>(null);
  const { toast, showToast } = useToast();
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <RegisterLessonCard
          ref={formRef}
          season={data.season}
          coverage={data.coverage}
          owedCents={data.owedCents}
          capCents={data.capCents}
          onToast={showToast}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <CapProgress data={data} />
          <PaymentNote />
        </div>
      </div>
      <InsuranceRecords
        records={data.records}
        onRegisterFirst={() => formRef.current?.focus()}
      />
      {toast}
    </>
  );
}

function CapProgress({ data }: { data: MyInsurance }) {
  const t = useT();
  const s = t.insurance;
  const atCap = data.owedCents >= data.capCents;
  const pct = Math.min(100, (data.owedCents / data.capCents) * 100);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-lg">{s.progressTitle}</h2>
      <p data-testid="cap-total" className="text-sm text-ink">
        {s.progressTotal
          .replace('{amount}', dollars(data.owedCents))
          .replace('{cap}', dollars(data.capCents))}
      </p>
      <div
        role="progressbar"
        aria-label={s.progressTitle}
        aria-valuemin={0}
        aria-valuemax={data.capCents / 100}
        aria-valuenow={Math.min(data.owedCents, data.capCents) / 100}
        className="h-2.5 overflow-hidden rounded-full bg-sunken"
      >
        <div
          className="h-full rounded-full bg-red transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p data-testid="cap-status" className="text-sm text-slate">
        {data.coverage === 'season_pass'
          ? s.coveredSeasonPass
          : atCap
            ? s.progressAtCap
            : s.progressRemaining.replace(
                '{amount}',
                dollars(data.capCents - data.owedCents),
              )}
      </p>
      {data.unpaidCents > 0 && (
        <p className="text-xs text-status-pending">
          {s.progressUnpaid.replace('{amount}', dollars(data.unpaidCents))}
        </p>
      )}
    </Card>
  );
}

function PaymentNote() {
  const t = useT();
  return (
    <p className="rounded-md border border-dashed border-grey bg-surface px-4 py-3 text-xs text-slate">
      {t.insurance.paymentNote}
    </p>
  );
}

function InsuranceLockedState({ reason }: { reason: InsuranceLockReason }) {
  const t = useT();
  return (
    <>
      <StatusBanner surface="insurance" reason={reason} />
      <div className="flex flex-col items-center gap-3 rounded-lg bg-surface px-5 py-8 text-center shadow-card">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-sunken">
          <StatusIcon reason={reason} className="h-6 w-6" />
        </span>
        {reason === 'onboarding_incomplete' ? (
          <Link
            to="/onboarding"
            className="text-sm font-medium text-navy underline underline-offset-4 hover:text-red"
          >
            {t.insurance.onboardingOpen}
          </Link>
        ) : (
          <p className="max-w-md text-sm text-slate">
            {t.insurance.lockedEmpty}
          </p>
        )}
      </div>
    </>
  );
}
