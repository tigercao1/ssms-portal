import { useId, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { useSession } from '@/auth/SessionProvider';
import { ApiError } from '@/lib/api';
import { Banner, Button, Card, Field, Input, Modal } from '@/components';
import type { AdminInstructorRecord } from '@/lib/types';
import { useAdminUserRole, useChangeInstructorEmail } from './api';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorCode(error: unknown): string | undefined {
  const body = error instanceof ApiError ? error.body : undefined;
  return (body as { code?: string } | undefined)?.code;
}

function failureText(
  error: unknown,
  m: Messages['instructorEmail'],
  generic: string,
): string {
  switch (errorCode(error)) {
    case 'email_taken':
      return m.taken;
    case 'stale_email':
      return m.stale;
    case 'email_change_incomplete':
      return m.incomplete;
    case 'admin_target':
    case 'self_target':
      return m.notAllowed;
    default:
      return error instanceof ApiError && error.status === 400
        ? m.invalid
        : generic;
  }
}

export function InstructorEmailCard({ rec }: { rec: AdminInstructorRecord }) {
  const t = useT();
  const { user } = useSession();
  const role = useAdminUserRole(rec.authUserId);
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const blocked =
    user?.id === rec.authUserId
      ? t.instructorEmail.cantChangeOwn
      : role.data?.role === 'admin'
        ? t.instructorEmail.cantChangeAdmin
        : null;

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{t.instructorEmail.title}</h2>
      <p data-private className="break-all font-mono text-sm text-navy">
        {rec.email}
      </p>
      {blocked ? (
        <Banner tone="info">{blocked}</Banner>
      ) : (
        <Button
          variant="secondary"
          disabled={role.isLoading}
          onClick={() => {
            setChanged(false);
            setOpen(true);
          }}
        >
          {t.instructorEmail.change}
        </Button>
      )}
      {changed && <Banner tone="approved">{t.instructorEmail.changed}</Banner>}
      {open && (
        <ChangeEmailDialog
          rec={rec}
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false);
            setChanged(true);
          }}
        />
      )}
    </Card>
  );
}

function ChangeEmailDialog({
  rec,
  onClose,
  onChanged,
}: {
  rec: AdminInstructorRecord;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const m = t.instructorEmail;
  const formId = useId();
  const change = useChangeInstructorEmail(rec.id);
  const [current] = useState(rec.email);
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const next = value.trim().toLowerCase();
  const code = change.isError ? errorCode(change.error) : undefined;

  function review(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_SHAPE.test(next)) {
      setFieldError(m.invalid);
      return;
    }
    if (next === current.trim().toLowerCase()) {
      setFieldError(m.same);
      return;
    }
    setFieldError(null);
    change.reset();
    setConfirming(true);
  }

  function submit() {
    if (change.isPending) return;
    change.mutate(
      { email: next, expectedCurrentEmail: current },
      { onSuccess: onChanged },
    );
  }

  return (
    <Modal
      title={m.dialogTitle}
      onClose={onClose}
      footer={
        confirming ? (
          <>
            <Button
              variant="ghost"
              disabled={change.isPending}
              onClick={() => {
                change.reset();
                setConfirming(false);
              }}
            >
              {m.back}
            </Button>
            {code !== 'stale_email' && (
              <Button loading={change.isPending} onClick={submit}>
                {code === 'email_change_incomplete' ? m.retry : m.confirm}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form={formId}>
              {m.continue}
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <div className="flex flex-col gap-4">
          <dl
            data-testid="email-change-summary"
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-sunken px-4 py-3 text-sm"
          >
            <dt className="text-slate">{m.from}</dt>
            <dd className="break-all font-mono">{current}</dd>
            <dt className="text-slate">{m.to}</dt>
            <dd className="break-all font-mono font-medium">{next}</dd>
          </dl>
          <p className="text-sm">{m.confirmSignOut}</p>
          <p className="text-sm">{m.confirmNotify}</p>
          {change.isError && (
            <Banner tone="error">
              {failureText(change.error, m, t.errors.generic)}
            </Banner>
          )}
        </div>
      ) : (
        <form
          id={formId}
          onSubmit={review}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-slate">{m.current}</span>
            <span data-private className="break-all font-mono">
              {current}
            </span>
          </div>
          <Field
            label={m.newLabel}
            hint={m.newHint}
            error={fieldError ?? undefined}
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="off"
                inputMode="email"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setFieldError(null);
                }}
              />
            )}
          </Field>
        </form>
      )}
    </Modal>
  );
}
