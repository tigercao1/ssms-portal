import type { Messages } from '@/i18n/core/types';
import type { InsuranceRecord, InsuranceRequest } from './types';

export const CAP_CENTS = 40000;
export const RATE_CENTS = 1000;
export const BILLED_STUDENTS_MAX = 4;

export function listCents(hours: number, students: number) {
  return RATE_CENTS * hours * Math.min(students, BILLED_STUDENTS_MAX);
}

export interface LessonPrice {
  listCents: number;
  amountCents: number;
}

export function priceLessons(
  lessons: { durationHours: number; studentCount: number }[],
  {
    owedCents,
    capCents,
    seasonPass,
  }: {
    owedCents: number;
    capCents: number;
    seasonPass: boolean;
  },
): LessonPrice[] {
  let remaining = seasonPass ? 0 : Math.max(0, capCents - owedCents);
  return lessons.map((l) => {
    const list = listCents(l.durationHours, l.studentCount);
    const amount = Math.min(list, remaining);
    remaining -= amount;
    return { listCents: list, amountCents: amount };
  });
}

export function fill(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function dollars(cents: number) {
  const value = cents / 100;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}

export type StatusTone = 'warn' | 'done' | 'muted' | 'info';

export interface RecordStatus {
  label: string;
  sub: string | null;
  tone: StatusTone;
}

export function recordStatus(
  record: Pick<InsuranceRecord, 'kind' | 'coverage' | 'paymentStatus'>,
  t: Messages,
): RecordStatus {
  const s = t.insurance;
  const payment =
    record.paymentStatus === 'paid'
      ? s.statusPaid
      : record.paymentStatus === 'unpaid'
        ? s.statusUnpaid
        : null;
  const tone: StatusTone = record.paymentStatus === 'paid' ? 'done' : 'warn';
  if (record.paymentStatus === 'voided')
    return { label: s.statusVoided, sub: null, tone: 'muted' };
  if (record.kind === 'season_pass')
    return { label: s.statusSeasonPass, sub: payment, tone };
  switch (record.coverage) {
    case 'cap_top_up':
      return { label: s.statusCapped, sub: payment, tone };
    case 'capped':
      return { label: s.statusCappedFree, sub: null, tone: 'info' };
    case 'season_pass':
      return { label: s.statusRegistered, sub: null, tone: 'info' };
    default:
      return { label: payment ?? s.statusRegistered, sub: null, tone };
  }
}

export function requestStatus(
  request: Pick<InsuranceRequest, 'paymentStatus' | 'lessons'>,
  t: Messages,
): { label: string; tone: StatusTone } {
  const s = t.insurance;
  switch (request.paymentStatus) {
    case 'paid':
      return { label: s.statusPaid, tone: 'done' };
    case 'unpaid':
      return { label: s.statusUnpaid, tone: 'warn' };
    case 'voided':
      return { label: s.statusVoided, tone: 'muted' };
    default:
      return {
        label:
          request.lessons.length > 0 &&
          request.lessons.every((l) => l.coverage === 'season_pass')
            ? s.statusSeasonPass
            : s.statusFree,
        tone: 'info',
      };
  }
}
