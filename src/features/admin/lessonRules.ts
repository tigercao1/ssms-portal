import type { Locale } from '@/i18n/core/types';
import type { AdminClass, LessonProduct } from '@/lib/types';

export function looksComplete(p: LessonProduct): boolean {
  return (
    p.status === 'suggested' &&
    p.lessonType !== 'other' &&
    isPositive(p.groupSize) &&
    isPositive(p.sessions) &&
    isPositive(p.durationMin) &&
    Boolean(p.instructorId)
  );
}

function isPositive(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

export function parsePositiveInt(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  const n = Number(trimmed);
  return n > 0 && n <= 10_000 ? n : 'invalid';
}

export function formatPrice(
  price: LessonProduct['price'],
  currency: string | null,
  locale: Locale,
): string {
  if (price === null || price === '') return '';
  const n = typeof price === 'number' ? price : Number(price);
  if (Number.isNaN(n)) return String(price);
  const tag = locale === 'zh-CN' ? 'zh-CN' : 'en-CA';
  if (!currency) return n.toFixed(2);
  try {
    return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(
      n,
    );
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function groupClassesByDay(
  classes: AdminClass[],
): { day: string; classes: AdminClass[] }[] {
  const sorted = [...classes].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
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

export function rangeToIso(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00`);
  const end = addDays(new Date(`${to}T00:00:00`), 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
