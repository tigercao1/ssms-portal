import { useRef, useState } from 'react';
import { Banner, Button, Card, Modal, Spinner } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { LockIcon } from '@/features/documents/onboarding/Locked';
import { errorText } from '@/features/admin/payroll/payrollFormat';
import { errorCodeOf, useBuySeasonPass, useMyInsurance } from './api';
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
        <LockedInsurance reason={data.lockReason ?? 'pending_approval'} />
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
          onToast={showToast}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <CapProgress data={data} />
          <SeasonPassCard data={data} onToast={showToast} />
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
      <p className="text-sm text-slate">
        {atCap
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

function SeasonPassCard({
  data,
  onToast,
}: {
  data: MyInsurance;
  onToast: (message: string) => void;
}) {
  const t = useT();
  const s = t.insurance;
  const [confirming, setConfirming] = useState(false);
  const buy = useBuySeasonPass();
  const idempotencyKey = useRef(crypto.randomUUID());
  const covered = data.coverage !== 'none';
  const due = dollars(Math.max(0, data.capCents - data.owedCents));

  function confirm() {
    if (!data.season || buy.isPending) return;
    buy.mutate(
      { season: data.season.key, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: (record) => {
          idempotencyKey.current = crypto.randomUUID();
          setConfirming(false);
          onToast(
            s.seasonPassToast
              .replace('{recordNo}', record.recordNo)
              .replace('{amount}', dollars(record.amountCents)),
          );
        },
      },
    );
  }

  const buyError = buy.isError
    ? errorCodeOf(buy.error) === 'already_covered'
      ? s.alreadyCovered
      : errorText(buy.error, t.errors.generic)
    : null;

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg bg-navy p-5 text-white shadow-card">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/5"
      />
      <p className="text-xs text-white/70">{s.passEyebrow}</p>
      <h2 className="text-lg text-white">{s.passTitle}</h2>
      <p className="text-3xl font-bold tabular-nums">
        {dollars(data.capCents)}
      </p>
      <p className="text-sm text-white/80">{s.passBody}</p>
      {covered ? (
        <p
          data-testid="pass-covered"
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold"
        >
          {data.coverage === 'season_pass'
            ? s.coveredSeasonPass
            : s.coveredCapped}
        </p>
      ) : (
        <Button
          variant="secondary"
          className="border-white text-white hover:bg-white/10"
          disabled={!data.season}
          onClick={() => {
            buy.reset();
            setConfirming(true);
          }}
        >
          {s.passBuy.replace('{amount}', due)}
        </Button>
      )}
      {confirming && (
        <Modal
          title={s.passConfirmTitle}
          onClose={() => !buy.isPending && setConfirming(false)}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={buy.isPending}
              >
                {t.common.cancel}
              </Button>
              <Button loading={buy.isPending} onClick={confirm}>
                {s.passConfirm.replace('{amount}', due)}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-sm">
            <p>
              {s.passConfirmBody
                .replace('{owed}', dollars(data.owedCents))
                .replace('{amount}', due)
                .replace('{season}', data.season?.key ?? '')}
            </p>
            <p className="text-slate">{s.paymentNote}</p>
            {buyError && <Banner tone="error">{buyError}</Banner>}
          </div>
        </Modal>
      )}
    </div>
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
