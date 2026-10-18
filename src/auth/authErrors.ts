import type { AuthError } from '@supabase/supabase-js';

export function isRateLimited(err: AuthError) {
  return err.status === 429 || Boolean(err.code?.startsWith('over_'));
}

export function isUnreachable(err: AuthError) {
  return err.name === 'AuthRetryableFetchError' || (err.status ?? 0) >= 500;
}

export function rateLimitWaitSeconds(err: AuthError): number | null {
  const match = /after (\d+) seconds?/i.exec(err.message);
  return match ? Number(match[1]) : null;
}
