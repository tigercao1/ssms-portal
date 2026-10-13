import { useState } from 'react';
import { Banner, Button, Card } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import {
  fetchPayrollCsv,
  useFinalizePayrollPeriod,
  useReopenPayrollPeriod,
} from './payrollApi';
import { downloadText, errorText, payrollFilename } from './payrollFormat';
import type { PayrollPeriodDetail } from './types';

type Confirming = 'finalize' | 'reopen' | null;
type Done = 'finalized' | 'reopened' | null;

export function PayrollActions({ detail }: { detail: PayrollPeriodDetail }) {
  const t = useT();
  const { period } = detail;
  const finalize = useFinalizePayrollPeriod(period.id);
  const reopen = useReopenPayrollPeriod(period.id);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [acceptZeroRate, setAcceptZeroRate] = useState(false);
  const [done, setDone] = useState<Done>(null);
  const [downloading, setDownloading] = useState<'sheet' | 'detail' | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const open = period.status === 'open';
  const needsRate = detail.needsRateCount;
  const pending = finalize.isPending || reopen.isPending;
  const action = confirming === 'reopen' ? reopen : finalize;

  async function download(kind: 'sheet' | 'detail') {
    setDownloading(kind);
    setDownloadError(null);
    try {
      const text = await fetchPayrollCsv(period.id, kind === 'detail');
      downloadText(
        payrollFilename(period.startsOn, period.endsOn, kind === 'detail'),
        text,
      );
    } catch (error) {
      setDownloadError(
        t.payroll.downloadFailed.replace(
          '{message}',
          errorText(error, t.errors.generic),
        ),
      );
    } finally {
      setDownloading(null);
    }
  }

  function start(kind: Exclude<Confirming, null>) {
    finalize.reset();
    reopen.reset();
    setDone(null);
    setAcceptZeroRate(false);
    setConfirming(kind);
  }

  function confirm() {
    if (confirming === 'reopen') {
      reopen.mutate(undefined, {
        onSuccess: () => {
          setConfirming(null);
          setDone('reopened');
        },
      });
    } else {
      finalize.mutate(acceptZeroRate, {
        onSuccess: () => {
          setConfirming(null);
          setDone('finalized');
        },
      });
    }
  }

  return (
    <Card className="flex flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={downloading === 'sheet'}
            disabled={downloading !== null}
            onClick={() => void download('sheet')}
          >
            {t.payroll.downloadSheet}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={downloading === 'detail'}
            disabled={downloading !== null}
            onClick={() => void download('detail')}
          >
            {t.payroll.downloadDetail}
          </Button>
        </div>
        {confirming === null &&
          (open ? (
            <Button size="sm" onClick={() => start('finalize')}>
              {t.payroll.finalize}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => start('reopen')}
            >
              {t.payroll.reopen}
            </Button>
          ))}
      </div>

      {downloadError && <Banner tone="error">{downloadError}</Banner>}

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="payroll-confirm-title"
          className="flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink"
        >
          <p id="payroll-confirm-title" className="font-semibold">
            {confirming === 'finalize'
              ? t.payroll.finalizeTitle
              : t.payroll.reopenTitle}
          </p>
          <p>
            {confirming === 'finalize'
              ? t.payroll.finalizeBody
              : t.payroll.reopenBody}
          </p>
          {confirming === 'finalize' && needsRate > 0 && (
            <>
              <p className="font-medium text-status-rejected">
                {t.payroll.finalizeNeedsRate.replace('{n}', String(needsRate))}
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={acceptZeroRate}
                  onChange={(e) => setAcceptZeroRate(e.target.checked)}
                />
                {t.payroll.acceptZeroRate}
              </label>
            </>
          )}
          {action.isError && (
            <Banner tone="error">
              {errorText(action.error, t.errors.generic)}
            </Banner>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(null)}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              loading={pending}
              disabled={
                confirming === 'finalize' && needsRate > 0 && !acceptZeroRate
              }
              onClick={confirm}
            >
              {confirming === 'finalize'
                ? t.payroll.finalizeConfirm
                : t.payroll.reopenConfirm}
            </Button>
          </div>
        </div>
      )}

      {done && (
        <Banner tone="approved">
          {done === 'finalized' ? t.payroll.finalized : t.payroll.reopened}
        </Banner>
      )}
    </Card>
  );
}
