import type { ReactNode } from 'react';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Spinner } from '@/components';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/date';
import type { Messages } from '@/i18n/core/types';
import {
  isSyncEffective,
  useRunShopifySync,
  useShopifyInstructorSync,
  useShopifySyncStatus,
} from './shopifySyncApi';

function statusText(status: string | null, t: Messages) {
  switch (status) {
    case null:
      return t.shopifySync.notSynced;
    case 'synced':
      return t.shopifySync.synced;
    case 'active':
      return t.shopifySync.active;
    case 'draft':
      return t.shopifySync.draft;
    case 'failed':
      return t.shopifySync.failed;
    default:
      return status;
  }
}

export function ShopifyInstructorPanel({
  instructorId,
}: {
  instructorId: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const sync = useShopifyInstructorSync(instructorId);
  const global = useShopifySyncStatus();
  const run = useRunShopifySync();
  const notFound = sync.error instanceof ApiError && sync.error.status === 404;
  const data = sync.data;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.shopifySync.panelTitle}</h2>
      {sync.isLoading ? (
        <Spinner />
      ) : data ? (
        <>
          <dl className="flex flex-col gap-2 text-sm">
            <Row label={t.shopifySync.statusLabel}>
              {statusText(data.status, t)}
            </Row>
            <Row label={t.shopifySync.handle}>
              <span className="font-mono text-xs">
                {data.handle ?? t.shopifySync.none}
              </span>
            </Row>
            <Row label={t.shopifySync.lastSynced}>
              {data.lastSyncedAt
                ? formatDateTime(data.lastSyncedAt, locale)
                : t.shopifySync.never}
            </Row>
            {data.lastError && (
              <Row label={t.shopifySync.lastError}>
                <span className="text-status-rejected">{data.lastError}</span>
              </Row>
            )}
          </dl>
          {data.queued && (
            <p className="text-xs text-slate">
              {t.shopifySync.queuedNow} ·{' '}
              {t.shopifySync.attempts.replace('{count}', String(data.attempts))}
            </p>
          )}
        </>
      ) : notFound ? (
        <p className="text-sm text-slate">{t.shopifySync.notSynced}</p>
      ) : (
        <Banner tone="error">{t.errors.generic}</Banner>
      )}

      <Button
        variant="secondary"
        loading={run.isPending}
        onClick={() => run.mutate(instructorId)}
      >
        {t.shopifySync.syncInstructor}
      </Button>
      {run.isError && (
        <Banner tone="error">
          {run.error instanceof ApiError ? run.error.message : t.errors.generic}
        </Banner>
      )}
      {run.isSuccess && (
        <Banner tone="approved">
          <p>{t.shopifySync.instructorQueued}</p>
          {global.data && !isSyncEffective(global.data) && (
            <p>{t.shopifySync.queuedWhileOff}</p>
          )}
        </Banner>
      )}
      {data?.previewUrl && (
        <a
          href={data.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-navy hover:underline"
        >
          {t.shopifySync.openPreview} ↗
        </a>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
