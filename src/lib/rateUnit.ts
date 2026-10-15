import type { Messages } from '@/i18n/core/types';
import type { RateUnit } from './types';

export const RATE_UNITS: readonly RateUnit[] = ['hour', 'day'];

export function withRateUnit(rate: string, unit: RateUnit, t: Messages) {
  return (unit === 'day' ? t.rateUnit.perDay : t.rateUnit.perHour).replace(
    '{rate}',
    rate,
  );
}

export function rateUnitLabel(unit: RateUnit, t: Messages) {
  return unit === 'day' ? t.rateUnit.day : t.rateUnit.hour;
}
