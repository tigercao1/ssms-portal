import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';
import { track } from '@/lib/analytics';
import { isRateLimited, isUnreachable } from './authErrors';

/** Email/password or magic-link sign-in via Supabase. */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) {
      track('login_failed', {
        method: 'password',
        reason: err.status === 400 ? 'invalid_credentials' : 'error',
      });
      setError(
        err.status === 400 ? t.auth.invalidCredentials : t.auth.genericError,
      );
      return;
    }
    track('login_succeeded', { method: 'password' });
    navigate(data.user?.email_confirmed_at ? '/' : '/verify-email', {
      replace: true,
    });
  }

  async function sendMagicLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t.auth.magicLinkNeedEmail);
      return;
    }
    setError(null);
    setLinkBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLinkBusy(false);
    if (err && isRateLimited(err)) {
      setError(t.auth.rateLimited);
      return;
    }
    if (err && isUnreachable(err)) {
      setError(t.auth.genericError);
      return;
    }
    track('magic_link_requested');
    setLinkSent(true);
  }

  if (linkSent) {
    return (
      <AuthLayout>
        <h2 className="text-3xl">{t.auth.magicLinkSentTitle}</h2>
        <p className="mt-2 text-slate">{t.auth.magicLinkSentBody}</p>
        <p data-private className="mt-1 font-mono text-sm text-ink">
          {email.trim()}
        </p>
        <button
          type="button"
          onClick={() => setLinkSent(false)}
          className="mt-8 inline-block text-sm text-navy hover:underline"
        >
          {t.auth.backToSignIn}
        </button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.signInTitle}</h2>
      <p className="mt-2 text-slate">{t.auth.signInSubtitle}</p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
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
        <Field label={t.auth.password} required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" loading={busy} className="mt-2 w-full">
          {busy ? t.auth.signingIn : t.auth.signInButton}
        </Button>
        <div className="flex items-center gap-3 text-xs uppercase text-slate">
          <span className="h-px flex-1 bg-grey/50" />
          {t.auth.or}
          <span className="h-px flex-1 bg-grey/50" />
        </div>
        <Button
          type="button"
          variant="secondary"
          loading={linkBusy}
          onClick={() => void sendMagicLink()}
          className="w-full"
        >
          {linkBusy ? t.auth.magicLinkSending : t.auth.magicLinkButton}
        </Button>
        <Link
          to="/reset-password"
          className="text-center text-sm text-navy hover:underline"
        >
          {t.auth.forgotPassword}
        </Link>
        <p className="border-t border-grey/50 pt-4 text-center text-sm text-slate">
          {t.auth.noAccount}{' '}
          <Link to="/signup" className="text-navy hover:underline">
            {t.auth.createAccount}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
