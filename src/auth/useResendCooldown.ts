import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_PREFIX = 'ssms.resendCooldown.';

export type ResendPurpose = 'activation' | 'verify-email' | 'password-reset';

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

function writeWait(key: string, seconds: number): number {
  const until = seconds > 0 ? Date.now() + seconds * 1000 : 0;
  try {
    if (until > 0) localStorage.setItem(key, String(until));
    else localStorage.removeItem(key);
  } catch {
    return until;
  }
  return until;
}

export function saveResendWait(
  purpose: ResendPurpose,
  email: string,
  seconds: number,
) {
  writeWait(storageKey(purpose, email), seconds);
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
    async (attempt: () => Promise<number | null>): Promise<void> => {
      if (inFlight.current || readUntil(key) > Date.now()) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const seconds = await attempt();
        if (seconds !== null) {
          setUntil(writeWait(key, seconds));
          setNow(Date.now());
        }
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
