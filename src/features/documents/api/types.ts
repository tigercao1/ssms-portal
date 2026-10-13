import type { CertOrg, CertTrack } from '@/lib/types';

export type TemplateKind = 'sign' | 'read';
export type TemplateAudience = 'instructor' | 'customer';
export type FieldType =
  | 'signature'
  | 'initials'
  | 'full_name'
  | 'date'
  | 'text'
  | 'checkbox';
export type FieldPrefill = 'full_name' | 'email' | 'date_signed' | null;
export type AssignmentStatus = 'assigned' | 'viewed' | 'completed' | 'archived';
export type SubjectType = 'instructor' | 'customer';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type CertState =
  | 'missing'
  | 'pending'
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'rejected';
export type CertContentType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export const FIELD_TYPES: readonly FieldType[] = [
  'signature',
  'initials',
  'full_name',
  'date',
  'text',
  'checkbox',
];

/** Page size of the unrotated page in PDF points, plus its /Rotate. */
export interface TemplatePage {
  width: number;
  height: number;
  rotate: 0 | 90 | 180 | 270;
}

/**
 * A placed field. `x`, `y`, `w`, `h` are PDF points in the unrotated page's
 * user space with the origin at the bottom-left; `page` is 1-based.
 */
export interface Field {
  id: string;
  type: FieldType;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  required: boolean;
  labelEn: string;
  labelZh: string | null;
  prefill: FieldPrefill;
}

export interface TemplateSummary {
  id: string;
  kind: TemplateKind;
  audience: TemplateAudience;
  titleEn: string;
  titleZh: string | null;
  descriptionEn: string | null;
  descriptionZh: string | null;
  required: boolean;
  isActive: boolean;
  sortOrder: number;
  sourceSha256: string | null;
  pageCount: number | null;
  updatedBy: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface Template extends TemplateSummary {
  pages: TemplatePage[];
  fields: Field[];
  sourceUrl: string | null;
  /** Set by source confirm when replacing the PDF dropped existing fields. */
  fieldsCleared?: boolean;
}

export interface TemplateCreate {
  kind: TemplateKind;
  audience: TemplateAudience;
  titleEn: string;
  titleZh?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  required: boolean;
  sortOrder: number;
}

export interface TemplatePatch {
  titleEn?: string;
  titleZh?: string | null;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  isActive?: boolean;
  required?: boolean;
  sortOrder?: number;
}

export interface UploadUrl {
  uploadUrl: string;
  expiresAt: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
  sha256: string;
}

export interface FileUrl {
  url: string;
  expiresAt: string;
}

export interface Assignment {
  id: string;
  templateId: string;
  subjectType: SubjectType;
  subjectId: string;
  season: string | null;
  classId: string | null;
  status: AssignmentStatus;
  assignedAt: string;
  viewedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  reminderSentAt: string | null;
  signerName: string | null;
  signerEmail: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  consentAt: string | null;
  templateSha256: string | null;
  signedSha256: string | null;
  fieldValues: Record<string, string | boolean>;
  insertedAt: string;
  updatedAt: string;
}

export interface AssignRequest {
  templateId: string;
  season: string;
  instructorIds?: string[];
  allActiveInstructors?: boolean;
}

export interface AssignResult {
  created: number;
  skipped: number;
}

export interface CertUpload {
  id: string;
  instructorId: string;
  org: CertOrg;
  track: CertTrack;
  sha256: string;
  contentType: CertContentType;
  sizeBytes: number;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  validUntil: string;
  expiryReminderSentAt: string | null;
  aiResult: unknown;
  aiModel: string | null;
  aiCheckedAt: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface CertUploadReview {
  reviewStatus: ReviewStatus;
  reviewNote?: string;
  validUntil?: string;
}

export interface InstructorDocuments {
  assignments: Assignment[];
  certificationUploads: CertUpload[];
}

/** Template fields the signer needs, as returned inside `/me` payloads. */
export interface SignerTemplate {
  id: string;
  kind: TemplateKind;
  titleEn: string;
  titleZh: string | null;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  required?: boolean;
  pages: TemplatePage[];
  fields: Field[];
}

export interface DocumentChecklistItem {
  type: 'document';
  assignment: Assignment;
  template: Omit<SignerTemplate, 'pages' | 'fields'>;
}

export interface CertificationChecklistItem {
  type: 'certification';
  org: CertOrg;
  track: CertTrack;
  level: number;
  upload: CertUpload | null;
  validUntil: string | null;
  state: CertState;
}

export type ChecklistItem = DocumentChecklistItem | CertificationChecklistItem;

export interface MyChecklist {
  season: string;
  items: ChecklistItem[];
}

export interface MyDocument {
  assignment: Assignment;
  template: SignerTemplate;
  sourceUrl: string;
}

export type SignatureValue =
  | { mode: 'drawn'; png: string }
  | { mode: 'typed'; text: string };

export interface ReadCompletion {
  acknowledged: true;
}

export interface SignCompletion {
  consent: true;
  signerName: string;
  values: Record<string, string | boolean>;
  signatures: Record<string, SignatureValue>;
}

export type CompleteRequest = ReadCompletion | SignCompletion;

export interface CompleteResult {
  assignment: Assignment;
  signedUrl?: string;
}

export interface CertUploadUrlRequest {
  org: CertOrg;
  track: CertTrack;
  validUntil: string;
  contentType: CertContentType;
  contentLength: number;
}

export interface CertUploadUrl {
  uploadId: string;
  uploadUrl: string;
  expiresAt: string;
}
