import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Banner, Button } from '@/components';
import type { AdminClass } from '@/lib/types';
import { useRetrySync, useSyncIssues } from './bookingApi';
import { formatSchoolDateTime } from './bookingRules';
import { hideSyncToast, useSyncToastVisible } from './syncToast';

export function SyncToastHost() {
  const t = useT();
  const visible = useSyncToastVisible();
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md border-l-[3px] border-l-status-pending bg-surface px-4 py-3 text-sm text-ink shadow-pop">
      <p role="status" className="flex-1">
        {t.booking.syncFailedToast}
      </p>
      <button
        type="button"
        className="text-xs text-slate underline"
        onClick={hideSyncToast}
      >
        {t.booking.syncDismiss}
      </button>
    </div>
  );
}

export function SyncBadge({ item }: { item: AdminClass }) {
  const t = useT();
  const retry = useRetrySync();
  if (item.googleSyncStatus !== 'failed') return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span
        title={
          item.googleSyncError
            ? t.booking.syncErrorCode.replace('{code}', item.googleSyncError)
            : undefined
        }
        className="rounded-sm bg-status-pending/15 px-2 py-0.5 text-xs text-ink"
      >
        {t.booking.syncBadge}
      </span>
      <Button
        variant="ghost"
        size="sm"
        loading={retry.isPending}
        onClick={() => retry.mutate(item.id)}
      >
        {t.booking.syncRetry}
      </Button>
    </span>
  );
}

export function SyncIssuesBanner() {
  const t = useT();
  const { locale } = useLocale();
  const issues = useSyncIssues();
  const [open, setOpen] = useState(false);
  const classes = issues.data?.classes ?? [];
  const deletions = issues.data?.deletions ?? [];
  if (classes.length === 0 && deletions.length === 0) return null;
  return (
    <Banner tone="pending" title={t.booking.syncIssuesTitle}>
      <div className="flex flex-col gap-2">
        <p>
          {t.booking.syncIssuesCount.replace('{n}', String(classes.length))}
          {deletions.length > 0 &&
            ` ${t.booking.syncIssuesDeletions.replace('{n}', String(deletions.length))}`}{' '}
          {classes.length > 0 && (
            <button
              type="button"
              aria-expanded={open}
              aria-controls="calendar-sync-issues"
              className="underline"
              onClick={() => setOpen(!open)}
            >
              {open ? t.booking.syncIssuesHide : t.booking.syncIssuesShow}
            </button>
          )}
        </p>
        {open && (
          <ul
            data-private
            id="calendar-sync-issues"
            className="flex flex-col gap-1"
          >
            {classes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span>
                  {formatSchoolDateTime(c.startsAt, locale)} ·{' '}
                  {localizeField(
                    c.instructorName,
                    c.instructorNameZh,
                    locale,
                  ) || '—'}
                </span>
                {c.calendarSyncError && (
                  <span className="text-xs text-slate">
                    {t.booking.syncErrorCode.replace(
                      '{code}',
                      c.calendarSyncError,
                    )}
                  </span>
                )}
                <SyncBadge item={c} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Banner>
  );
}
