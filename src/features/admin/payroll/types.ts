import type { RateUnit } from '@/lib/types';

export type PayrollPeriodStatus = 'open' | 'finalized';
export type PayrollClassStatus =
  | 'scheduled'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface PayrollSettings {
  anchorDate: string;
  periodDays: number;
  locked: boolean;
}

export interface PayrollPeriod {
  id: string;
  startsOn: string;
  endsOn: string;
  status: PayrollPeriodStatus;
  finalizedAt: string | null;
  finalizedBy: string | null;
  isCurrent: boolean;
}

export interface PayrollLessonLine {
  classId: string;
  instructorId: string;
  instructorName: string | null;
  lessonTypeId: string | null;
  description: string | null;
  lessonTypeNameZh: string | null;
  classStatus: PayrollClassStatus;
  startsAt: string;
  endsAt: string;
  date: string;
  time: string;
  customerNames: string[];
  minutes: number;
  hourlyRate: number | null;
  rateUnit: RateUnit;
  currency: string;
  amount: number;
  flags: string[];
}

export interface PayrollAdjustment {
  id: string;
  instructorId: string;
  instructorName: string | null;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface PayrollInstructorSummary {
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  email: string | null;
  currency: string;
  lessons: number;
  minutes: number;
  lessonAmount: number;
  adjustmentAmount: number;
  total: number;
  needsRate: number;
}

export interface PayrollCurrencyTotal {
  currency: string;
  lessons: number;
  minutes: number;
  amount: number;
}

export interface PayrollPeriodDetail {
  period: PayrollPeriod;
  instructors: PayrollInstructorSummary[];
  lines: PayrollLessonLine[];
  adjustments: PayrollAdjustment[];
  totals: PayrollCurrencyTotal[];
  needsRateCount: number;
}

export interface PayrollAdjustmentInput {
  instructorId: string;
  description: string;
  amount: number;
}
