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
  dateOfBirth: string | null;
  preferredLanguage: PreferredLanguage;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  profilePhotoUrl: string | null;
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
  insertedAt: string;
  updatedAt: string;
}

export interface ReferenceRecord {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UserRoleRecord {
  userId: string;
  role: 'admin' | 'instructor';
  previousRole: 'admin' | 'instructor' | null;
  changed: boolean;
}
