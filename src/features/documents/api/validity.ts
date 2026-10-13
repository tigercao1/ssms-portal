import type { CertState, CertUpload } from './types';

export const EXPIRING_WITHIN_DAYS = 30;

/** Today's date as `YYYY-MM-DD` in the browser's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const to = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.round((to - from) / 86_400_000);
}

/**
 * Validity of a certification's current upload: rejected uploads and past
 * `validUntil` dates need a new upload; approved or pending uploads within
 * {@link EXPIRING_WITHIN_DAYS} of expiry are `expiring`.
 */
export function certState(
  upload: Pick<CertUpload, 'reviewStatus' | 'validUntil'> | null | undefined,
  today: string = todayIso(),
): CertState {
  if (!upload) return 'missing';
  if (upload.reviewStatus === 'rejected') return 'rejected';
  const days = daysBetween(today, upload.validUntil);
  if (days < 0) return 'expired';
  if (days <= EXPIRING_WITHIN_DAYS) return 'expiring';
  return upload.reviewStatus === 'pending' ? 'pending' : 'valid';
}

/** Latest upload per `(org, track)`, which is the current one for that cert. */
export function currentUploads(uploads: CertUpload[]): CertUpload[] {
  const latest = new Map<string, CertUpload>();
  for (const u of uploads) {
    const key = `${u.org}:${u.track}`;
    const prev = latest.get(key);
    if (!prev || prev.insertedAt < u.insertedAt) latest.set(key, u);
  }
  return [...latest.values()];
}
