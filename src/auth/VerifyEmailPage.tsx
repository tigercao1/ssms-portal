import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from './SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button } from '@/components';
import { AuthLayout } from './AuthLayout';

/** W1.2 — email-verification gate + resend. */
export function VerifyEmailPage() {
  const t = useT();
  const { user } = useSession();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    if (!user?.email) return;
    setBusy(true);
    await supabase.auth.resend({ type: 'signup', email: user.email });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.verifyTitle}</h2>
      <p className="mt-2 text-slate">{t.auth.verifyBody}</p>
      {user?.email && (
        <p className="mt-1 font-mono text-sm text-ink">{user.email}</p>
      )}

      <div className="mt-8 flex flex-col gap-4">
        {sent && <Banner tone="approved">{t.auth.resent}</Banner>}
        <Button onClick={resend} loading={busy} variant="secondary">
          {t.auth.resend}
        </Button>
        <Link
          to="/login"
          className="text-center text-sm text-navy hover:underline"
        >
          {t.auth.backToSignIn}
        </Link>
      </div>
    </AuthLayout>
  );
}
