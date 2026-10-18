import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Card, Field, Select } from '@/components';
import { useUpdateProfile } from './api';
import type { InstructorProfile, PreferredLanguage } from '@/lib/types';

export function PreferredLanguageCard({
  profile,
}: {
  profile: InstructorProfile;
}) {
  const t = useT();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const selected =
    (update.isPending && update.variables.preferredLanguage) ||
    profile.preferredLanguage;

  function changeLanguage(next: PreferredLanguage) {
    setSaved(false);
    update.mutate(
      { preferredLanguage: next },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <Field
        label={t.settings.languageLabel}
        hint={t.settings.preferredLanguageHint}
      >
        {(p) => (
          <Select
            {...p}
            value={selected}
            disabled={update.isPending}
            onChange={(e) =>
              changeLanguage(e.target.value as PreferredLanguage)
            }
          >
            <option value="en">{t.common.english}</option>
            <option value="zh-CN">{t.common.chinese}</option>
          </Select>
        )}
      </Field>
      {saved && <Banner tone="approved">{t.common.saved}</Banner>}
      {update.isError && <Banner tone="error">{t.errors.generic}</Banner>}
    </Card>
  );
}
