import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Card } from '@/components';
import { TranslatedByBadge } from '@/features/translation/TranslatedByBadge';
import type {
  GoLiveCertification,
  InstructorProfile,
  RefItem,
} from '@/lib/types';
import { certificationLabel } from './certLabels';
import { CertVerificationPill, findCertStatus } from './goLive';

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="h-20 w-20 rounded-lg object-cover"
      />
    );
  }
  const initials = name.slice(0, 2).toUpperCase() || '–';
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-navy font-display text-2xl text-white">
      {initials}
    </div>
  );
}

function Chips({ items }: { items: RefItem[] }) {
  const t = useT();
  const { locale } = useLocale();
  if (items.length === 0)
    return <span className="text-sm text-slate">{t.common.none}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it.id}
          className="rounded-md bg-sunken px-2.5 py-1 text-sm text-ink"
        >
          {localizeField(it.name, it.nameZh, locale)}
        </span>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg">{title}</h3>
      {children}
    </div>
  );
}

/** Read-only profile presentation (W2.1; reused by admin detail W2.8). */
export function ProfileSummary({
  profile,
  certStatuses,
}: {
  profile: InstructorProfile;
  certStatuses?: readonly GoLiveCertification[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const name = localizeField(profile.displayNameEn, profile.displayNameZh, locale);
  const legalName =
    profile.firstName && profile.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : null;
  const bio = localizeField(profile.bioEn, profile.bioZh, locale);
  const showsZhBio = locale === 'zh-CN' && Boolean(profile.bioZh?.trim());
  const bioTranslatedBy = !bio
    ? null
    : showsZhBio
      ? profile.bioZhTranslatedBy
      : profile.bioEnTranslatedBy;
  const extraPhotos = [
    { label: t.profile.photo2, url: profile.photo2Url },
    { label: t.profile.photo3, url: profile.photo3Url },
  ].filter((photo): photo is { label: string; url: string } =>
    Boolean(photo.url),
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-5">
        <Avatar url={profile.profilePhotoUrl} name={name} />
        <div>
          <h2 className="text-2xl">{name || profile.email}</h2>
          <p className="font-mono text-sm text-slate">{profile.email}</p>
          {legalName && (
            <p className="text-sm text-slate">
              {t.profile.legalName}: {legalName}
            </p>
          )}
        </div>
      </Card>

      {extraPhotos.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h3 className="text-lg">{t.profile.morePhotos}</h3>
          <div className="flex flex-wrap gap-4">
            {extraPhotos.map((photo) => (
              <img
                key={photo.label}
                src={photo.url}
                alt={`${name} — ${photo.label}`}
                className="h-32 w-32 rounded-lg object-cover"
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="grid gap-6 sm:grid-cols-2">
        <Section title={t.profile.bio}>
          <p className="whitespace-pre-wrap text-sm text-ink">
            {bio || <span className="text-slate">{t.profile.noneYet}</span>}
          </p>
          <TranslatedByBadge model={bioTranslatedBy} />
        </Section>
        <Section title={t.profile.certifications}>
          {profile.certifications.length === 0 ? (
            <span className="text-sm text-slate">{t.profile.noneYet}</span>
          ) : (
            <ul className="flex flex-col gap-2">
              {profile.certifications.map((c, i) => {
                const status = findCertStatus(certStatuses, c);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink"
                  >
                    <span>{certificationLabel(c, t)}</span>
                    {status && <CertVerificationPill cert={status} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
        <Section title={t.profile.trainerStatus}>
          {profile.trainerStatus.filter((tr) => tr.display).length === 0 ? (
            <span className="text-sm text-slate">{t.profile.noneYet}</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {profile.trainerStatus.map(
                (tr, i) =>
                  tr.display && (
                    <li key={i} className="text-sm text-ink">
                      {tr.display}
                    </li>
                  ),
              )}
            </ul>
          )}
        </Section>
        {typeof profile.minStudentAge === 'number' && (
          <Section title={t.profile.minStudentAge}>
            <p className="text-sm text-ink">
              {t.profile.minStudentAgeValue.replace(
                '{n}',
                String(profile.minStudentAge),
              )}
            </p>
          </Section>
        )}
        <Section title={t.profile.locations}>
          <Chips items={profile.teachingLocations} />
        </Section>
        <Section title={t.profile.languages}>
          <Chips items={profile.languages} />
        </Section>
        <Section title={t.profile.courseLevels}>
          <Chips items={profile.courseLevelsOffered} />
        </Section>
      </Card>
    </div>
  );
}
