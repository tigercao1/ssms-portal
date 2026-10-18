import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Banner, DotPill, type StatusMeta } from '@/components';
import { formatDay } from '@/features/documents/admin/format';
import type { Locale, Messages } from '@/i18n/core/types';
import type {
  CertVerificationStatus,
  GoLiveCertification,
  GoLiveMissingItem,
  GoLiveProfileField,
  GoLiveReadiness,
} from '@/lib/types';

const FIELD_LABEL: Record<
  GoLiveProfileField,
  keyof Pick<
    Messages['goLive'],
    | 'fieldDisplayNameEn'
    | 'fieldBio'
    | 'fieldPhoto'
    | 'fieldLocations'
    | 'fieldLanguages'
    | 'fieldCourseLevels'
  >
> = {
  displayNameEn: 'fieldDisplayNameEn',
  bio: 'fieldBio',
  photo: 'fieldPhoto',
  locations: 'fieldLocations',
  languages: 'fieldLanguages',
  courseLevels: 'fieldCourseLevels',
};

export function missingItemLabel(
  item: GoLiveMissingItem,
  t: Messages,
  locale: Locale,
): string {
  switch (item.group) {
    case 'profile':
      return t.goLive[FIELD_LABEL[item.field]];
    case 'certification':
      return t.goLive.noneVerified;
    case 'onboarding':
      return localizeField(item.titleEn, item.titleZh, locale);
  }
}

export function missingItemKey(item: GoLiveMissingItem): string {
  switch (item.group) {
    case 'profile':
      return `profile:${item.field}`;
    case 'certification':
      return `certification:${item.reason}`;
    case 'onboarding':
      return `onboarding:${item.assignmentId}`;
  }
}

export function profileGapsText(
  missing: readonly GoLiveMissingItem[],
  t: Messages,
  locale: Locale,
): string | null {
  const labels = missing.flatMap((item) => {
    if (item.group !== 'profile') return [];
    const label = t.goLive[FIELD_LABEL[item.field]];
    return [
      locale === 'en'
        ? label.replace(/^(?!English\b)[A-Z]/, (c) => c.toLowerCase())
        : label,
    ];
  });
  if (labels.length === 0) return null;
  const fields = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    labels,
  );
  return t.onboarding.cardProfileGaps.replace('{fields}', fields);
}

export function GoLiveBanner({ readiness }: { readiness: GoLiveReadiness }) {
  const t = useT();
  if (!readiness.live) return null;
  return (
    <Banner tone="live" title={t.goLive.liveTitle}>
      {readiness.liveUrl && (
        <a
          href={readiness.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-navy underline underline-offset-2"
        >
          {t.goLive.liveLink} ↗
        </a>
      )}
    </Banner>
  );
}

export function LivePill({ live }: { live: boolean }) {
  const t = useT();
  return live ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border-l-[3px] border-status-live bg-status-live/[0.12] px-2 py-0.5 text-xs font-semibold text-status-live-ink">
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-status-live opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-status-live" />
      </span>
      {t.goLive.livePill}
    </span>
  ) : (
    <DotPill
      color="var(--status-inactive)"
      textClass="text-status-inactive"
      label={t.goLive.notLivePill}
    />
  );
}

const CERT_TONE: Record<
  CertVerificationStatus,
  Pick<StatusMeta, 'color' | 'textClass'>
> = {
  verified: {
    color: 'var(--status-approved)',
    textClass: 'text-status-approved',
  },
  pending: { color: 'var(--status-pending)', textClass: 'text-status-pending' },
  level_mismatch: {
    color: 'var(--status-pending)',
    textClass: 'text-status-pending',
  },
  rejected: {
    color: 'var(--status-rejected)',
    textClass: 'text-status-rejected',
  },
  expired: {
    color: 'var(--status-rejected)',
    textClass: 'text-status-rejected',
  },
  no_proof: {
    color: 'var(--status-inactive)',
    textClass: 'text-status-inactive',
  },
};

export function certStatusText(
  cert: Pick<GoLiveCertification, 'status' | 'validUntil'>,
  t: Messages,
  locale: Locale,
): string {
  switch (cert.status) {
    case 'verified':
      return cert.validUntil
        ? t.goLive.certVerified.replace(
            '{date}',
            formatDay(cert.validUntil, locale),
          )
        : t.goLive.certVerifiedNoDate;
    case 'pending':
      return t.goLive.certPending;
    case 'rejected':
      return t.goLive.certRejected;
    case 'expired':
      return t.goLive.certExpired;
    case 'no_proof':
      return t.goLive.certNoProof;
    case 'level_mismatch':
      return t.goLive.certLevelMismatch;
  }
}

export function CertVerificationPill({ cert }: { cert: GoLiveCertification }) {
  const t = useT();
  const { locale } = useLocale();
  return (
    <DotPill
      {...CERT_TONE[cert.status]}
      label={certStatusText(cert, t, locale)}
    />
  );
}

export function findCertStatus(
  statuses: readonly GoLiveCertification[] | undefined,
  cert: Pick<GoLiveCertification, 'org' | 'track' | 'level'>,
): GoLiveCertification | undefined {
  return statuses?.find(
    (s) =>
      s.org === cert.org && s.track === cert.track && s.level === cert.level,
  );
}
