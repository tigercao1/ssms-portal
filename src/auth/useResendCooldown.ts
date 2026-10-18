import { useCallback, useEffect, useRef, useState } from 'react';

export const RESEND_COOLDOWN_MS = 60_000;
const STORAGE_PREFIX = 'ssms.resendCooldown.';

export type ResendPurpose = 'activation' | 'verify-email' | 'password-reset';

export type ResendResult = 'sent' | 'rate-limited' | 'failed';

function storageKey(purpose: ResendPurpose, email: string) {
  return `${STORAGE_PREFIX}${purpose}:${email.trim().toLowerCase()}`;
}

function readUntil(key: string): number {
  try {
    const until = Number(localStorage.getItem(key));
    return Number.isFinite(until) ? until : 0;
  } catch {
    return 0;
  }
}

function writeUntil(key: string, until: number): boolean {
  try {
    localStorage.setItem(key, String(until));
    return true;
  } catch {
    return false;
  }
}

export function useResendCooldown(purpose: ResendPurpose, email: string) {
  const key = storageKey(purpose, email);
  const [until, setUntil] = useState(() => readUntil(key));
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    setUntil(readUntil(key));
    setNow(Date.now());
  }, [key]);

  useEffect(() => {
    if (until <= now) return;
    const wait = (until - now) % 1000 || 1000;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [until, now]);

  const send = useCallback(
    async (
      attempt: () => Promise<ResendResult>,
    ): Promise<ResendResult | null> => {
      if (inFlight.current || readUntil(key) > Date.now()) return null;
      inFlight.current = true;
      setBusy(true);
      try {
        const result = await attempt();
        if (result !== 'failed') {
          const next = Date.now() + RESEND_COOLDOWN_MS;
          writeUntil(key, next);
          setUntil(next);
          setNow(Date.now());
        }
        return result;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [key],
  );

  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));
  return { send, busy, secondsLeft, coolingDown: secondsLeft > 0 };
}
