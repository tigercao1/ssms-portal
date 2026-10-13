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
    <li className="flex flex-wrap items-center gap-3 border-b border-grey/60 py-3 last:border-b-0">
      <span
        aria-hidden
        className={cn(
          'grid h-6 w-6 flex-none place-items-center rounded-full border-2 text-xs text-white',
          done ? 'border-status-approved bg-status-approved' : 'border-grey',
        )}
      >
        {done ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-[1_1_12rem]">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-xs text-slate">{subtitle}</p>
        {children}
      </div>
      {pill}
      <div className="ml-auto">{action}</div>
    </li>
  );
}

function DocumentRow({ item }: { item: DocumentChecklistItem }) {
  const t = useT();
  const { locale } = useLocale();
  const { assignment, template } = item;
  const title = localizeField(template.titleEn, template.titleZh, locale);
  const kind = template.kind === 'read' ? t.onboarding.kindRead : t.onboarding.kindSign;
  const status =
    assignment.status === 'completed'
      ? t.onboarding.statusCompleted
      : assignment.status === 'viewed'
        ? t.onboarding.statusViewed
        : t.onboarding.statusAssigned;
  const tone: PillTone =
    assignment.status === 'completed' ? 'done' : assignment.status === 'viewed' ? 'warn' : 'muted';
  const actionLabel =
    assignment.status === 'completed'
      ? t.onboarding.actionOpen
      : assignment.status === 'viewed'
        ? t.onboarding.actionContinue
        : template.kind === 'read'
          ? t.onboarding.actionRead
          : t.onboarding.actionSign;
  const subtitle = [
    kind,
    template.required === false ? t.onboarding.optional : null,
    assignment.dueAt && assignment.status !== 'completed'
      ? t.onboarding.dueBy.replace('{date}', formatDate(assignment.dueAt, locale))
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Row
      done={assignment.status === 'completed'}
      title={title}
      subtitle={subtitle}
      pill={<StatePill tone={tone} label={status} />}
      action={
        <Link
          to={`/onboarding/${assignment.id}`}
          aria-label={`${actionLabel}: ${title}`}
          className={cn(
            'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium',
            assignment.status === 'completed'
              ? 'border border-navy text-navy hover:bg-navy-tint'
              : 'bg-red text-white hover:bg-red-press',
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
  const needsUpload = item.state === 'missing' || item.state === 'expired' || item.state === 'rejected';
  const canReplace = item.state === 'expiring';
  return (
    <Row
      done={isItemDone(item)}
      title={label}
      subtitle={
        item.validUntil
          ? t.onboarding.validUntilOn.replace('{date}', formatDate(`${item.validUntil}T00:00:00`, locale))
          : t.onboarding.kindCert
      }
      pill={<StatePill tone={CERT_TONE[item.state]} label={certStateLabel(item.state, t)} />}
      action={
        needsUpload || canReplace ? (
          <Button
            size="sm"
            variant={needsUpload ? 'primary' : 'secondary'}
            aria-label={`${item.state === 'missing' ? t.onboarding.actionUpload : t.onboarding.actionReupload}: ${label}`}
            onClick={() => onUpload(item, label)}
          >
            {item.state === 'missing' ? t.onboarding.actionUpload : t.onboarding.actionReupload}
          </Button>
        ) : null
      }
    >
      {item.state === 'rejected' && item.upload?.reviewNote && (
        <p className="mt-1 text-xs text-status-rejected">
          {t.onboarding.reviewNote.replace('{note}', item.upload.reviewNote)}
        </p>
      )}
    </Row>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate">{title}</h2>
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
        <Button className="mt-4" variant="secondary" size="sm" onClick={() => void refetch()}>
          {t.common.retry}
        </Button>
      </Card>
    );

  const items: ChecklistItem[] = data.items;
  const docs = items.filter((i): i is DocumentChecklistItem => i.type === 'document');
  const reads = docs.filter((d) => d.template.kind === 'read');
  const signs = docs.filter((d) => d.template.kind === 'sign');
  const certs = items.filter((i): i is CertificationChecklistItem => i.type === 'certification');
  const { done, total } = checklistProgress(items);
  const progress = t.onboarding.progress
    .replace('{done}', String(done))
    .replace('{total}', String(total));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">
        {data.season ? t.onboarding.seasonTitle.replace('{season}', data.season) : t.onboarding.title}
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
        {items.length === 0 && <p className="text-sm text-slate">{t.onboarding.empty}</p>}
        {reads.length > 0 && (
          <Section title={t.onboarding.sectionRead}>
            {reads.map((item) => (
              <DocumentRow key={item.assignment.id} item={item} />
            ))}
          </Section>
        )}
        {signs.length > 0 && (
          <Section title={t.onboarding.sectionSign}>
            {signs.map((item) => (
              <DocumentRow key={item.assignment.id} item={item} />
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
