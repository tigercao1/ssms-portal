import type { RateUnit } from '@/lib/types';

export type LessonsLockReason = 'pending_approval' | 'rejected';

export interface MyLesson {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'completed' | 'no_show';
  lessonTypeNameEn: string | null;
  lessonTypeNameZh: string | null;
  locationName: string | null;
  students: string[];
  minutes: number;
  rate: number | null;
  rateUnit: RateUnit;
  currency: string;
  amount: number | null;
  needsRate: boolean;
}

export interface MyAdjustment {
  id: string;
  description: string;
  amount: number;
  currency: string;
}

export interface MyPeriodTotal {
  currency: string;
  lessons: number;
  minutes: number;
  lessonAmount: number;
  adjustmentAmount: number;
  total: number;
  needsRateCount: number;
}

export interface MyPayPeriod {
  startsOn: string;
  endsOn: string;
  status: 'awaiting' | 'paid';
  finalizedAt: string | null;
  lessons: MyLesson[];
  adjustments: MyAdjustment[];
  totals: MyPeriodTotal[];
}

export interface MyProjectedTotal {
  currency: string;
  amount: number;
  lessons: number;
}

export interface MyLessonsResponse {
  locked: boolean;
  lockReason: LessonsLockReason | null;
  upcoming: {
    lessons: MyLesson[];
    projected: MyProjectedTotal[];
    needsRateCount: number;
  };
  periods: MyPayPeriod[];
}
