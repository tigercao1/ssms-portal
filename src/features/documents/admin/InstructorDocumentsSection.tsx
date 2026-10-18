import { useState } from 'react';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { formatDate } from '@/lib/date';
import {
  certificationLabel,
  trackLabel,
} from '@/features/instructor/certLabels';
import { CertVerificationPill } from '@/features/instructor/goLive';
import { currentSeasonKey, useSeasons } from '@/features/reference/api';
import type {
  ApprovalStatus,
  CertOrg,
  CertTrack,
  Certification,
  GoLiveCertification,
} from '@/lib/types';
import {
  Banner,
  Button,
  Card,
  Input,
  RowActions,
  Spinner,
  Textarea,
} from '@/components';
import { formatBytes } from '@/features/admin/PageParts';
import {
  downloadPresigned,
  getAssignmentSignedUrl,
  getCertUploadUrl,
  type Assignment,
  type CertUpload,
  type TemplateSummary,
} from '../api';
import {
  useArchiveAssignment,
  useInstructorDocuments,
  useRemindAssignment,
  useReviewCertUpload,
  useTemplates,
} from './hooks';
import {
  AssignmentStatusChip,
  Chip,
  ExpiryBadge,
  KindBadge,
  ReviewStatusChip,
} from './badges';
import { AssignToInstructorDialog } from './AssignToInstructorDialog';
import {
  errorText,
  formatDay,
  languageName,
  shortHash,
  templateTitle,
} from './format';

const ORG_LABEL: Record<CertOrg, string> = { csia: 'CSIA', casi: 'CASI' };

export function certName(org: CertOrg, track: CertTrack, t: Messages): string {
  return track === 'regular'
    ? ORG_LABEL[org]
    : `${ORG_LABEL[org]} ${trackLabel(track, t)}`;
}

/**
 * Opens a presigned file in a new tab. The tab is opened before the URL is
 * fetched so popup blockers treat it as user-initiated.
 */
export async function openPresigned(get: () => Promise<{ url: string }>) {
  const tab = window.open('about:blank', '_blank');
  try {
    const { url } = await get();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.location.assign(url);
    }
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** Documents and certification uploads for one instructor, on the admin detail page. */
export function InstructorDocumentsSection({
  instructorId,
  instructorName,
  approvalStatus,
  certifications,
  certStatuses,
}: {
  instructorId: string;
  instructorName: string;
  approvalStatus: ApprovalStatus;
  certifications: Pick<Certification, 'org' | 'track' | 'level'>[];
  certStatuses?: readonly GoLiveCertification[];
}) {
  const t = useT();
  const docs = useInstructorDocuments(instructorId);
  const templates = useTemplates();

  return (
    <section
      className="flex flex-col gap-6"
      aria-label={t.documents.sectionTitle}
    >
      {docs.isLoading || templates.isLoading ? (
        <Card className="flex justify-center">
          <Spinner />
        </Card>
      ) : docs.isError || !docs.data ? (
        <Card>
          <Banner tone="error">
            {errorText(docs.error, t.errors.generic)}
          </Banner>
        </Card>
      ) : (
        <>
          <DocumentsCard
            instructorId={instructorId}
            instructorName={instructorName}
            approved={approvalStatus === 'approved'}
            assignments={docs.data.assignments}
            templates={templates.data ?? []}
          />
          <CertificationsCard
            instructorId={instructorId}
            uploads={docs.data.certificationUploads}
            certifications={certifications}
            certStatuses={certStatuses}
          />
        </>
      )}
    </section>
  );
}

function DocumentsCard({
  instructorId,
  instructorName,
  approved,
  assignments,
  templates,
}: {
  instructorId: string;
  instructorName: string;
  approved: boolean;
  assignments: Assignment[];
  templates: TemplateSummary[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const season = currentSeasonKey(useSeasons().data);
  const [showArchived, setShowArchived] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigned, setAssigned] = useState<TemplateSummary | null>(null);
  const visible = assignments
    .filter((a) => showArchived || a.status !== 'archived')
    .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
  const archivedCount = assignments.filter(
    (a) => a.status === 'archived',
  ).length;
  const open = assignments.filter((a) => a.status !== 'archived');
  const missing = templates.filter(
    (tpl) =>
      tpl.status === 'live' &&
      tpl.required &&
      tpl.audience === 'instructor' &&
      !open.some((a) => a.templateId === tpl.id && a.status === 'completed'),
  );
  const assignable = season
    ? templates.filter(
        (tpl) =>
          tpl.status === 'live' &&
          tpl.audience === 'instructor' &&
          tpl.assignTo !== 'all' &&
          tpl.hasSource &&
          !open.some((a) => a.templateId === tpl.id && a.season === season),
      )
    : [];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">{t.documents.sectionTitle}</h2>
        <span className="text-sm text-slate">
          {t.documents.completedOf
            .replace(
              '{done}',
              String(open.filter((a) => a.status === 'completed').length),
            )
            .replace('{total}', String(open.length))}
        </span>
      </div>

      {!approved && (
        <Banner tone="info">{t.documents.assignedOnApproval}</Banner>
      )}

      {approved && missing.length > 0 && (
        <Banner tone="pending" title={t.documents.missingTitle}>
          {missing.map((tpl) => templateTitle(tpl, locale)).join(' · ')}
        </Banner>
      )}

      {visible.length === 0 ? (
        <p className="text-sm text-slate">{t.documents.noAssignments}</p>
      ) : (
        <ul className="divide-y divide-grey/40">
          {visible.map((a) => (
            <AssignmentRow
              key={a.id}
              instructorId={instructorId}
              assignment={a}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-grey/40 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t.documents.showArchived.replace('{n}', String(archivedCount))}
        </label>
        {approved && assignable.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setAssigned(null);
              setAssigning(true);
            }}
          >
            {t.documents.assignDocument}
          </Button>
        )}
      </div>

      {assigned && (
        <p role="status" className="text-xs text-status-approved">
          {t.documents.assignedDocument.replace(
            '{title}',
            templateTitle(assigned, locale),
          )}
        </p>
      )}

      {assigning && (
        <AssignToInstructorDialog
          instructorId={instructorId}
          instructorName={instructorName}
          season={season}
          templates={assignable}
          onClose={() => setAssigning(false)}
          onAssigned={(tpl) => {
            setAssigning(false);
            setAssigned(tpl);
          }}
        />
      )}
    </Card>
  );
}

function AssignmentRow({
  instructorId,
  assignment: a,
}: {
  instructorId: string;
  assignment: Assignment;
}) {
  const t = useT();
  const { locale } = useLocale();
  const remind = useRemindAssignment(instructorId);
  const archive = useArchiveAssignment(instructorId);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const template = a.template;
  const title = template
    ? templateTitle(template, locale)
    : t.documents.unknownTemplate;
  const isOpen = a.status === 'assigned' || a.status === 'viewed';

  async function download() {
    setDownloadError(null);
    try {
      await downloadPresigned(() => getAssignmentSignedUrl(a.id));
    } catch (err) {
      setDownloadError(err);
    }
  }

  return (
    <li className="flex flex-col gap-2 py-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{title}</span>
        {template && <KindBadge kind={template.kind} />}
        <AssignmentStatusChip status={a.status} />
        {a.season && <span className="text-xs text-slate">{a.season}</span>}
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-xs text-slate sm:grid-cols-3">
        <div>
          <dt className="inline">{t.documents.assignedOn} </dt>
          <dd className="inline text-ink">
            {formatDate(a.assignedAt, locale)}
          </dd>
        </div>
        {a.viewedAt && (
          <div>
            <dt className="inline">{t.documents.viewedOn} </dt>
            <dd className="inline text-ink">
              {formatDate(a.viewedAt, locale)}
            </dd>
          </div>
        )}
        {a.completedAt && (
          <div>
            <dt className="inline">{t.documents.completedOn} </dt>
            <dd className="inline text-ink">
              {formatDate(a.completedAt, locale)}
            </dd>
          </div>
        )}
        {a.reminderSentAt && (
          <div>
            <dt className="inline">{t.documents.remindedOn} </dt>
            <dd className="inline text-ink">
              {formatDate(a.reminderSentAt, locale)}
            </dd>
          </div>
        )}
        {a.signerName && (
          <div>
            <dt className="inline">
              {template?.kind === 'read'
                ? t.documents.acknowledgedBy
                : t.documents.signedAs}{' '}
            </dt>
            <dd className="inline text-ink">{a.signerName}</dd>
          </div>
        )}
        {a.language && (
          <div>
            <dt className="inline">
              {template?.kind === 'read'
                ? t.documents.readInLanguage
                : t.documents.signedInLanguage}{' '}
            </dt>
            <dd className="inline text-ink">{languageName(a.language, t)}</dd>
          </div>
        )}
        {a.signedSha256 && (
          <div>
            <dt className="inline">SHA-256 </dt>
            <dd className="inline font-mono text-ink" title={a.signedSha256}>
              {shortHash(a.signedSha256)}
            </dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <RowActions
          label={t.common.moreActionsFor.replace('{name}', title)}
          items={[
            ...(a.status === 'completed' && a.hasSignedCopy
              ? [
                  {
                    key: 'download',
                    label: t.documents.downloadSigned,
                    onSelect: download,
                  },
                ]
              : []),
            ...(isOpen
              ? [
                  {
                    key: 'remind',
                    label: t.documents.remind,
                    variant: 'ghost' as const,
                    loading: remind.isPending,
                    onSelect: () => remind.mutate(a.id),
                  },
                ]
              : []),
            ...(a.status !== 'archived'
              ? [
                  {
                    key: 'archive',
                    label: t.documents.archive,
                    variant: 'ghost' as const,
                    destructive: true,
                    onSelect: () => setConfirmArchive(true),
                  },
                ]
              : []),
          ]}
        />
        {a.status !== 'archived' && confirmArchive && (
          <span
            role="alertdialog"
            aria-label={t.documents.archiveConfirm}
            className="flex items-center gap-2 text-sm"
          >
            <span>{t.documents.archiveConfirm}</span>
            <Button
              size="sm"
              variant="danger"
              loading={archive.isPending}
              onClick={() =>
                archive.mutate(a.id, {
                  onSuccess: () => setConfirmArchive(false),
                })
              }
            >
              {t.documents.archive}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmArchive(false)}
            >
              {t.common.cancel}
            </Button>
          </span>
        )}
      </div>
      {remind.isSuccess && (
        <p role="status" className="text-xs text-status-approved">
          {t.documents.reminderSent}
        </p>
      )}
      {(remind.isError || archive.isError || downloadError !== null) && (
        <p role="alert" className="text-xs text-status-rejected">
          {errorText(
            remind.error ?? archive.error ?? downloadError,
            t.errors.generic,
          )}
        </p>
      )}
    </li>
  );
}

function CertificationsCard({
  instructorId,
  uploads,
  certifications,
  certStatuses,
}: {
  instructorId: string;
  uploads: CertUpload[];
  certifications: Pick<Certification, 'org' | 'track' | 'level'>[];
  certStatuses?: readonly GoLiveCertification[];
}) {
  const t = useT();
  const [showHistory, setShowHistory] = useState(false);
  const current = uploads
    .filter((u) => u.current)
    .sort(
      (a, b) => a.org.localeCompare(b.org) || a.track.localeCompare(b.track),
    );
  const history = uploads
    .filter((u) => !u.current)
    .sort((a, b) => b.insertedAt.localeCompare(a.insertedAt));
  const missing = certifications.filter(
    (c) => !current.some((u) => u.org === c.org && u.track === c.track),
  );

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg">{t.documents.certsTitle}</h2>
      {certStatuses && certStatuses.length > 0 && (
        <ul
          aria-label={t.profile.certifications}
          className="flex flex-col gap-2"
        >
          {certStatuses.map((c) => (
            <li
              key={`${c.org}:${c.track}:${c.level}`}
              className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink"
            >
              <span>{certificationLabel({ ...c, isPartial: false }, t)}</span>
              <CertVerificationPill cert={c} />
            </li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <Banner tone="pending" title={t.documents.certsMissingTitle}>
          {missing
            .map(
              (c) =>
                `${certName(c.org, c.track, t)} ${t.profile.level} ${c.level}`,
            )
            .join(' · ')}
        </Banner>
      )}
      {current.length === 0 ? (
        <p className="text-sm text-slate">{t.documents.noCertUploads}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {current.map((u) => (
            <CertUploadReviewRow
              key={u.id}
              instructorId={instructorId}
              upload={u}
              level={
                certifications.find(
                  (c) => c.org === u.org && c.track === u.track,
                )?.level
              }
            />
          ))}
        </ul>
      )}
      {history.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-grey/40 pt-3">
          <button
            type="button"
            className="self-start text-sm text-navy hover:underline"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((s) => !s)}
          >
            {t.documents.previousUploads.replace('{n}', String(history.length))}
          </button>
          {showHistory && (
            <ul className="flex flex-col gap-1 text-xs text-slate">
              {history.map((u) => (
                <HistoryRow key={u.id} upload={u} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function HistoryRow({ upload: u }: { upload: CertUpload }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="text-ink">{certName(u.org, u.track, t)}</span>
      <ReviewStatusChip status={u.reviewStatus} />
      <span>
        {t.documents.validThrough}: {formatDay(u.validUntil, locale)}
      </span>
      <span>· {formatDate(u.insertedAt, locale)}</span>
    </li>
  );
}

function CertUploadReviewRow({
  instructorId,
  upload: u,
  level,
}: {
  instructorId: string;
  upload: CertUpload;
  level: number | undefined;
}) {
  const t = useT();
  const { locale } = useLocale();
  const review = useReviewCertUpload(instructorId);
  const [validUntil, setValidUntil] = useState(u.validUntil);
  const [note, setNote] = useState(u.reviewNote ?? '');
  const [viewError, setViewError] = useState<unknown>(null);
  const state = u.state;
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(validUntil);
  const dateChanged = validUntil !== u.validUntil;
  const name = certName(u.org, u.track, t);
  const trimmedNote = note.trim();
  const noteEdited = trimmedNote !== (u.reviewNote ?? '');
  const unchangedApproval =
    u.reviewStatus === 'approved' && !dateChanged && !noteEdited;
  const rejected = u.reviewStatus === 'rejected';

  function submit(reviewStatus: CertUpload['reviewStatus']) {
    if (!dateValid) return;
    review.mutate({
      id: u.id,
      reviewStatus,
      ...(trimmedNote
        ? { reviewNote: trimmedNote }
        : noteEdited && { reviewNote: null }),
      ...(dateChanged && { validUntil }),
    });
  }

  async function view() {
    setViewError(null);
    try {
      await openPresigned(() => getCertUploadUrl(u.id));
    } catch (err) {
      setViewError(err);
    }
  }

  return (
    <li
      aria-label={name}
      className="flex flex-col gap-3 rounded-md border border-grey/60 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">
          {name}
          {level !== undefined && ` · ${t.profile.level} ${level}`}
        </span>
        <ReviewStatusChip status={u.reviewStatus} />
        <ExpiryBadge state={state} />
        {state === 'valid' && (
          <Chip tone="approved" label={t.documents.certValid} />
        )}
      </div>
      <p className="text-xs text-slate">
        {t.documents.uploadedOn.replace(
          '{date}',
          formatDate(u.insertedAt, locale),
        )}
        {' · '}
        {u.contentType
          .replace('application/', '')
          .replace('image/', '')
          .toUpperCase()}
        {' · '}
        {formatBytes(u.sizeBytes)}
        {u.reviewedAt &&
          ` · ${t.documents.reviewedOn.replace('{date}', formatDate(u.reviewedAt, locale))}`}
      </p>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-navy">
          {t.documents.validThrough}
          <Input
            type="date"
            value={validUntil}
            aria-invalid={!dateValid}
            onChange={(e) => {
              setValidUntil(e.target.value);
              review.reset();
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-navy">
          {t.documents.reviewNote}
          <Textarea
            rows={2}
            value={note}
            placeholder={t.documents.reviewNoteHint}
            onChange={(e) => {
              setNote(e.target.value);
              review.reset();
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {rejected ? (
          <p className="self-center text-xs text-slate">
            {t.documents.fileDeletedAfterReject}
          </p>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={view}>
              {t.documents.viewFile}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={
                review.isPending &&
                review.variables?.reviewStatus === 'approved'
              }
              disabled={!dateValid || review.isPending || unchangedApproval}
              onClick={() => submit('approved')}
            >
              {u.reviewStatus === 'approved' && dateChanged
                ? t.documents.saveDate
                : t.documents.approve}
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          loading={
            review.isPending && review.variables?.reviewStatus === 'rejected'
          }
          disabled={!dateValid || review.isPending || !note.trim()}
          title={note.trim() ? undefined : t.documents.rejectNeedsNote}
          onClick={() => submit('rejected')}
        >
          {t.documents.reject}
        </Button>
      </div>
      {review.isSuccess && (
        <p role="status" className="text-xs text-status-approved">
          {t.common.saved}
        </p>
      )}
      {(review.isError || viewError !== null) && (
        <p role="alert" className="text-xs text-status-rejected">
          {errorText(review.error ?? viewError, t.errors.generic)}
        </p>
      )}
    </li>
  );
}
