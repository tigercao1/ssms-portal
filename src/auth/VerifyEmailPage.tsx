import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useSession } from './SessionProvider';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner } from '@/components';
import { AuthLayout } from './AuthLayout';
import { isRateLimited, rateLimitWaitSeconds } from './authErrors';
import { ResendButton } from './ResendButton';
import { useResendCooldown } from './useResendCooldown';

/** W1.2 — email-verification gate + resend. */
export function VerifyEmailPage() {
  const t = useT();
  const { user } = useSession();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useResendCooldown('verify-email', user?.email ?? '');

  async function resend() {
    const email = user?.email;
    if (!email) return;
    await cooldown.send(async () => {
      setError(null);
      const { error: err } = await supabase.auth.resend({
        type: 'signup',
        email,
      });
      if (err && isRateLimited(err)) {
        setError(t.auth.rateLimited);
        return rateLimitWaitSeconds(err);
      }
      if (err) {
        setError(t.auth.genericError);
        return null;
      }
      setSent(true);
      return null;
    });
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
        {error && <Banner tone="error">{error}</Banner>}
        <ResendButton
          onClick={() => void resend()}
          busy={cooldown.busy}
          secondsLeft={cooldown.secondsLeft}
          variant="secondary"
        >
          {t.auth.resend}
        </ResendButton>
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
