import { useState } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { useSession } from '@/auth/SessionProvider';
import { Banner, Card, Field, Select, Spinner } from '@/components';
import { useMyProfile, useUpdateProfile } from './api';
import type { PreferredLanguage } from '@/lib/types';

/** W2.4 — email language preference (persisted to profile) + account info. */
export function SettingsPage() {
  const t = useT();
  const { user } = useSession();
  const { data: profile, isLoading, isError } = useMyProfile();
  const update = useUpdateProfile();
  const [saved, setSaved] = useState(false);
  const selected =
    (update.isPending && update.variables.preferredLanguage) ||
    profile?.preferredLanguage;

  function changeLanguage(next: PreferredLanguage) {
    setSaved(false);
    update.mutate(
      { preferredLanguage: next },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl">{t.settings.title}</h1>

      <Card className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner className="h-6 w-6" />
          </div>
        ) : isError || !profile ? (
          <Banner tone="error">{t.errors.generic}</Banner>
        ) : (
          <>
            <Field
              label={t.settings.emailLanguageLabel}
              hint={t.settings.emailLanguageHint}
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
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="text-lg">{t.settings.account}</h2>
        <p className="text-sm text-slate">{t.settings.signedInAs}</p>
        <p className="font-mono text-sm text-ink">{user?.email}</p>
      </Card>
    </div>
  );
}
