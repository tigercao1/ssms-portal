import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_PREFIX = 'ssms.resendCooldown.';

export type ResendPurpose = 'activation' | 'verify-email' | 'password-reset';

export interface ResendWait {
  email: string;
  seconds: number;
}

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

export function useResendCooldown(
  purpose: ResendPurpose,
  email: string,
  serverWait: ResendWait | null = null,
) {
  const key = storageKey(purpose, email);
  const [deadlines] = useState(() => {
    const known = new Map<string, number>();
    if (serverWait) {
      const serverKey = storageKey(purpose, serverWait.email);
      known.set(serverKey, writeWait(serverKey, serverWait.seconds));
    }
    return known;
  });
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const deadlineFor = useCallback(
    (k: string) => {
      if (!deadlines.has(k)) deadlines.set(k, readUntil(k));
      return deadlines.get(k) ?? 0;
    },
    [deadlines],
  );

  const until = deadlineFor(key);

  useEffect(() => {
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
      if (inFlight.current || deadlineFor(key) > Date.now()) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const seconds = await attempt();
        if (seconds !== null) deadlines.set(key, writeWait(key, seconds));
      } finally {
        inFlight.current = false;
        setBusy(false);
        setNow(Date.now());
      }
    },
    [key, deadlines, deadlineFor],
  );

  const secondsLeft = Math.max(0, Math.ceil((until - now) / 1000));
  return { send, busy, secondsLeft, coolingDown: secondsLeft > 0 };
}
