import { useState, type ReactNode } from 'react';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Spinner, Toggle } from '@/components';
import { formatDateTime } from '@/lib/date';
import { ApiError } from '@/lib/api';
import type { ShopifySyncStatus } from '@/lib/types';
import {
  isSyncEffective,
  useRunShopifySync,
  useSetShopifySyncEnabled,
  useShopifySyncStatus,
} from './shopifySyncApi';

function errorText(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function ShopifySyncPage() {
  const t = useT();
  const status = useShopifySyncStatus({ poll: true });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">{t.shopifySync.title}</h1>
      {status.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : status.data ? (
        <>
          <StatusCard status={status.data} />
          <SyncAllCard status={status.data} />
        </>
      ) : (
        <Card>
          <Banner tone="error">
            {errorText(status.error, t.errors.generic)}
          </Banner>
        </Card>
      )}
    </div>
  );
}

function StatusCard({ status }: { status: ShopifySyncStatus }) {
  const t = useT();
  const { locale } = useLocale();
  const setEnabled = useSetShopifySyncEnabled();
  const [pending, setPending] = useState<boolean | null>(null);
  const effective = isSyncEffective(status);
  const when = (iso: string | null) =>
    iso ? formatDateTime(iso, locale) : t.shopifySync.never;

  const stateLabel = !status.enabled
    ? t.shopifySync.stateOff
    : effective
      ? t.shopifySync.stateOn
      : t.shopifySync.onButBlocked;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg">{t.shopifySync.toggleLabel}</h2>
          <span className="text-sm text-slate" data-testid="sync-state">
            {stateLabel}
          </span>
        </div>
        <Toggle
          checked={status.enabled}
          label={t.shopifySync.toggleLabel}
          disabled={setEnabled.isPending || pending !== null}
          onChange={(next) => {
            setEnabled.reset();
            setPending(next);
          }}
        />
      </div>

      {pending !== null && (
        <div
          role="alertdialog"
          aria-labelledby="shopify-sync-toggle-title"
          className="flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink"
        >
          <p id="shopify-sync-toggle-title" className="font-semibold">
            {pending ? t.shopifySync.enableTitle : t.shopifySync.disableTitle}
          </p>
          <p>
            {pending ? t.shopifySync.enableBody : t.shopifySync.disableBody}
          </p>
          {setEnabled.isError && (
            <Banner tone="error">
              {errorText(setEnabled.error, t.errors.generic)}
            </Banner>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={setEnabled.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              variant={pending ? 'primary' : 'danger'}
              loading={setEnabled.isPending}
              onClick={() =>
                setEnabled.mutate(pending, {
                  onSuccess: () => setPending(null),
                })
              }
            >
              {pending ? t.shopifySync.turnOn : t.shopifySync.turnOff}
            </Button>
          </div>
        </div>
      )}

      {!status.masterSwitch && (
        <Banner tone="pending" title={t.shopifySync.masterSwitchOff}>
          {t.shopifySync.masterSwitchOffBody}
        </Banner>
      )}
      {!status.configured && (
        <Banner tone="pending" title={t.shopifySync.notConfigured}>
          {t.shopifySync.notConfiguredBody}
        </Banner>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <Detail label={t.shopifySync.lastRun} value={when(status.lastTickAt)} />
        <Detail
          label={t.shopifySync.lastSuccess}
          value={when(status.lastSuccessAt)}
        />
        <Detail
          label={t.shopifySync.lastError}
          value={
            status.lastError ? (
              <span className="flex flex-col gap-0.5">
                <span className="text-status-rejected">{status.lastError}</span>
                {status.lastErrorAt && (
                  <span className="text-xs text-slate">
                    {formatDateTime(status.lastErrorAt, locale)}
                  </span>
                )}
              </span>
            ) : (
              t.shopifySync.none
            )
          }
        />
      </dl>

      <div className="grid gap-4 sm:grid-cols-2">
        <CountGroup
          title={t.shopifySync.queueTitle}
          items={[
            [t.shopifySync.pending, status.queue.pending],
            [t.shopifySync.retrying, status.queue.retrying],
          ]}
          footer={
            status.queue.oldestEnqueuedAt
              ? `${t.shopifySync.oldestEnqueued}: ${formatDateTime(status.queue.oldestEnqueuedAt, locale)}`
              : undefined
          }
        />
        <CountGroup
          title={t.shopifySync.entriesTitle}
          items={[
            [t.shopifySync.synced, status.entries.synced],
            [t.shopifySync.active, status.entries.active],
            [t.shopifySync.draft, status.entries.draft],
            [t.shopifySync.failed, status.entries.failed],
          ]}
        />
      </div>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function CountGroup({
  title,
  items,
  footer,
}: {
  title: string;
  items: [string, number][];
  footer?: string;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-md border border-grey/60 p-4"
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-slate">{label}</dt>
            <dd className="font-display text-2xl text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="text-xs text-slate">{footer}</p>}
    </section>
  );
}

function SyncAllCard({ status }: { status: ShopifySyncStatus }) {
  const t = useT();
  const run = useRunShopifySync();
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="flex flex-col gap-3">
      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby="shopify-sync-all-title"
          className="flex flex-col gap-3 rounded-md border-l-[3px] border-l-navy bg-navy-tint px-4 py-3 text-sm text-ink"
        >
          <p id="shopify-sync-all-title" className="font-semibold">
            {t.shopifySync.syncAllTitle}
          </p>
          <p>{t.shopifySync.syncAllBody}</p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={run.isPending}
            >
              {t.common.cancel}
            </Button>
            <Button
              size="sm"
              loading={run.isPending}
              onClick={() =>
                run.mutate(undefined, { onSettled: () => setConfirming(false) })
              }
            >
              {t.admin.confirm}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              run.reset();
              setConfirming(true);
            }}
          >
            {t.shopifySync.syncAll}
          </Button>
        </div>
      )}
      {run.isError && (
        <Banner tone="error">{errorText(run.error, t.errors.generic)}</Banner>
      )}
      {run.isSuccess && (
        <Banner tone="approved">
          <p>
            {t.shopifySync.enqueued.replace(
              '{count}',
              String(run.data.enqueued),
            )}
          </p>
          {!isSyncEffective(status) && <p>{t.shopifySync.queuedWhileOff}</p>}
        </Banner>
      )}
    </Card>
  );
}
