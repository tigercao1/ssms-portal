import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Field, Input, Modal, Select } from '@/components';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import {
  tokenErrorText,
  useCreateApiToken,
  useRevokeApiToken,
  useRotateApiToken,
} from './apiTokensApi';
import {
  customDateBounds,
  EXPIRY_PRESET_DAYS,
  expiresAtFor,
  isCustomDateValid,
  type ExpiryChoice,
} from './expiry';
import type { ApiToken, IssuedApiToken } from './types';

export const SSMS_API_URL = 'https://api.ssnow.club';
export const GRACE_MINUTE_OPTIONS = [0, 10, 60, 1440] as const;
export const DEFAULT_GRACE_MINUTES = 10;
const NAME_MAX_LENGTH = 100;

type ExpiryOption = `${number}` | 'custom' | 'never';

function choiceFor(option: ExpiryOption, customDate: string): ExpiryChoice {
  if (option === 'never') return { kind: 'never' };
  if (option === 'custom') return { kind: 'custom', date: customDate };
  return { kind: 'days', days: Number(option) };
}

export function CreateTokenDialog({
  onClose,
  onIssued,
}: {
  onClose: () => void;
  onIssued: (issued: IssuedApiToken) => void;
}) {
  const t = useT();
  const create = useCreateApiToken();
  const [name, setName] = useState('');
  const [option, setOption] = useState<ExpiryOption>('90');
  const [customDate, setCustomDate] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const bounds = customDateBounds();

  const nameError =
    submitted && !name.trim() ? t.apiTokens.nameRequired : undefined;
  const dateError =
    submitted && option === 'custom' && !isCustomDateValid(customDate)
      ? t.apiTokens.customDateInvalid
      : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim()) return;
    if (option === 'custom' && !isCustomDateValid(customDate)) return;
    create.mutate(
      {
        name: name.trim(),
        expiresAt: expiresAtFor(choiceFor(option, customDate)),
      },
      { onSuccess: onIssued },
    );
  }

  return (
    <Modal
      title={t.apiTokens.createTitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            form="create-api-token"
            loading={create.isPending}
          >
            {t.apiTokens.create}
          </Button>
        </>
      }
    >
      <form
        id="create-api-token"
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        <Field
          label={t.apiTokens.name}
          hint={t.apiTokens.nameHint}
          error={nameError}
          required
        >
          {(props) => (
            <Input
              {...props}
              value={name}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label={t.apiTokens.expiry}>
          {(props) => (
            <Select
              {...props}
              value={option}
              onChange={(e) => setOption(e.target.value as ExpiryOption)}
            >
              {EXPIRY_PRESET_DAYS.map((days) => (
                <option key={days} value={String(days)}>
                  {t.apiTokens.expiryDays.replace('{days}', String(days))}
                </option>
              ))}
              <option value="custom">{t.apiTokens.expiryCustom}</option>
              <option value="never">{t.apiTokens.expiryNever}</option>
            </Select>
          )}
        </Field>
        {option === 'custom' && (
          <Field
            label={t.apiTokens.customDate}
            hint={t.apiTokens.customDateHint}
            error={dateError}
            required
          >
            {(props) => (
              <Input
                {...props}
                type="date"
                min={bounds.min}
                max={bounds.max}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
              />
            )}
          </Field>
        )}
        {option === 'never' && (
          <Banner tone="pending" title={t.apiTokens.neverWarningTitle}>
            {t.apiTokens.neverWarning}
          </Banner>
        )}
        {create.isError && (
          <Banner tone="error">{tokenErrorText(create.error, t)}</Banner>
        )}
      </form>
    </Modal>
  );
}

function graceLabel(minutes: number, t: Messages): string {
  const label =
    minutes === 0
      ? t.apiTokens.graceNone
      : minutes === 60
        ? t.apiTokens.graceHour
        : minutes === 1440
          ? t.apiTokens.graceDay
          : t.apiTokens.graceMinutes.replace('{n}', String(minutes));
  return minutes === DEFAULT_GRACE_MINUTES
    ? t.apiTokens.graceDefault.replace('{label}', label)
    : label;
}

export function RotateTokenDialog({
  token,
  onClose,
  onIssued,
}: {
  token: ApiToken;
  onClose: () => void;
  onIssued: (issued: IssuedApiToken) => void;
}) {
  const t = useT();
  const rotate = useRotateApiToken();
  const [graceMinutes, setGraceMinutes] = useState<number>(
    DEFAULT_GRACE_MINUTES,
  );

  return (
    <Modal
      title={t.apiTokens.rotateTitle.replace('{name}', token.name)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            loading={rotate.isPending}
            onClick={() =>
              rotate.mutate(
                { id: token.id, body: { graceMinutes } },
                { onSuccess: onIssued },
              )
            }
          >
            {t.apiTokens.rotateConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">{t.apiTokens.rotateBody}</p>
        <Field label={t.apiTokens.grace}>
          {(props) => (
            <Select
              {...props}
              value={String(graceMinutes)}
              onChange={(e) => setGraceMinutes(Number(e.target.value))}
            >
              {GRACE_MINUTE_OPTIONS.map((minutes) => (
                <option key={minutes} value={String(minutes)}>
                  {graceLabel(minutes, t)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {rotate.isError && (
          <Banner tone="error">{tokenErrorText(rotate.error, t)}</Banner>
        )}
      </div>
    </Modal>
  );
}

export function RevokeTokenDialog({
  token,
  onClose,
  onRevoked,
}: {
  token: ApiToken;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const t = useT();
  const revoke = useRevokeApiToken();

  return (
    <Modal
      title={t.apiTokens.revokeTitle.replace('{name}', token.name)}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button
            variant="danger"
            loading={revoke.isPending}
            onClick={() => revoke.mutate(token.id, { onSuccess: onRevoked })}
          >
            {t.apiTokens.revokeConfirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink">{t.apiTokens.revokeBody}</p>
        {revoke.isError && (
          <Banner tone="error">{tokenErrorText(revoke.error, t)}</Banner>
        )}
      </div>
    </Modal>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <Button size="sm" variant="secondary" aria-label={label} onClick={copy}>
      <span aria-live="polite">
        {state === 'copied'
          ? t.apiTokens.copied
          : state === 'failed'
            ? t.apiTokens.copyFailed
            : label}
      </span>
    </Button>
  );
}

export function envSnippet(token: string): string {
  return `export SSMS_API_URL=${SSMS_API_URL}\nexport SSMS_ADMIN_TOKEN=${token}`;
}

export function SecretDialog({
  issued,
  rotated,
  onClose,
}: {
  issued: IssuedApiToken;
  rotated: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const snippet = envSnippet(issued.token);

  return (
    <Modal
      title={rotated ? t.apiTokens.secretRotatedTitle : t.apiTokens.secretTitle}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t.apiTokens.done}</Button>}
    >
      <div className="flex flex-col gap-4">
        <Banner tone="pending" title={t.apiTokens.secretWarningTitle}>
          {t.apiTokens.secretWarning}
        </Banner>
        <section
          className="flex flex-col gap-2"
          aria-labelledby="api-token-secret"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id="api-token-secret" className="text-sm font-medium text-navy">
              {t.apiTokens.secretLabel}
            </h3>
            <CopyButton text={issued.token} label={t.apiTokens.copyToken} />
          </div>
          <code
            data-private
            data-testid="api-token-secret"
            className="block break-all rounded-md bg-sunken px-3 py-2 font-mono text-sm text-ink"
          >
            {issued.token}
          </code>
        </section>
        <section
          className="flex flex-col gap-2"
          aria-labelledby="api-token-snippet"
        >
          <div className="flex items-center justify-between gap-2">
            <h3
              id="api-token-snippet"
              className="text-sm font-medium text-navy"
            >
              {t.apiTokens.snippetLabel}
            </h3>
            <CopyButton text={snippet} label={t.apiTokens.copySnippet} />
          </div>
          <pre
            data-private
            data-testid="api-token-snippet"
            className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-sunken px-3 py-2 font-mono text-xs text-ink"
          >
            {snippet}
          </pre>
        </section>
      </div>
    </Modal>
  );
}
