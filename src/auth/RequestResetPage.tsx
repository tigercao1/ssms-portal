import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';
import { track } from '@/lib/analytics';
import {
  SUPABASE_EMAIL_INTERVAL_SECONDS,
  isRateLimited,
  rateLimitWaitSeconds,
} from './authErrors';
import { ResendButton } from './ResendButton';
import { useResendCooldown } from './useResendCooldown';

/** W1.3 — request a password-reset email. */
export function RequestResetPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useResendCooldown('password-reset', email);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await cooldown.send(async () => {
      setError(null);
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/update-password` },
      );
      if (err && isRateLimited(err)) {
        setError(t.auth.rateLimited);
        return rateLimitWaitSeconds(err);
      }
      if (err) {
        setError(t.auth.genericError);
        return null;
      }
      track('password_reset_requested');
      setSent(true);
      return SUPABASE_EMAIL_INTERVAL_SECONDS;
    });
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.resetTitle}</h2>
      <p className="mt-2 text-slate">{t.auth.resetBody}</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {sent && <Banner tone="approved">{t.auth.resetSent}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        <Field label={t.auth.email} required>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </Field>
        <ResendButton
          type="submit"
          busy={cooldown.busy}
          secondsLeft={cooldown.secondsLeft}
          className="w-full"
        >
          {t.auth.sendReset}
        </ResendButton>
        <Link
          to="/login"
          className="text-center text-sm text-navy hover:underline"
        >
          {t.auth.backToSignIn}
        </Link>
      </form>
    </AuthLayout>
  );
}
