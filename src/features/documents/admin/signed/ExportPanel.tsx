import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { formatDateTime } from '@/lib/date';
import { Banner, Button, Card, Spinner } from '@/components';
import {
  downloadPresigned,
  getDocumentExportUrl,
  type DocumentExport,
  type DocumentExportStatus,
} from '../../api';
import {
  useCompletedCount,
  useCreateDocumentExport,
  useDocumentExportPolling,
  useDocumentExports,
} from '../hooks';
import { Chip } from '../badges';
import { errorText, formatBytes } from '../format';

export const MAX_EXPORT_FILES = 1000;

/** Starts ZIP exports of a sign template's signed copies and lists recent ones. */
export function ExportPanel({
  templateId,
  season,
  selected,
  onClearSelection,
}: {
  templateId: string;
  season: string;
  selected: Set<string>;
  onClearSelection: () => void;
}) {
  const t = useT();
  const s = t.signedCopies;
  const completed = useCompletedCount(templateId, season || undefined);
  const exports = useDocumentExports(templateId);
  const create = useCreateDocumentExport(templateId);
  const allCount = completed.data ?? 0;
  const tooManyAll = allCount > MAX_EXPORT_FILES;
  const tooManySelected = selected.size > MAX_EXPORT_FILES;

  function start(ids?: string[]) {
    create.mutate(
      {
        ...(season && { season }),
        ...(ids && { assignmentIds: ids }),
      },
      { onSuccess: () => ids && onClearSelection() },
    );
  }

  return (
    <Card className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg">{s.exportTitle}</h2>
          <p className="text-sm text-slate">{s.exportBody}</p>
          <p className="text-sm text-slate">
            {season
              ? s.exportScopeSeason.replace('{season}', season)
              : s.exportScopeAllSeasons}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={
              selected.size === 0 || tooManySelected || create.isPending
            }
            onClick={() => start([...selected])}
          >
            {s.exportSelected.replace('{n}', String(selected.size))}
          </Button>
          <Button
            variant="primary"
            disabled={
              !completed.isSuccess ||
              allCount === 0 ||
              tooManyAll ||
              create.isPending
            }
            loading={create.isPending}
            onClick={() => start()}
          >
            {s.exportAll.replace('{n}', String(allCount))}
          </Button>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
            <span>{s.selectedCount.replace('{n}', String(selected.size))}</span>
            <Button size="sm" variant="ghost" onClick={onClearSelection}>
              {s.clearSelection}
            </Button>
          </div>
        )}
        {(tooManyAll || tooManySelected) && (
          <p className="text-sm text-slate">
            {s.exportTooMany.replace('{max}', String(MAX_EXPORT_FILES))}
          </p>
        )}
        {completed.isSuccess && allCount === 0 && (
          <p className="text-sm text-slate">{s.exportNothing}</p>
        )}
        {create.isError && (
          <Banner tone="error">
            {s.exportFailedToStart.replace(
              '{reason}',
              errorText(create.error, t.errors.generic),
            )}
          </Banner>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-grey/60 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <h3 className="text-base font-semibold text-ink">{s.recentTitle}</h3>
        {exports.isLoading ? (
          <Spinner />
        ) : exports.isError ? (
          <Banner tone="error">
            {errorText(exports.error, t.errors.generic)}
          </Banner>
        ) : (exports.data ?? []).length === 0 ? (
          <p className="text-sm text-slate">{s.recentEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-grey/40">
            {(exports.data ?? []).map((e) => (
              <ExportItem key={e.id} exp={e} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function statusLabel(
  status: DocumentExportStatus,
  s: Messages['signedCopies'],
) {
  return {
    queued: s.exportStatusQueued,
    running: s.exportStatusRunning,
    ready: s.exportStatusReady,
    failed: s.exportStatusFailed,
    expired: s.exportStatusExpired,
  }[status];
}

const STATUS_TONE = {
  queued: 'neutral',
  running: 'pending',
  ready: 'approved',
  failed: 'rejected',
  expired: 'neutral',
} as const;

function ExportItem({ exp }: { exp: DocumentExport }) {
  const t = useT();
  const s = t.signedCopies;
  const { locale } = useLocale();
  useDocumentExportPolling(exp);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const requested = formatDateTime(exp.requestedAt, locale);
  const scope = [
    exp.selectedCount !== null
      ? s.scopeSelected.replace('{n}', String(exp.selectedCount))
      : s.scopeAll,
    exp.season,
  ]
    .filter(Boolean)
    .join(' · ');

  async function download() {
    setError(null);
    setPending(true);
    try {
      await downloadPresigned(() => getDocumentExportUrl(exp.id));
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  return (
    <li
      className="flex flex-col gap-1 py-3"
      aria-label={s.requestedAt.replace('{time}', requested)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Chip
          tone={STATUS_TONE[exp.status]}
          label={statusLabel(exp.status, s)}
        />
        <span className="text-xs text-slate">
          {s.requestedAt.replace('{time}', requested)}
        </span>
      </div>
      <p className="text-sm text-ink">{scope}</p>
      <p className="text-xs text-slate" aria-live="polite">
        {progressText(exp, s, locale)}
      </p>
      {exp.status === 'ready' && (
        <div>
          <Button
            size="sm"
            variant="secondary"
            loading={pending}
            aria-label={s.downloadZipFor.replace('{time}', requested)}
            onClick={download}
          >
            {s.downloadZip}
          </Button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-xs text-status-rejected">
          {s.downloadZipFailed.replace(
            '{reason}',
            errorText(error, t.errors.generic),
          )}
        </p>
      )}
    </li>
  );
}

function progressText(
  exp: DocumentExport,
  s: Messages['signedCopies'],
  locale: Parameters<typeof formatDateTime>[1],
): string {
  switch (exp.status) {
    case 'queued':
      return s.progressQueued;
    case 'running':
      return s.progressRunning;
    case 'failed':
      return exp.error
        ? s.failedDetail.replace('{error}', exp.error)
        : s.failedUnknown;
    case 'expired':
      return s.expiredDetail;
    case 'ready':
      return [
        s.readyDetail
          .replace('{files}', String(exp.fileCount ?? 0))
          .replace('{size}', formatBytes(exp.sizeBytes ?? 0, locale)),
        exp.skippedCount
          ? s.skippedDetail.replace('{n}', String(exp.skippedCount))
          : null,
        exp.expiresAt
          ? s.expiresAt.replace('{time}', formatDateTime(exp.expiresAt, locale))
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
  }
}
