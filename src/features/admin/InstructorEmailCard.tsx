import { useId, useState, type FormEvent } from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import type { Messages } from '@/i18n/core/types';
import { useSession } from '@/auth/SessionProvider';
import { ApiError } from '@/lib/api';
import { Banner, Button, Card, Field, Input, Modal } from '@/components';
import type { AdminInstructorRecord } from '@/lib/types';
import { useAdminUserRole, useChangeInstructorEmail } from './api';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNFINISHED_PREFIX = 'ssms.unfinishedEmailChange.';

interface EmailChange {
  email: string;
  expectedCurrentEmail: string;
}

function isEmailChange(value: unknown): value is EmailChange {
  const change = value as Partial<EmailChange> | null;
  return (
    typeof change?.email === 'string' &&
    typeof change.expectedCurrentEmail === 'string'
  );
}

function recallUnfinished(id: string): EmailChange | null {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(UNFINISHED_PREFIX + id) ?? 'null',
    );
    return isEmailChange(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeUnfinished(id: string, change: EmailChange | null): void {
  try {
    if (change)
      sessionStorage.setItem(UNFINISHED_PREFIX + id, JSON.stringify(change));
    else sessionStorage.removeItem(UNFINISHED_PREFIX + id);
  } catch {
    return;
  }
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function mayBeUnfinished(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

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
  const m = t.instructorEmail;
  const { user } = useSession();
  const role = useAdminUserRole(rec.authUserId);
  const [open, setOpen] = useState(false);
  const [changed, setChanged] = useState(false);
  const [memory, setMemory] = useState(() => ({
    id: rec.id,
    change: recallUnfinished(rec.id),
  }));
  const remembered =
    memory.id === rec.id ? memory.change : recallUnfinished(rec.id);
  const unfinished =
    remembered && !sameEmail(remembered.expectedCurrentEmail, rec.email)
      ? remembered
      : null;
  const blocked =
    user?.id === rec.authUserId
      ? m.cantChangeOwn
      : role.data?.role === 'admin'
        ? m.cantChangeAdmin
        : null;

  function remember(change: EmailChange | null) {
    storeUnfinished(rec.id, change);
    setMemory({ id: rec.id, change });
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg">{m.title}</h2>
      <p data-private className="break-all font-mono text-sm text-navy">
        {rec.email}
      </p>
      {blocked ? (
        <Banner tone="info">{blocked}</Banner>
      ) : (
        <>
          {unfinished && !open && (
            <Banner tone="pending">
              <span data-private className="break-words">
                {m.unfinished.replace('{email}', unfinished.email)}
              </span>
            </Banner>
          )}
          <Button
            variant="secondary"
            disabled={role.isLoading}
            onClick={() => {
              setChanged(false);
              setOpen(true);
            }}
          >
            {unfinished ? m.finishChange : m.change}
          </Button>
        </>
      )}
      {changed && <Banner tone="approved">{m.changed}</Banner>}
      {open && (
        <ChangeEmailDialog
          rec={rec}
          unfinished={unfinished}
          onRemember={remember}
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

function ChangeSummary({ from, to }: { from: string; to: string }) {
  const m = useT().instructorEmail;
  return (
    <dl
      data-testid="email-change-summary"
      className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-sunken px-4 py-3 text-sm"
    >
      <dt className="text-slate">{m.from}</dt>
      <dd className="break-all font-mono">{from}</dd>
      <dt className="text-slate">{m.to}</dt>
      <dd className="break-all font-mono font-medium">{to}</dd>
    </dl>
  );
}

function ChangeEmailDialog({
  rec,
  unfinished,
  onRemember,
  onClose,
  onChanged,
}: {
  rec: AdminInstructorRecord;
  unfinished: EmailChange | null;
  onRemember: (change: EmailChange | null) => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const m = t.instructorEmail;
  const formId = useId();
  const change = useChangeInstructorEmail(rec.id);
  const [current] = useState(rec.email);
  const [finishing, setFinishing] = useState(unfinished);
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

  function submit(body: EmailChange) {
    if (change.isPending) return;
    onRemember(body);
    change.mutate(body, {
      onSuccess: () => {
        onRemember(null);
        onChanged();
      },
      onError: (error) => {
        if (!mayBeUnfinished(error)) onRemember(null);
      },
    });
  }

  const failure = change.isError && (
    <Banner tone="error">
      {failureText(change.error, m, t.errors.generic)}
    </Banner>
  );

  if (finishing) {
    return (
      <Modal
        title={m.dialogTitle}
        onClose={onClose}
        footer={
          unfinished ? (
            <>
              <Button
                variant="ghost"
                disabled={change.isPending}
                onClick={() => {
                  onRemember(null);
                  change.reset();
                  setFinishing(null);
                }}
              >
                {m.forget}
              </Button>
              <Button
                loading={change.isPending}
                onClick={() => submit(finishing)}
              >
                {m.finishChange}
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          <p data-private className="break-words text-sm font-medium">
            {m.finishIntro.replace('{email}', finishing.email)}
          </p>
          <ChangeSummary
            from={finishing.expectedCurrentEmail}
            to={finishing.email}
          />
          <p className="text-sm">{m.confirmSignOut}</p>
          {failure}
        </div>
      </Modal>
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
              <Button
                loading={change.isPending}
                onClick={() =>
                  submit({ email: next, expectedCurrentEmail: current })
                }
              >
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
          <ChangeSummary from={current} to={next} />
          <p className="text-sm">{m.confirmSignOut}</p>
          <p className="text-sm">{m.confirmNotify}</p>
          {failure}
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
