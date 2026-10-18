import { api } from '@/lib/api';

export interface RedeemedInvite {
  email: string;
  tokenHash: string;
}

/** Exchanges an invite token for a one-time magic-link token hash. Public. */
export function redeemActivation(token: string) {
  return api<RedeemedInvite>('/activation/redeem', {
    method: 'POST',
    body: { token },
    anonymous: true,
  });
}

export interface ResendAccepted {
  status: 'accepted';
  retryAfterSeconds: number;
}

export function retryAfterSeconds(body: unknown): number | null {
  const seconds = (body as { retryAfterSeconds?: unknown } | undefined)
    ?.retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? Math.max(0, seconds)
    : null;
}

/** Asks the API to email a fresh activation link. Always 202. Public. */
export function resendActivation(email: string) {
  return api<ResendAccepted>('/activation/resend', {
    method: 'POST',
    body: { email },
    anonymous: true,
  });
}

/** Marks the signed-in user's invite as activated once a password is set. */
export function completeActivation() {
  return api<void>('/me/activation/complete', { method: 'POST' });
}
