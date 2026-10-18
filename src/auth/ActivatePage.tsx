import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ApiError } from '@/lib/api';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Button, Field, Input, Spinner } from '@/components';
import { ResendButton } from './ResendButton';
import { useResendCooldown, type ResendWait } from './useResendCooldown';
import { AuthLayout } from './AuthLayout';
import { useSession } from './SessionProvider';
import {
  redeemActivation,
  resendActivation,
  retryAfterSeconds,
} from './activationApi';
import { track } from '@/lib/analytics';

type Phase =
  | { kind: 'verifying' }
  | { kind: 'verified'; email: string }
  | { kind: 'expired'; email: string; wait: ResendWait | null }
  | { kind: 'error'; network: boolean };

function emailFromBody(body: unknown): string {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : '';
}

/**
 * Season-invite landing (`/activate?t=<token>`). Redeems the invite token with
 * the API, exchanges the returned token hash for a Supabase session, then sends
 * the instructor on to choose a password.
 */
export function ActivatePage() {
  const t = useT();
  const navigate = useNavigate();
  const { session } = useSession();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';
  const [phase, setPhase] = useState<Phase>(
    token ? { kind: 'verifying' } : { kind: 'expired', email: '', wait: null },
  );
  const started = useRef<string | null>(null);

  const activate = useCallback(async () => {
    setPhase({ kind: 'verifying' });
    let email: string;
    let tokenHash: string;
    try {
      ({ email, tokenHash } = await redeemActivation(token));
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.status === 410 || err.status === 404)
      ) {
        track('activation_failed', { reason: 'expired' });
        const expiredEmail = emailFromBody(err.body);
        const seconds = retryAfterSeconds(err.body);
        setPhase({
          kind: 'expired',
          email: expiredEmail,
          wait:
            expiredEmail && seconds !== null
              ? { email: expiredEmail, seconds }
              : null,
        });
      } else {
        track('activation_failed', { reason: 'redeem_error' });
        setPhase({
          kind: 'error',
          network: !(err instanceof ApiError) || err.status >= 500,
        });
      }
      return;
    }
    const { error } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });
    if (error) {
      track('activation_failed', { reason: 'verify_error' });
      setPhase({ kind: 'error', network: false });
      return;
    }
    track('activation_completed');
    setPhase({ kind: 'verified', email });
  }, [token]);

  useEffect(() => {
    if (!token || started.current === token) return;
    started.current = token;
    void activate();
  }, [token, activate]);

  const sessionEmail = session?.user.email?.toLowerCase();
  useEffect(() => {
    if (phase.kind === 'verified' && sessionEmail === phase.email.toLowerCase())
      navigate('/activate/password', { replace: true });
  }, [phase, sessionEmail, navigate]);

  if (phase.kind === 'expired')
    return <ExpiredLink initialEmail={phase.email} serverWait={phase.wait} />;

  if (phase.kind === 'error')
    return (
      <AuthLayout>
        <h2 className="text-3xl">
          {phase.network ? t.activation.networkTitle : t.auth.genericError}
        </h2>
        {phase.network && (
          <p className="mt-2 text-slate">{t.activation.networkBody}</p>
        )}
        <div className="mt-8 flex flex-col gap-4">
          <Button onClick={() => void activate()} className="w-full">
            {t.common.retry}
          </Button>
          <Link
            to="/login"
            className="text-center text-sm text-navy hover:underline"
          >
            {t.auth.backToSignIn}
          </Link>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.activation.verifyingTitle}</h2>
      <p className="mt-2 text-slate">{t.activation.verifyingBody}</p>
      <div className="mt-8 flex justify-center">
        <Spinner className="h-7 w-7" />
      </div>
    </AuthLayout>
  );
}

function ExpiredLink({
  initialEmail,
  serverWait,
}: {
  initialEmail: string;
  serverWait: ResendWait | null;
}) {
  const t = useT();
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cooldown = useResendCooldown('activation', email, serverWait);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    await cooldown.send(async () => {
      setError(null);
      try {
        const accepted = await resendActivation(trimmed);
        setSent(true);
        return retryAfterSeconds(accepted);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          setError(t.activation.resendRateLimited);
          return retryAfterSeconds(err.body);
        }
        setError(t.auth.genericError);
        return null;
      }
    });
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl">{t.activation.expiredTitle}</h2>
      <p className="mt-2 text-slate">{t.activation.expiredBody}</p>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4" noValidate>
        {sent && <Banner tone="approved">{t.activation.resendSent}</Banner>}
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
        <ResendButton
          type="submit"
          busy={cooldown.busy}
          secondsLeft={cooldown.secondsLeft}
          className="w-full"
        >
          {t.activation.resendButton}
        </ResendButton>
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
