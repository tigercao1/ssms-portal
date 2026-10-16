export type InsuranceLockReason = 'pending_approval' | 'rejected';
export type InsuranceKind = 'lesson' | 'season_pass';
export type InsuranceCoverage =
  | 'per_lesson'
  | 'cap_top_up'
  | 'capped'
  | 'season_pass';
export type InsurancePaymentStatus =
  | 'unpaid'
  | 'paid'
  | 'not_required'
  | 'voided';
export type SeasonCoverage = 'none' | 'capped' | 'season_pass';

export interface InsuranceStudent {
  name: string;
  waiverConfirmed: boolean;
}

export interface InsuranceRecord {
  id: string;
  recordNo: string;
  kind: InsuranceKind;
  seasonKey: string;
  lessonDate: string | null;
  durationHours: number | null;
  locationId: string | null;
  locationName: string | null;
  locationOther: string | null;
  students: InsuranceStudent[] | null;
  studentCount: number | null;
  listCents: number | null;
  amountCents: number;
  coverage: InsuranceCoverage | null;
  paymentStatus: InsurancePaymentStatus;
  paidOn: string | null;
  createdAt: string;
}

export interface InsuranceSeason {
  key: string;
  startsOn: string;
  endsOn: string;
}

export interface MyInsurance {
  locked: boolean;
  lockReason: InsuranceLockReason | null;
  season: InsuranceSeason | null;
  capCents: number;
  owedCents: number;
  paidCents: number;
  unpaidCents: number;
  coverage: SeasonCoverage;
  records: InsuranceRecord[];
}

export interface RegisterLessonBody {
  lessonDate: string;
  durationHours: number;
  locationId?: string;
  locationOther?: string;
  students: InsuranceStudent[];
  topUp?: boolean;
  idempotencyKey: string;
}

export interface SeasonPassBody {
  season?: string;
  idempotencyKey: string;
}

export interface CapReached {
  code: 'cap_reached';
  listCents: number;
  owedCents: number;
  topUpCents: number;
}

export interface AdminInsuranceSummary {
  instructorId: string;
  name: string | null;
  nameZh: string | null;
  email: string | null;
  owedCents: number;
  paidCents: number;
  unpaidCents: number;
  coverage: SeasonCoverage;
  records: number;
}

export interface AdminInsuranceRecord extends InsuranceRecord {
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  instructorEmail: string | null;
  paidNote: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  voidedFromStatus: InsurancePaymentStatus | null;
}

export interface AdminInsuranceRecordsPage {
  records: AdminInsuranceRecord[];
  total: number;
}

export interface AdminInsuranceFilter {
  season: string;
  instructorId?: string;
  paymentStatus?: InsurancePaymentStatus;
  page: number;
  limit: number;
}
