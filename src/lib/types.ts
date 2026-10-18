/**
 * API response/request types mirrored from the NestJS contracts (W0.3 shared).
 * Keep in sync with `ssms-api` presenter types (InstructorProfile,
 * AdminInstructorRecord, ReferenceItem, etc.).
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type PreferredLanguage = 'en' | 'zh-CN';
export type CertOrg = 'csia' | 'casi';
export type CertTrack = 'regular' | 'park' | 'carving';
export type Discipline = 'ski' | 'snowboard';

export interface RefItem {
  id: string;
  key: string;
  name: string;
  nameZh?: string | null;
  sortOrder?: number;
}

export interface Certification {
  org: CertOrg;
  track: CertTrack;
  level: number;
  isPartial: boolean;
  partialComponents: string[];
  achievedOn: string | null;
  display: string;
}

export interface TrainerStatus {
  discipline: Discipline;
  rookieSessionCompleted: boolean;
  trainerExamPassed: boolean;
  trainerLevel: number | null;
  display: string | null;
}

/** `/me/instructor` presenter. */
export interface InstructorProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  legalName?: string;
  displayNameEn: string;
  displayNameZh: string | null;
  bioEn: string | null;
  bioZh: string | null;
  bioEnMachineTranslated: boolean;
  bioZhMachineTranslated: boolean;
  bioEnTranslatedBy?: string | null;
  bioZhTranslatedBy?: string | null;
  bioEnUpdatedAt?: string | null;
  bioZhUpdatedAt?: string | null;
  dateOfBirth: string | null;
  preferredLanguage: PreferredLanguage;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  profilePhotoUrl: string | null;
  photo2Url?: string | null;
  photo3Url?: string | null;
  displayOrder?: number | null;
  minStudentAge: number;
  teachingLocations: RefItem[];
  languages: RefItem[];
  courseLevelsOffered: RefItem[];
  certifications: Certification[];
  trainerStatus: TrainerStatus[];
}

/** PATCH /me/instructor body (all optional; omit = leave, [] = clear). */
export interface UpdateProfileBody {
  firstName?: string;
  lastName?: string;
  displayNameEn?: string;
  displayNameZh?: string | null;
  bioEn?: string | null;
  bioZh?: string | null;
  bioEnMachineTranslated?: boolean;
  bioZhMachineTranslated?: boolean;
  dateOfBirth?: string | null;
  preferredLanguage?: PreferredLanguage;
  profilePhotoUrl?: string | null;
  minStudentAge?: number;
  teachingLocationIds?: string[];
  languageIds?: string[];
  courseLevelOfferedIds?: string[];
  certifications?: Array<{
    org: CertOrg;
    track: CertTrack;
    level: number;
    isPartial?: boolean;
    partialComponents?: string[];
    achievedOn?: string | null;
  }>;
  trainerStatus?: Array<{
    discipline: Discipline;
    rookieSessionCompleted?: boolean;
    trainerExamPassed?: boolean;
    trainerLevel?: number | null;
  }>;
}

/** Daily Refine/Use-as-written quota (`GET /me/instructor/bio/ai-usage`). */
export interface BioAiUsage {
  limit: number;
  used: number;
  remaining: number;
  resetsAt: string | null;
}

export type BioDraftMode = 'refine' | 'translate';

/** `POST /me/instructor/bio/draft` — nothing is saved. */
export interface BioDraft {
  en: string;
  zh: string;
  /** Languages present in the instructor's input. */
  sourceLangs: ('en' | 'zh-CN')[];
  model: string | null;
  usage: BioAiUsage;
}

export type PhotoSlot = 1 | 2 | 3;
export type ExtraPhotoSlot = 2 | 3;

export type AllowedAvatarMime = 'image/jpeg' | 'image/png' | 'image/webp';
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export interface AvatarUploadTicket {
  uploadUrl: string;
  token: string;
  publicUrl: string;
  path: string;
}

/** Admin instructor list/detail presenter. */
export interface AdminInstructorRecord {
  id: string;
  authUserId: string;
  email: string;
  displayNameEn: string;
  displayNameZh: string | null;
  bioEn: string | null;
  bioZh: string | null;
  dateOfBirth: string | null;
  profilePhotoUrl: string | null;
  preferredLanguage: PreferredLanguage;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  calendarConnected: boolean;
  displayOrder?: number | null;
  publishedAt: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface ReferenceRecord {
  id: string;
  key: string;
  name: string;
  nameZh?: string | null;
  nameEnTranslatedBy?: string | null;
  nameZhTranslatedBy?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ReferenceUsage {
  instructorCount: number;
}

export interface DeletedReferenceRecord extends ReferenceRecord {
  removedLinkCount: number;
}

export type UserRole = 'admin' | 'instructor';

export interface CurrentUserRole {
  role: UserRole;
}

export interface UserRoleRecord {
  userId: string;
  role: 'admin' | 'instructor';
  previousRole: 'admin' | 'instructor' | null;
  changed: boolean;
}

export interface ShopifySyncStatus {
  enabled: boolean;
  masterSwitch: boolean;
  configured: boolean;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  queue: {
    pending: number;
    retrying: number;
    oldestEnqueuedAt: string | null;
  };
  entries: {
    synced: number;
    active: number;
    draft: number;
    failed: number;
  };
  storefrontPreviewBaseUrl: string;
}

export interface ShopifySyncRunResult {
  enqueued: number;
  processing: boolean;
}

export type ShopifyEntryStatus = 'active' | 'draft';

export interface ShopifyInstructorSync {
  handle: string | null;
  metaobjectId: string | null;
  status: ShopifyEntryStatus | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  queued: boolean;
  attempts: number;
  previewUrl: string | null;
}

export type PublicPageStatus = 'draft' | 'published';

export interface PublicPage {
  id: string;
  slug: string;
  title: string;
  status: PublicPageStatus;
  hasContent: boolean;
  sizeBytes: number | null;
  hasUnpublishedChanges: boolean;
  url: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonType {
  id: string;
  nameEn: string;
  nameZh: string | null;
  groupSize: number | null;
  durationMin: number;
  isPromo: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LessonTypeInput {
  nameEn?: string;
  nameZh?: string | null;
  groupSize?: number | null;
  durationMin?: number;
  isPromo?: boolean;
  active?: boolean;
  sortOrder?: number;
}

export type RateUnit = 'hour' | 'day';

export interface PayRate {
  id: string;
  lessonTypeId: string;
  instructorId: string | null;
  hourlyRate: number;
  rateUnit: RateUnit;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayRateCreate {
  lessonTypeId: string;
  instructorId: string | null;
  hourlyRate: number;
  rateUnit?: RateUnit;
  currency?: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface PayRatePatch {
  hourlyRate?: number;
  rateUnit?: RateUnit;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface Customer {
  id: string;
  shopifyCustomerId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  shopifyUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCreate {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

export interface CustomerSyncResult {
  mode: 'backfill' | 'incremental';
  updatedSince: string | null;
  pages: number;
  fetched: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CustomerSyncStatus {
  scheduled: boolean;
  intervalMinutes: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFetched: number | null;
  lastError: string | null;
}

export type ClassStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';
export type ClassSource = 'ssms' | 'app_import' | 'app_webhook';
export type Attendance = 'expected' | 'attended' | 'no_show';

export interface ClassParticipant {
  customerId: string;
  attendance: Attendance;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export type GoogleSyncStatus = 'ok' | 'pending' | 'failed';

export interface AdminClass {
  id: string;
  instructorId: string;
  instructorName: string | null;
  instructorNameZh: string | null;
  lessonTypeId: string | null;
  lessonTypeNameEn: string | null;
  lessonTypeNameZh: string | null;
  durationMin: number | null;
  groupSize: number | null;
  isPromo: boolean | null;
  locationId: string | null;
  locationName: string | null;
  startsAt: string;
  endsAt: string;
  status: ClassStatus;
  source: ClassSource;
  googleCalendarId: string | null;
  googleEventId: string | null;
  googleSyncStatus: GoogleSyncStatus;
  googleSyncError: string | null;
  googleSyncAttempts: number;
  googleSyncedAt: string | null;
  notes: string | null;
  participants: ClassParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface InstructorGoogleCalendar {
  instructorId: string;
  googleCalendarId: string | null;
  calendarSummary: string | null;
  updatedAt: string | null;
}

export interface InstructorGoogleCalendarInput {
  googleCalendarId: string | null;
}

export interface InstructorCalendarOverview extends InstructorGoogleCalendar {
  displayNameEn: string;
  displayNameZh: string | null;
  email: string | null;
  approvalStatus: string;
  isActive: boolean;
}

export interface InstructorCalendarsOverview {
  google: { connected: boolean; error: string | null };
  instructors: InstructorCalendarOverview[];
}

export interface MyCalendarStatus {
  connected: boolean;
}

export type GoLiveProfileField =
  | 'displayNameEn'
  | 'bio'
  | 'photo'
  | 'locations'
  | 'languages'
  | 'courseLevels';

export type GoLiveMissingItem =
  | { group: 'profile'; field: GoLiveProfileField }
  | { group: 'certification'; reason: 'none_verified' }
  | {
      group: 'onboarding';
      assignmentId: string;
      titleEn: string;
      titleZh: string | null;
    }
  | { group: 'review' };

export type CertVerificationStatus =
  | 'verified'
  | 'pending'
  | 'rejected'
  | 'expired'
  | 'no_proof'
  | 'level_mismatch';

export interface GoLiveCertification {
  org: CertOrg;
  track: CertTrack;
  level: number;
  status: CertVerificationStatus;
  validUntil: string | null;
}

export interface GoLiveReadiness {
  live: boolean;
  ready: boolean;
  liveUrl: string | null;
  missing: GoLiveMissingItem[];
  certifications: GoLiveCertification[];
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scopes: string[];
  connectedAt: string | null;
  lastError: string | null;
}

export interface GoogleConnectResponse {
  url: string;
}

export type GoogleCalendarAccessRole =
  | 'owner'
  | 'writer'
  | 'reader'
  | 'freeBusyReader'
  | (string & {});

export interface GoogleCalendar {
  id: string;
  summary: string;
  accessRole: GoogleCalendarAccessRole;
  canWrite: boolean;
}
