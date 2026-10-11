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
  displayNameEn: string;
  displayNameZh: string | null;
  bioEn: string | null;
  bioZh: string | null;
  bioEnMachineTranslated: boolean;
  bioZhMachineTranslated: boolean;
  bioEnTranslatedBy?: string | null;
  bioZhTranslatedBy?: string | null;
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
  displayNameEn?: string;
  displayNameZh?: string | null;
  bioEn?: string | null;
  bioZh?: string | null;
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
  displayOrder?: number | null;
  googleCalendarId?: string | null;
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

export type LessonType = 'private' | 'semi_private' | 'group' | 'other';
export type LessonProductStatus = 'suggested' | 'confirmed' | 'ignored';

export interface LessonProduct {
  id: string;
  shopifyProductId: number | string;
  shopifyVariantId: number | string;
  productTitle: string;
  variantTitle: string | null;
  lessonType: LessonType;
  groupSize: number | null;
  sessions: number | null;
  durationMin: number | null;
  pricedPerStudent: boolean;
  instructorId: string | null;
  status: LessonProductStatus;
  price: number | string | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LessonProductPatch {
  lessonType?: LessonType;
  groupSize?: number | null;
  sessions?: number | null;
  durationMin?: number | null;
  pricedPerStudent?: boolean;
  instructorId?: string | null;
  status?: LessonProductStatus;
}

export type LessonProductSyncResult = Record<string, unknown>;

export type ClassStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled';
export type ClassSource = 'ssms' | 'app_import' | 'app_webhook';
export type Attendance = 'expected' | 'attended' | 'no_show';

export interface ClassParticipant {
  customerId: string;
  name: string | null;
  email?: string | null;
  purchaseId: string | null;
  attendance: Attendance;
}

export interface AdminClass {
  id: string;
  instructorId: string;
  lessonProductId: string | null;
  locationId: string | null;
  startsAt: string;
  endsAt: string;
  status: ClassStatus;
  source: ClassSource;
  googleCalendarId: string | null;
  googleEventId: string | null;
  notes: string | null;
  participants: ClassParticipant[];
}
