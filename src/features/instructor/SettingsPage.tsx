import { useState } from 'react';
import { useT, useLocale } from '@/i18n/core/I18nProvider';
import { useSession } from '@/auth/SessionProvider';
import { Banner, Card, Field, Select } from '@/components';
import { persistPreferredLanguage } from './api';
import type { Locale } from '@/i18n/core/types';

/** W2.4 — language preference (persisted to profile) + account info. */
export function SettingsPage() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const { user } = useSession();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  async function changeLanguage(next: Locale) {
    setLocale(next);
    setSaved(false);
    setError(false);
    try {
      await persistPreferredLanguage(next);
      setSaved(true);
    } catch {
      setError(true);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl">{t.settings.title}</h1>

      <Card className="flex flex-col gap-4">
        <Field label={t.settings.languageLabel} hint={t.settings.languageHint}>
          {(p) => (
            <Select
              {...p}
              value={locale}
              onChange={(e) => changeLanguage(e.target.value as Locale)}
            >
              <option value="en">{t.common.english}</option>
              <option value="zh-CN">{t.common.chinese}</option>
            </Select>
          )}
        </Field>
        {saved && <Banner tone="approved">{t.common.saved}</Banner>}
        {error && <Banner tone="error">{t.errors.generic}</Banner>}
      </Card>

      <Card className="flex flex-col gap-1">
        <h2 className="text-lg">{t.settings.account}</h2>
        <p className="text-sm text-slate">{t.settings.signedInAs}</p>
        <p className="font-mono text-sm text-ink">{user?.email}</p>
      </Card>
    </div>
  );
}
