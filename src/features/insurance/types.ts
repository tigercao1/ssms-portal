export type InsuranceLockReason =
  | 'pending_approval'
  | 'rejected'
  | 'onboarding_incomplete';
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
  students: InsuranceStudent[];
  studentCount: number | null;
  listCents: number;
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
  requests: InsuranceRequest[];
}

export interface InsuranceRequest {
  id: string;
  requestNo: string;
  seasonKey: string;
  paymentStatus: InsurancePaymentStatus;
  totalCents: number;
  lessonCount: number;
  studentCount: number;
  createdAt: string;
  paidOn: string | null;
  lessons: InsuranceRecord[];
}

export interface RequestLessonBody {
  lessonDate: string;
  durationHours: number;
  locationId?: string;
  locationOther?: string;
  students: InsuranceStudent[];
}

export interface SubmitRequestBody {
  lessons: RequestLessonBody[];
  idempotencyKey: string;
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
  seasonPassRecordId: string | null;
  seasonPassPaymentStatus: Extract<
    InsurancePaymentStatus,
    'unpaid' | 'paid'
  > | null;
}

export interface GrantSeasonPassBody {
  season: string;
  note?: string;
  paidOn?: string;
}

export interface AdminInsuranceRecord extends InsuranceRecord {
  requestId: string | null;
  requestNo: string | null;
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  instructorEmail: string | null;
  paidNote: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
  voidedFromStatus: Exclude<InsurancePaymentStatus, 'voided'> | null;
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

export interface AdminInsuranceRequest extends InsuranceRequest {
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  instructorEmail: string | null;
  paidNote: string | null;
  voidedAt: string | null;
  voidedReason: string | null;
}

export interface AdminInsuranceRequestsPage {
  requests: AdminInsuranceRequest[];
  total: number;
}
