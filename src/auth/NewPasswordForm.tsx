import { useState, type FormEvent, type ReactNode } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input } from '@/components';

export const MIN_PASSWORD_LENGTH = 6;

/**
 * New-password form shared by the reset and activation flows. `onSubmit`
 * resolves to an error message to show, or null on success.
 */
export function NewPasswordForm({
  submitLabel,
  onSubmit,
  notice,
  children,
}: {
  submitLabel: string;
  onSubmit: (password: string) => Promise<string | null>;
  notice?: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t.auth.passwordTooShort);
      return;
    }
    setError(null);
    setBusy(true);
    const message = await onSubmit(password);
    setBusy(false);
    setError(message);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 flex flex-col gap-4"
      noValidate
    >
      {notice}
      {error && <Banner tone="error">{error}</Banner>}
      {children}
      <Field label={t.auth.newPassword} hint={t.auth.passwordHint} required>
        {(p) => (
          <Input
            {...p}
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        )}
      </Field>
      <Button type="submit" loading={busy} className="w-full">
        {submitLabel}
      </Button>
    </form>
  );
}
