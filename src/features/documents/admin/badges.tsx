import { useT } from '@/i18n/core/I18nProvider';
import { cn } from '@/lib/cn';
import { languageName } from './format';
import type {
  AssignmentStatus,
  CertState,
  DocumentLanguage,
  ReviewStatus,
  TemplateKind,
  TemplateStatus,
} from '../api';

type Tone = 'neutral' | 'pending' | 'approved' | 'rejected' | 'navy';

const TONE: Record<Tone, { border: string; dot: string }> = {
  neutral: { border: 'border-grey', dot: 'bg-grey' },
  pending: { border: 'border-status-pending', dot: 'bg-status-pending' },
  approved: { border: 'border-status-approved', dot: 'bg-status-approved' },
  rejected: { border: 'border-status-rejected', dot: 'bg-status-rejected' },
  navy: { border: 'border-navy', dot: 'bg-navy' },
};

/** Small status chip with a coloured rule, matching the portal's status pills. */
export function Chip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] bg-sunken px-2 py-0.5 text-xs font-medium text-ink',
        TONE[tone].border,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', TONE[tone].dot)}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: TemplateKind }) {
  const t = useT();
  return (
    <span className="whitespace-nowrap rounded-sm bg-navy-tint px-2 py-0.5 text-xs font-medium text-navy">
      {kind === 'sign' ? t.documents.kindSign : t.documents.kindRead}
    </span>
  );
}

export function LanguageBadges({
  languages,
}: {
  languages: readonly DocumentLanguage[];
}) {
  const t = useT();
  if (languages.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {languages.map((language) => (
        <span
          key={language}
          title={languageName(language, t)}
          className="whitespace-nowrap rounded-sm border border-grey px-1.5 py-0.5 text-xs font-medium text-slate"
        >
          {language === 'zh' ? t.documents.badgeZh : t.documents.badgeEn}
        </span>
      ))}
    </span>
  );
}

export function TemplateStatusChip({ status }: { status: TemplateStatus }) {
  const t = useT();
  const map: Record<TemplateStatus, [Tone, string]> = {
    draft: ['navy', t.documents.templateStatusDraft],
    live: ['approved', t.documents.templateStatusLive],
    retired: ['neutral', t.documents.templateStatusRetired],
  };
  const [tone, label] = map[status];
  return <Chip tone={tone} label={label} />;
}

export function AssignmentStatusChip({ status }: { status: AssignmentStatus }) {
  const t = useT();
  const map: Record<AssignmentStatus, [Tone, string]> = {
    assigned: ['neutral', t.documents.statusAssigned],
    viewed: ['pending', t.documents.statusViewed],
    completed: ['approved', t.documents.statusCompleted],
    archived: ['neutral', t.documents.statusArchived],
  };
  const [tone, label] = map[status];
  return <Chip tone={tone} label={label} />;
}

export function ReviewStatusChip({ status }: { status: ReviewStatus }) {
  const t = useT();
  const map: Record<ReviewStatus, [Tone, string]> = {
    pending: ['pending', t.documents.reviewPending],
    approved: ['approved', t.documents.reviewApproved],
    rejected: ['rejected', t.documents.reviewRejected],
  };
  const [tone, label] = map[status];
  return <Chip tone={tone} label={label} />;
}

/** Shown only when a cert needs attention for its date. */
export function ExpiryBadge({ state }: { state: CertState }) {
  const t = useT();
  if (state === 'expired')
    return (
      <span className="whitespace-nowrap rounded-sm bg-red-tint px-2 py-0.5 text-xs font-medium text-red">
        {t.documents.certExpired}
      </span>
    );
  if (state === 'expiring')
    return (
      <span className="whitespace-nowrap rounded-sm bg-status-pending/15 px-2 py-0.5 text-xs font-medium text-ink">
        {t.documents.certExpiring}
      </span>
    );
  return null;
}
