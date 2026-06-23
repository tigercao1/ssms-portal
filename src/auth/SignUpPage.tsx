import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';

/**
 * W1.x — open instructor self sign-up (Supabase). Creates the auth user and
 * triggers Supabase's verification email. After verifying + first sign-in, the
 * backend auto-creates the `pending` instructor row (the application), which an
 * admin then approves or dismisses. See INSTRUCTOR_LOGIN.md.
 */
export function SignUpPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setBusy(false);
    if (err) {
      setError(
        err.message.toLowerCase().includes('registered') ||
          err.message.toLowerCase().includes('already')
          ? t.auth.emailInUse
          : t.auth.genericError,
      );
      return;
    }
    // Supabase returns a user with an empty identities array when the email is
    // already registered (anti-enumeration). Treat that as "in use".
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError(t.auth.emailInUse);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthLayout>
        <h2 className="text-3xl">{t.auth.signUpDone}</h2>
        <p className="mt-2 text-slate">{t.auth.signUpDoneBody}</p>
        <p className="mt-1 font-mono text-sm text-ink">{email}</p>
        <Link
          to="/login"
          className="mt-8 inline-block text-sm text-navy hover:underline"
        >
          {t.auth.backToSignIn}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.signUpTitle}</h2>
      <p className="mt-2 text-slate">{t.auth.signUpSubtitle}</p>

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
        <Field label={t.auth.password} hint={t.auth.passwordHint} required>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </Field>
        <Button type="submit" loading={busy} className="mt-2 w-full">
          {busy ? t.auth.signingUp : t.auth.signUpButton}
        </Button>
        <p className="text-center text-sm text-slate">
          {t.auth.haveAccount}{' '}
          <Link to="/login" className="text-navy hover:underline">
            {t.auth.signInButton}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
