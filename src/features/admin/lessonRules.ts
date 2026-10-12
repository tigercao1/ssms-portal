import type { Locale } from '@/i18n/core/types';
import type { AdminClass } from '@/lib/types';

export function parsePositiveInt(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const n = Number(trimmed);
  return n > 0 && n <= 10_000 ? n : 'invalid';
}

export function parseRate(value: string): number | 'invalid' {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 'invalid';
  const n = Number(trimmed);
  return n <= 99_999_999.99 ? n : 'invalid';
}

export function formatRate(
  amount: number,
  currency: string,
  locale: Locale,
): string {
  const tag = locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
  try {
    return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(
      amount,
    );
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function rateIsCurrent(
  rate: { effectiveFrom: string; effectiveTo: string | null },
  today: string,
): boolean {
  return (
    rate.effectiveFrom <= today &&
    (rate.effectiveTo === null || rate.effectiveTo >= today)
  );
}

export function customerName(c: {
  firstName: string | null;
  lastName: string | null;
}): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function groupClassesByDay(
  classes: AdminClass[],
): { day: string; classes: AdminClass[] }[] {
  const sorted = [...classes].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const groups = new Map<string, AdminClass[]>();
  for (const c of sorted) {
    const day = localDayKey(c.startsAt);
    const list = groups.get(day) ?? [];
    list.push(c);
    groups.set(day, list);
  }
  return [...groups.entries()].map(([day, list]) => ({ day, classes: list }));
}

export function dateInputValue(d: Date): string {
  return localDayKey(d.toISOString());
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function rangeToIso(
  from: string,
  to: string,
): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = addDays(new Date(`${to}T00:00:00`), 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
