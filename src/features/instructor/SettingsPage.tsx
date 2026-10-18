import { useT } from '@/i18n/core/I18nProvider';
import { useSession } from '@/auth/SessionProvider';
import { Card } from '@/components';

export function SettingsPage() {
  const t = useT();
  const { user } = useSession();

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl">{t.settings.title}</h1>

      <Card className="flex flex-col gap-1">
        <h2 className="text-lg">{t.settings.account}</h2>
        <p className="text-sm text-slate">{t.settings.signedInAs}</p>
        <p className="font-mono text-sm text-ink">{user?.email}</p>
      </Card>
    </div>
  );
}
