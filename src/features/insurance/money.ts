import type { Messages } from '@/i18n/core/types';
import type { InsuranceRecord } from './types';

export const CAP_CENTS = 40000;
export const RATE_CENTS = 1000;
export const BILLED_STUDENTS_MAX = 4;

export function listCents(hours: number, students: number) {
  return (
    RATE_CENTS * hours * Math.min(Math.max(students, 1), BILLED_STUDENTS_MAX)
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
