import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';

/** W1.1 — email/password sign-in via Supabase. */
export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      setError(
        err.status === 400 ? t.auth.invalidCredentials : t.auth.genericError,
      );
      return;
    }
    navigate(data.user?.email_confirmed_at ? '/' : '/verify-email', {
      replace: true,
    });
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
