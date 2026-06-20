import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { localizeField } from '@/i18n/core/localize';
import { Card } from '@/components';
import type { InstructorProfile } from '@/lib/types';

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

function Chips({ items }: { items: { id: string; name: string }[] }) {
  const t = useT();
  if (items.length === 0)
    return <span className="text-sm text-slate">{t.common.none}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span
          key={it.id}
          className="rounded-md bg-sunken px-2.5 py-1 text-sm text-ink"
        >
          {it.name}
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
export function ProfileSummary({ profile }: { profile: InstructorProfile }) {
  const t = useT();
  const { locale } = useLocale();
  const name = localizeField(profile.displayNameEn, profile.displayNameZh, locale);
  const bio = localizeField(profile.bioEn, profile.bioZh, locale);

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex items-center gap-5">
        <Avatar url={profile.profilePhotoUrl} name={name} />
        <div>
          <h2 className="text-2xl">{name || profile.email}</h2>
          <p className="font-mono text-sm text-slate">{profile.email}</p>
        </div>
      </Card>

      <Card className="grid gap-6 sm:grid-cols-2">
        <Section title={t.profile.bio}>
          <p className="whitespace-pre-wrap text-sm text-ink">
            {bio || <span className="text-slate">{t.profile.noneYet}</span>}
          </p>
        </Section>
        <Section title={t.profile.certifications}>
          {profile.certifications.length === 0 ? (
            <span className="text-sm text-slate">{t.profile.noneYet}</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {profile.certifications.map((c, i) => (
                <li key={i} className="text-sm text-ink">
                  {c.display}
                </li>
              ))}
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
