import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useT } from '@/i18n/core/I18nProvider';
import { Field, Input } from '@/components';
import { AuthLayout } from './AuthLayout';
import { NewPasswordForm } from './NewPasswordForm';
import { useSession } from './SessionProvider';
import { completeActivation } from './activationApi';

/**
 * Second activation step (`/activate/password`). The invite link already
 * signed the instructor in; they choose a password, the API records the
 * activation, and they continue to their profile.
 */
export function ActivatePasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useSession();
  const passwordSet = useRef(false);

  async function activate(password: string) {
    if (!passwordSet.current) {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return t.auth.genericError;
      passwordSet.current = true;
    }
    try {
      await completeActivation();
    } catch {
      return t.auth.genericError;
    }
    navigate('/profile/edit', { replace: true });
    return null;
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.activation.passwordTitle}</h2>
      <p className="mt-2 text-slate">{t.activation.passwordBody}</p>
      <NewPasswordForm
        submitLabel={t.activation.activateButton}
        onSubmit={activate}
      >
        <Field label={t.auth.email}>
          {(p) => (
            <Input
              {...p}
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="bg-canvas text-slate"
            />
          )}
        </Field>
      </NewPasswordForm>
    </AuthLayout>
  );
}
