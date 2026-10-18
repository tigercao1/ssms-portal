import { useState, type ReactNode } from 'react';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { Banner, Button, Card, Spinner } from '@/components';
import { ApiError } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/date';
import type { Messages } from '@/i18n/core/types';
import type { GoLiveReadiness, ShopifyEntryStatus } from '@/lib/types';
import {
  isSyncEffective,
  useRunShopifySync,
  useShopifyInstructorSync,
  useShopifySyncStatus,
} from './shopifySyncApi';
import { useAdminGoLive, useSetPublication } from './api';
import { missingItemKey, missingItemLabel } from '@/features/instructor/goLive';

function statusText(status: ShopifyEntryStatus | null, t: Messages) {
  switch (status) {
    case 'active':
      return t.shopifySync.active;
    case 'draft':
      return t.shopifySync.draft;
    default:
      return t.shopifySync.notSynced;
  }
}

export function ShopifyInstructorPanel({
  instructorId,
  publishedAt,
}: {
  instructorId: string;
  publishedAt: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const sync = useShopifyInstructorSync(instructorId);
  const global = useShopifySyncStatus();
  const run = useRunShopifySync();
  const goLive = useAdminGoLive(instructorId);
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
      {goLive.data && (
        <dl className="flex flex-col gap-2 text-sm">
          <GoLiveCheckRow readiness={goLive.data} />
        </dl>
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
      <PublicationAction
        instructorId={instructorId}
        publishedAt={publishedAt}
      />
    </Card>
  );
}

function PublicationAction({
  instructorId,
  publishedAt,
}: {
  instructorId: string;
  publishedAt: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  const publication = useSetPublication(instructorId);
  const [confirming, setConfirming] = useState(false);
  const published = publishedAt !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-grey/40 pt-3">
      <dl className="text-sm">
        <Row label={t.admin.colWebsite}>
          {published ? (
            <span className="text-status-approved">
              {t.admin.publishedOn.replace(
                '{date}',
                formatDate(publishedAt, locale),
              )}
            </span>
          ) : (
            <span className="text-slate">{t.admin.notPublished}</span>
          )}
        </Row>
      </dl>
      {!published ? (
        <Button
          loading={publication.isPending}
          onClick={() => publication.mutate(true)}
        >
          {t.admin.publish}
        </Button>
      ) : confirming ? (
        <>
          <p className="text-sm text-navy">{t.admin.unpublishConfirm}</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              loading={publication.isPending}
              onClick={() =>
                publication.mutate(false, {
                  onSuccess: () => setConfirming(false),
                })
              }
            >
              {t.admin.confirm}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t.admin.unpublish}
        </Button>
      )}
      {publication.isError && <Banner tone="error">{t.errors.generic}</Banner>}
    </div>
  );
}

function GoLiveCheckRow({ readiness }: { readiness: GoLiveReadiness }) {
  const t = useT();
  const { locale } = useLocale();
  const count = readiness.missing.length;
  const missingText = t.goLive.checkMissing.replace('{n}', String(count));
  return (
    <Row label={t.goLive.checkLabel}>
      {readiness.ready ? (
        <span className="text-status-approved">{t.goLive.checkReady}</span>
      ) : count === 0 ? (
        <span className="text-slate">{t.goLive.checkNotEligible}</span>
      ) : (
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold">{missingText}</span>
          <ul
            aria-label={missingText}
            className="flex flex-col items-end gap-0.5 text-xs text-slate"
          >
            {readiness.missing.map((item) => (
              <li key={missingItemKey(item)}>
                {missingItemLabel(item, t, locale)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Row>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
