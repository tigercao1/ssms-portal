export const EXPIRY_PRESET_DAYS = [30, 90, 365] as const;
export const MAX_EXPIRY_YEARS = 3;

export type ExpiryChoice =
  | { kind: 'days'; days: number }
  | { kind: 'custom'; date: string }
  | { kind: 'never' };

const DAY_MS = 86_400_000;

function localDateIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function customDateBounds(now: Date = new Date()) {
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const latest = new Date(now);
  latest.setFullYear(latest.getFullYear() + MAX_EXPIRY_YEARS);
  latest.setDate(latest.getDate() - 1);
  return { min: localDateIso(tomorrow), max: localDateIso(latest) };
}

export function isCustomDateValid(date: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { min, max } = customDateBounds(now);
  return date >= min && date <= max;
}

export function expiresAtFor(
  choice: ExpiryChoice,
  now: Date = new Date(),
): string | null {
  switch (choice.kind) {
    case 'never':
      return null;
    case 'days':
      return new Date(now.getTime() + choice.days * DAY_MS).toISOString();
    case 'custom':
      return new Date(`${choice.date}T23:59:59`).toISOString();
  }
}
