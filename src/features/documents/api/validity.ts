import type { CertState, CertUpload } from './types';

export const EXPIRING_WITHIN_DAYS = 30;

/** Today's date as `YYYY-MM-DD` in UTC, the date the API's validity rule uses. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The `YYYY-MM-DD` date the API stamps into `date_signed` fields (America/Toronto). */
export function signingDateIso(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
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
 * `validUntil` dates need a new upload; pending uploads stay `pending`, and
 * approved uploads within {@link EXPIRING_WITHIN_DAYS} of expiry are `expiring`.
 */
export function certState(
  upload: Pick<CertUpload, 'reviewStatus' | 'validUntil'> | null | undefined,
  today: string = todayIso(),
): CertState {
  if (!upload) return 'missing';
  if (upload.reviewStatus === 'rejected') return 'rejected';
  const days = daysBetween(today, upload.validUntil);
  if (days < 0) return 'expired';
  if (upload.reviewStatus === 'pending') return 'pending';
  return days <= EXPIRING_WITHIN_DAYS ? 'expiring' : 'valid';
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
