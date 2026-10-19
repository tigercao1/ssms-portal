import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Locale, Messages } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/date';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Modal,
  Pager,
  Spinner,
  Textarea,
} from '@/components';
import {
  getCertUploadUrl,
  type CertUploadReviewItem,
  type DocumentReviewFilter,
  type DocumentReviewInstructor,
  type DocumentReviewItem,
} from '../../api';
import {
  DOCUMENT_REVIEW_PAGE_SIZE,
  useCertUploadUrl,
  useDocumentReviews,
  useReviewCertUpload,
} from '../hooks';
import { ReviewStatusChip } from '../badges';
import { errorText, formatDay } from '../format';
import { certName, openPresigned } from '../InstructorDocumentsSection';

const FILTERS: DocumentReviewFilter[] = ['pending', 'decided'];

interface ReviewUpdate {
  status?: DocumentReviewFilter;
  page?: number;
}

function filterFrom(params: URLSearchParams): DocumentReviewFilter {
  return params.get('status') === 'decided' ? 'decided' : 'pending';
}

function pageFrom(params: URLSearchParams): number {
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 1 ? page : 1;
}

export function reviewInstructorName(
  instructor: DocumentReviewInstructor,
  locale: Locale,
): string {
  const full = [instructor.firstName, instructor.lastName]
    .filter(Boolean)
    .join(' ');
  return (
    localizeField(instructor.displayNameEn, instructor.displayNameZh, locale) ||
    full ||
    instructor.email
  );
}

const TYPE_LABEL_KEYS: Record<
  DocumentReviewItem['type'],
  keyof Messages['documentReview']
> = {
  certification_upload: 'typeCertificationUpload',
};

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );
}

export function DocumentReviewPage() {
  const t = useT();
  const r = t.documentReview;
  const [params, setParams] = useSearchParams();
  const filter = filterFrom(params);
  const page = pageFrom(params);
  const [notice, setNotice] = useState<string | null>(null);
  const reviews = useDocumentReviews({
    status: filter,
    page,
    limit: DOCUMENT_REVIEW_PAGE_SIZE,
  });
  const items = reviews.data?.items ?? [];
  const total = reviews.data?.total ?? 0;
  const shownPage = reviews.data?.page ?? page;
  const busy = reviews.isPlaceholderData;
  const fresh = reviews.data && !busy ? reviews.data : undefined;
  const lastPage = fresh
    ? Math.max(1, Math.ceil(fresh.total / DOCUMENT_REVIEW_PAGE_SIZE))
    : page;

  const update = useCallback(
    (next: ReviewUpdate) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next.status !== undefined) {
            if (next.status === 'decided') out.set('status', next.status);
            else out.delete('status');
            out.delete('page');
          }
          if (next.page !== undefined) {
            if (next.page > 1) out.set('page', String(next.page));
            else out.delete('page');
          }
          return out;
        },
        { replace: next.page === undefined },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (fresh && fresh.items.length === 0 && lastPage < page) {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (lastPage > 1) out.set('page', String(lastPage));
          else out.delete('page');
          return out;
        },
        { replace: true },
      );
    }
  }, [fresh, lastPage, page, setParams]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl">{r.title}</h1>
        <p className="max-w-3xl text-slate">{r.intro}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="group"
          aria-label={r.filterLabel}
          className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-navy sm:inline-grid sm:w-fit"
        >
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => {
                if (f !== filter) update({ status: f });
                setNotice(null);
              }}
              className={cn(
                'min-h-11 px-4 py-1 text-sm leading-tight transition-colors',
                f === 'decided' && 'border-l border-navy',
                filter === f
                  ? 'bg-navy text-white'
                  : 'text-navy hover:bg-navy-tint',
              )}
            >
              {f === 'pending' ? r.filterPending : r.filterDecided}
            </button>
          ))}
        </div>
        {filter === 'decided' && (
          <p className="text-sm text-slate">{r.decidedHint}</p>
        )}
      </div>

      {notice && <Banner tone="approved">{notice}</Banner>}

      {reviews.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : reviews.isError ? (
        <Banner tone="error">
          {errorText(reviews.error, t.errors.generic)}
        </Banner>
      ) : items.length === 0 && page === 1 ? (
        <EmptyState
          title={filter === 'pending' ? r.emptyPending : r.emptyDecided}
        >
          {filter === 'pending' ? r.emptyPendingBody : r.emptyDecidedBody}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <ul
            aria-label={r.listLabel}
            aria-busy={busy}
            data-private
            className={cn(
              'flex flex-col gap-4 transition-opacity',
              busy && 'opacity-60',
            )}
          >
            {items.map((item) => (
              <CertUploadReviewCard
                key={`${item.type}:${item.id}`}
                item={item}
                onDecided={setNotice}
              />
            ))}
          </ul>
          <Card className="p-0">
            <Pager
              page={page}
              shownPage={shownPage}
              pageSize={DOCUMENT_REVIEW_PAGE_SIZE}
              count={items.length}
              total={total}
              busy={busy}
              onPage={(next) => update({ page: next })}
              text={{
                label: r.pagination,
                showing: r.showing,
                previous: r.prevPage,
                next: r.nextPage,
              }}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function CertUploadReviewCard({
  item,
  onDecided,
}: {
  item: CertUploadReviewItem;
  onDecided: (notice: string) => void;
}) {
  const t = useT();
  const r = t.documentReview;
  const { locale } = useLocale();
  const review = useReviewCertUpload(item.instructor.id);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const upload = item.certificationUpload;
  const name = reviewInstructorName(item.instructor, locale);
  const type = r[TYPE_LABEL_KEYS[item.type]];
  const pending = item.reviewStatus === 'pending';
  const trimmedReason = reason.trim();

  function decide(reviewStatus: 'approved' | 'rejected') {
    review.mutate(
      {
        id: item.id,
        reviewStatus,
        ...(reviewStatus === 'rejected' && { reviewNote: trimmedReason }),
      },
      {
        onSuccess: () =>
          onDecided(
            fill(
              reviewStatus === 'approved' ? r.approvedNotice : r.rejectedNotice,
              { type, name },
            ),
          ),
      },
    );
  }

  return (
    <li aria-label={`${type} · ${name}`}>
      <Card className="flex flex-col gap-4 sm:flex-row">
        <FilePreview item={item} name={name} type={type} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{type}</span>
            <ReviewStatusChip status={item.reviewStatus} />
            {!upload.current && (
              <span className="text-xs text-slate">{r.superseded}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-lg text-ink">{name}</span>
            <Link
              to={`/admin/instructors/${encodeURIComponent(item.instructor.id)}`}
              className="text-sm text-navy hover:underline"
            >
              {r.openInstructor}
            </Link>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm text-slate sm:grid-cols-2">
            <div>
              <dt className="inline">{t.profile.certifications}: </dt>
              <dd className="inline text-ink">
                {certName(upload.org, upload.track, t)}
                {item.level !== null && ` · ${t.profile.level} ${item.level}`}
              </dd>
            </div>
            <div>
              <dt className="inline">{t.documents.validThrough}: </dt>
              <dd className="inline text-ink">
                {formatDay(upload.validUntil, locale)}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-slate">
            {r.submittedOn.replace(
              '{date}',
              formatDate(item.submittedAt, locale),
            )}
            {item.reviewedAt &&
              ` · ${r.decidedOn.replace('{date}', formatDate(item.reviewedAt, locale))}`}
          </p>
          {!pending && item.reviewNote && (
            <p className="text-sm text-ink">
              {t.documents.reviewNote}: {item.reviewNote}
            </p>
          )}

          {pending && !rejecting && (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={review.isPending}
                onClick={() => decide('approved')}
              >
                {t.documents.approve}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={review.isPending}
                onClick={() => {
                  review.reset();
                  setRejecting(true);
                }}
              >
                {t.documents.reject}
              </Button>
            </div>
          )}

          {pending && rejecting && (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-navy">
                {r.rejectReason}
                <Textarea
                  rows={2}
                  value={reason}
                  aria-describedby={`reject-hint-${item.id}`}
                  onChange={(e) => {
                    setReason(e.target.value);
                    review.reset();
                  }}
                />
              </label>
              <p id={`reject-hint-${item.id}`} className="text-xs text-slate">
                {trimmedReason
                  ? r.rejectReasonHint
                  : t.documents.rejectNeedsNote}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  loading={review.isPending}
                  disabled={!trimmedReason}
                  onClick={() => decide('rejected')}
                >
                  {r.confirmReject}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={review.isPending}
                  onClick={() => {
                    setRejecting(false);
                    review.reset();
                  }}
                >
                  {t.common.cancel}
                </Button>
              </div>
            </div>
          )}

          {review.isError && (
            <p role="alert" className="text-xs text-status-rejected">
              {errorText(review.error, t.errors.generic)}
            </p>
          )}
        </div>
      </Card>
    </li>
  );
}

function FilePreview({
  item,
  name,
  type,
}: {
  item: CertUploadReviewItem;
  name: string;
  type: string;
}) {
  const t = useT();
  const r = t.documentReview;
  const [zoomed, setZoomed] = useState(false);
  const [openError, setOpenError] = useState<unknown>(null);
  const deleted = item.reviewStatus === 'rejected';
  const isImage = item.contentType.startsWith('image/');
  const url = useCertUploadUrl(item.id, isImage && !deleted);
  const alt = fill(r.previewAlt, { type, name });

  async function openFullSize() {
    setOpenError(null);
    try {
      await openPresigned(() => getCertUploadUrl(item.id));
    } catch (err) {
      setOpenError(err);
    }
  }

  const frame =
    'flex h-48 w-full shrink-0 items-center justify-center overflow-hidden rounded-md border border-grey/60 bg-sunken sm:w-56';

  if (deleted) {
    return (
      <div className={cn(frame, 'px-4 text-center text-xs text-slate')}>
        {t.documents.fileDeletedAfterReject}
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 sm:w-56">
      {isImage ? (
        url.isLoading ? (
          <div className={frame}>
            <Spinner />
          </div>
        ) : url.data ? (
          <button
            type="button"
            className={cn(frame, 'cursor-zoom-in')}
            aria-label={fill(r.enlarge, { type, name })}
            onClick={() => setZoomed(true)}
          >
            <img
              src={url.data.url}
              alt={alt}
              className="h-full w-full object-contain"
            />
          </button>
        ) : (
          <div className={cn(frame, 'px-4 text-center text-xs text-slate')}>
            {r.previewFailed}
          </div>
        )
      ) : (
        <div className={cn(frame, 'flex-col gap-1 text-slate')}>
          <span className="text-2xl font-medium">PDF</span>
          <span className="text-xs">{r.pdfFile}</span>
        </div>
      )}
      <Button size="sm" variant="secondary" onClick={openFullSize}>
        {isImage ? r.openFullSize : r.openPdf}
      </Button>
      {openError !== null && (
        <p role="alert" className="text-xs text-status-rejected">
          {errorText(openError, t.errors.generic)}
        </p>
      )}
      {zoomed && url.data && (
        <Modal
          title={alt}
          size="lg"
          privateTitle
          onClose={() => setZoomed(false)}
        >
          <div data-private className="flex justify-center">
            <img
              src={url.data.url}
              alt={alt}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
