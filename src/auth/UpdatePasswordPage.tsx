import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';

/**
 * W1.3 — set a new password. Reached via the reset email link, which lands the
 * user here with a recovery session already established by Supabase.
 */
export function UpdatePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(t.auth.genericError);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/login', { replace: true }), 1500);
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.updatePwTitle}</h2>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {done && <Banner tone="approved">{t.auth.pwUpdated}</Banner>}
        {error && <Banner tone="error">{error}</Banner>}
        <Field label={t.auth.newPassword} required>
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
        <Button type="submit" loading={busy} className="w-full">
          {t.auth.updatePw}
        </Button>
      </form>
    </AuthLayout>
  );
}
