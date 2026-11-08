import { useState, type FormEvent } from 'react';
import { Banner, Button, Card, Field, Input } from '@/components';
import { useLocale, useT } from '@/i18n/core/I18nProvider';
import { errorText } from '../admin/format';
import { useSignatureCheck } from './api';
import { formatSignedDate } from './format';

const EMAIL_MAX = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignatureCheckBox() {
  const t = useT();
  const s = t.signatures;
  const { locale } = useLocale();
  const [draft, setDraft] = useState('');
  const [email, setEmail] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const check = useSignatureCheck(email);

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim().toLowerCase();
    const valid = EMAIL_SHAPE.test(next);
    setInvalid(!valid);
    setEmail(valid ? next : null);
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg">{s.checkTitle}</h2>
        <p className="text-sm text-slate">{s.checkHint}</p>
      </div>
      <form
        className="flex flex-col items-start gap-3"
        onSubmit={submit}
        noValidate
      >
        <div className="w-full">
          <Field
            label={s.checkLabel}
            error={invalid ? s.checkInvalid : undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                inputMode="email"
                autoComplete="off"
                maxLength={EMAIL_MAX}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={check.isFetching}>
          {s.checkButton}
        </Button>
      </form>
      {email !== null && check.isError && (
        <Banner tone="error">
          {s.checkFailed.replace(
            '{reason}',
            errorText(check.error, t.errors.generic),
          )}
        </Banner>
      )}
      {email !== null && check.data && (
        <div role="status" data-private className="flex flex-col gap-2">
          {check.data.signed ? (
            <>
              <p className="font-medium text-ink">
                {s.checkSigned
                  .replace('{email}', email)
                  .replace(
                    '{date}',
                    check.data.signedAt
                      ? formatSignedDate(check.data.signedAt, locale)
                      : '—',
                  )}
              </p>
              <ul
                aria-label={s.checkDocuments}
                className="list-disc pl-5 text-sm text-ink"
              >
                {check.data.templateTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-ink">
              {s.checkNotSigned.replace('{email}', email)}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
