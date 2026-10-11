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

/** Asks the API to email a fresh activation link. Always 202. Public. */
export function resendActivation(email: string) {
  return api<void>('/activation/resend', {
    method: 'POST',
    body: { email },
    anonymous: true,
  });
}

/** Marks the signed-in user's invite as activated once a password is set. */
export function completeActivation() {
  return api<void>('/me/activation/complete', { method: 'POST' });
}
