import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';

/** W1.3 — request a password-reset email. */
export function RequestResetPage() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.resetTitle}</h2>
      <p className="mt-2 text-slate">{t.auth.resetBody}</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {sent && <Banner tone="approved">{t.auth.resetSent}</Banner>}
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
        <Button type="submit" loading={busy} className="w-full">
          {t.auth.sendReset}
        </Button>
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
