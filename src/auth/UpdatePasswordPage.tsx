import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner } from '@/components';
import { AuthLayout } from './AuthLayout';
import { NewPasswordForm } from './NewPasswordForm';

/**
 * W1.3 — set a new password. Reached via the reset email link, which lands the
 * user here with a recovery session already established by Supabase.
 */
export function UpdatePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return t.auth.genericError;
    setDone(true);
    setTimeout(() => navigate('/login', { replace: true }), 1500);
    return null;
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.auth.updatePwTitle}</h2>
      <NewPasswordForm
        submitLabel={t.auth.updatePw}
        onSubmit={updatePassword}
        notice={done && <Banner tone="approved">{t.auth.pwUpdated}</Banner>}
      />
    </AuthLayout>
  );
}
