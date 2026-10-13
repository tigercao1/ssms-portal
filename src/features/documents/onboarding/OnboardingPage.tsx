import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Button, Card, Spinner } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { localizeField } from '@/i18n/core/localize';
import { formatDate } from '@/lib/date';
import { cn } from '@/lib/cn';
import { certificationLabel } from '@/features/instructor/certLabels';
import type {
  CertState,
  CertificationChecklistItem,
  ChecklistItem,
  DocumentChecklistItem,
} from '../api';
import { CertUploadSheet } from './CertUploadSheet';
import { ProgressBar } from './ProgressBar';
import { StatePill, type PillTone } from './StatePill';
import { checklistProgress, isItemDone, useMyChecklist } from './queries';

const CERT_TONE: Record<CertState, PillTone> = {
  missing: 'muted',
  pending: 'info',
  valid: 'done',
  expiring: 'warn',
  expired: 'bad',
  rejected: 'bad',
};

export function certStateLabel(state: CertState, t: Messages): string {
  switch (state) {
    case 'missing':
      return t.onboarding.certMissing;
    case 'pending':
      return t.onboarding.certPending;
    case 'valid':
      return t.onboarding.certValid;
    case 'expiring':
      return t.onboarding.certExpiring;
    case 'expired':
      return t.onboarding.certExpired;
    case 'rejected':
      return t.onboarding.certRejected;
  }
}

function Row({
  done,
  title,
  subtitle,
  pill,
  action,
  children,
}: {
  done: boolean;
  title: string;
  subtitle: string;
  pill: ReactNode;
  action: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-grey/60 py-3 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          'grid h-6 w-6 flex-none place-items-center rounded-full border-2 text-xs text-white',
          done ? 'border-status-approved bg-status-approved' : 'border-grey',
        )}
      >
        {done ? '✓' : ''}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 sm:flex-1">
          <p className="font-medium text-ink">{title}</p>
          <p className="text-xs text-slate">{subtitle}</p>
          {children}
        </div>
        {pill}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </li>
  );
}

function DocumentRow({ item }: { item: DocumentChecklistItem }) {
  const t = useT();
  const { locale } = useLocale();
  const title = localizeField(item.titleEn, item.titleZh, locale);
  const kind =
    item.kind === 'read' ? t.onboarding.kindRead : t.onboarding.kindSign;
  const status =
    item.status === 'completed'
      ? t.onboarding.statusCompleted
      : item.status === 'viewed'
        ? t.onboarding.statusViewed
        : t.onboarding.statusAssigned;
  const tone: PillTone =
    item.status === 'completed'
      ? 'done'
      : item.status === 'viewed'
        ? 'warn'
        : 'muted';
  const actionLabel =
    item.status === 'completed'
      ? t.onboarding.actionOpen
      : item.status === 'viewed'
        ? t.onboarding.actionContinue
        : item.kind === 'read'
          ? t.onboarding.actionRead
          : t.onboarding.actionSign;
  const subtitle = [
    kind,
    !item.required ? t.onboarding.optional : null,
    item.dueAt && item.status !== 'completed'
      ? t.onboarding.dueBy.replace('{date}', formatDate(item.dueAt, locale))
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Row
      done={item.status === 'completed'}
      title={title}
      subtitle={subtitle}
      pill={<StatePill tone={tone} label={status} />}
      action={
        <Link
          to={`/onboarding/${item.assignmentId}`}
          aria-label={`${actionLabel}: ${title}`}
          className={cn(
            'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium',
            item.status === 'completed'
              ? 'text-navy hover:bg-navy-tint'
              : 'border border-navy text-navy hover:bg-navy-tint',
          )}
        >
          {actionLabel}
        </Link>
      }
    />
  );
}

function CertRow({
  item,
  onUpload,
}: {
  item: CertificationChecklistItem;
  onUpload: (item: CertificationChecklistItem, label: string) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const label = certificationLabel({ ...item, isPartial: false }, t);
  const needsUpload =
    item.state === 'missing' ||
    item.state === 'expired' ||
    item.state === 'rejected';
  const canReplace = item.state === 'expiring';
  return (
    <Row
      done={isItemDone(item)}
      title={label}
      subtitle={
        item.validUntil
          ? t.onboarding.validUntilOn.replace(
              '{date}',
              formatDate(`${item.validUntil}T00:00:00`, locale),
            )
          : t.onboarding.kindCert
      }
      pill={
        <StatePill
          tone={CERT_TONE[item.state]}
          label={certStateLabel(item.state, t)}
        />
      }
      action={
        needsUpload || canReplace ? (
          <Button
            size="sm"
            variant={needsUpload ? 'secondary' : 'ghost'}
            aria-label={`${item.state === 'missing' ? t.onboarding.actionUpload : t.onboarding.actionReupload}: ${label}`}
            onClick={() => onUpload(item, label)}
          >
            {item.state === 'missing'
              ? t.onboarding.actionUpload
              : t.onboarding.actionReupload}
          </Button>
        ) : null
      }
    >
      {item.state === 'rejected' && item.reviewNote && (
        <p className="mt-1 text-xs text-status-rejected">
          {t.onboarding.reviewNote.replace('{note}', item.reviewNote)}
        </p>
      )}
    </Row>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="font-body text-xs font-semibold uppercase tracking-wide text-slate">
        {title}
      </h2>
      <ul>{children}</ul>
    </section>
  );
}

/** The instructor's onboarding checklist: documents to read and sign, certifications to upload. */
export function OnboardingPage() {
  const t = useT();
  const { data, isLoading, isError, refetch } = useMyChecklist();
  const [uploading, setUploading] = useState<{
    item: CertificationChecklistItem;
    label: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-7 w-7" />
      </div>
    );
  if (isError || !data)
    return (
      <Card>
        <Banner tone="error">{t.onboarding.loadFailed}</Banner>
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

  const items: ChecklistItem[] = data.items;
  const docs = items.filter(
    (i): i is DocumentChecklistItem => i.type === 'document',
  );
  const reads = docs.filter((d) => d.kind === 'read');
  const signs = docs.filter((d) => d.kind === 'sign');
  const certs = items.filter(
    (i): i is CertificationChecklistItem => i.type === 'certification',
  );
  const { done, total } = checklistProgress(items);
  const progress = t.onboarding.progress
    .replace('{done}', String(done))
    .replace('{total}', String(total));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">
        {data.season
          ? t.onboarding.seasonTitle.replace('{season}', data.season)
          : t.onboarding.title}
      </h1>
      {notice && <Banner tone="approved">{notice}</Banner>}
      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-navy">{progress}</p>
          <ProgressBar done={done} total={total} label={progress} />
          {total > 0 && done === total && (
            <p className="text-sm text-slate">{t.onboarding.allDone}</p>
          )}
        </div>
        {items.length === 0 && (
          <p className="text-sm text-slate">{t.onboarding.empty}</p>
        )}
        {reads.length > 0 && (
          <Section title={t.onboarding.sectionRead}>
            {reads.map((item) => (
              <DocumentRow key={item.assignmentId} item={item} />
            ))}
          </Section>
        )}
        {signs.length > 0 && (
          <Section title={t.onboarding.sectionSign}>
            {signs.map((item) => (
              <DocumentRow key={item.assignmentId} item={item} />
            ))}
          </Section>
        )}
        {certs.length > 0 && (
          <Section title={t.onboarding.sectionCerts}>
            {certs.map((item) => (
              <CertRow
                key={`${item.org}:${item.track}`}
                item={item}
                onUpload={(i, label) => {
                  setNotice(null);
                  setUploading({ item: i, label });
                }}
              />
            ))}
          </Section>
        )}
      </Card>
      {uploading && (
        <CertUploadSheet
          open
          org={uploading.item.org}
          track={uploading.item.track}
          certLabel={uploading.label}
          onClose={() => setUploading(null)}
          onUploaded={() => {
            setUploading(null);
            setNotice(t.onboarding.uploadDone);
          }}
        />
      )}
    </div>
  );
}
