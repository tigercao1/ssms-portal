import type { CertOrg, CertTrack } from '@/lib/types';

export type TemplateKind = 'sign' | 'read';
export type TemplateAudience = 'instructor' | 'customer';
export type TemplateStatus = 'draft' | 'live' | 'retired';
export type TemplateAssignTo = 'all' | 'selected';
export type ChecklistLockReason =
  | 'pending_approval'
  | 'rejected'
  | 'deactivated';
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

/**
 * Visible box of the unrotated page in PDF points (CropBox clipped to
 * MediaBox) plus its /Rotate. `x`, `y` is the box's lower-left corner in user
 * space, so fields must lie within `[x, x + width] × [y, y + height]`.
 */
export interface TemplatePage {
  x: number;
  y: number;
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
  status: TemplateStatus;
  assignTo: TemplateAssignTo | null;
  season: string | null;
  publishedAt: string | null;
  hasCompletedAssignments: boolean;
  assignedCount: number;
  completedCount: number;
  approvedAssignedCount: number;
  approvedCompletedCount: number;
  approvedCount: number;
  sortOrder: number;
  hasSource: boolean;
  pageCount: number | null;
  fieldCount: number;
  insertedAt: string;
  updatedAt: string;
}

export interface Template extends TemplateSummary {
  sourceSha256: string | null;
  pages: TemplatePage[];
  fields: Field[];
  sourceUrl: string | null;
  updatedBy: string | null;
}

/** Response of a source confirm: `fieldsCleared` says whether placed fields were dropped. */
export interface ConfirmedTemplate extends Template {
  fieldsCleared: boolean;
}

export interface TemplateCreate {
  kind: TemplateKind;
  audience: TemplateAudience;
  titleEn: string;
  titleZh?: string | null;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  required: boolean;
  sortOrder: number;
}

export interface TemplatePatch {
  titleEn?: string;
  titleZh?: string | null;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  required?: boolean;
  sortOrder?: number;
}

export interface PublishPreview {
  season: string;
  approvedCount: number;
  pendingCount: number;
  alreadyAssignedCount: number;
}

export interface PublishRequest {
  assignTo: TemplateAssignTo;
  season?: string;
  instructorIds?: string[];
}

export interface ChangeAudienceRequest {
  assignTo: TemplateAssignTo;
}

export interface PublishResult {
  template: Template;
  created: number;
  skipped: number;
}

export interface UploadUrl {
  uploadUrl: string;
  expiresAt: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: string;
  sha256: string | null;
}

export interface FileUrl {
  url: string;
  expiresAt: string;
  sha256: string;
}

/** Template columns embedded on an assignment. */
export interface AssignmentTemplate {
  id: string;
  kind: TemplateKind;
  titleEn: string;
  titleZh: string | null;
  required: boolean;
}

export interface Assignment {
  id: string;
  templateId: string;
  template: AssignmentTemplate | null;
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
  consentAt: string | null;
  templateSha256: string | null;
  signedSha256: string | null;
  hasSignedCopy: boolean;
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
  contentType: string;
  sizeBytes: number;
  sha256: string;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  validUntil: string;
  current: boolean;
  state: CertState;
  aiResult: Record<string, unknown> | null;
  aiModel: string | null;
  aiCheckedAt: string | null;
  insertedAt: string;
  updatedAt: string;
}

export interface CertUploadReview {
  reviewStatus: ReviewStatus;
  reviewNote?: string | null;
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
  pageCount: number | null;
  pages: TemplatePage[];
  fields: Field[];
}

export interface DocumentChecklistItem {
  type: 'document';
  assignmentId: string;
  templateId: string;
  kind: TemplateKind;
  titleEn: string;
  titleZh: string | null;
  descriptionEn: string | null;
  descriptionZh: string | null;
  required: boolean;
  status: AssignmentStatus;
  season: string | null;
  assignedAt: string;
  viewedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
}

export interface CertificationChecklistItem {
  type: 'certification';
  org: CertOrg;
  track: CertTrack;
  level: number;
  uploadId: string | null;
  reviewStatus: ReviewStatus | null;
  reviewNote: string | null;
  validUntil: string | null;
  state: CertState;
}

/** A document an instructor will get once approved; nothing is assigned yet. */
export interface DocumentPreviewItem extends Omit<
  DocumentChecklistItem,
  'assignmentId' | 'status' | 'assignedAt'
> {
  assignmentId: null;
  status: null;
  assignedAt: null;
}

export type ChecklistItem =
  | DocumentChecklistItem
  | DocumentPreviewItem
  | CertificationChecklistItem;

export interface MyChecklist {
  season: string | null;
  locked: boolean;
  lockReason: ChecklistLockReason | null;
  items: ChecklistItem[];
}

/** E-sign consent wording, owned by the API and shown verbatim. */
export interface ConsentText {
  en: string;
  zh: string;
}

export interface MyDocument {
  assignment: Assignment;
  template: SignerTemplate;
  sourceUrl: string | null;
  consentText: ConsentText;
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

export type TemplateAssignmentStatusFilter = 'all' | 'completed' | 'open';

export interface TemplateAssignmentQuery {
  season?: string;
  status?: TemplateAssignmentStatusFilter;
  hasSignedCopy?: boolean;
  q?: string;
  page: number;
  limit: number;
}

export interface TemplateAssignmentRow {
  id: string;
  status: 'assigned' | 'viewed' | 'completed';
  season: string | null;
  instructor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  signerName: string | null;
  signerEmail: string | null;
  assignedAt: string;
  viewedAt: string | null;
  completedAt: string | null;
  signedSha256: string | null;
  hasSignedCopy: boolean;
}

export interface TemplateAssignmentPage {
  rows: TemplateAssignmentRow[];
  total: number;
  page: number;
}

export type DocumentExportStatus =
  | 'queued'
  | 'running'
  | 'ready'
  | 'failed'
  | 'expired';

export interface DocumentExport {
  id: string;
  templateId: string;
  season: string | null;
  selectedCount: number | null;
  status: DocumentExportStatus;
  fileCount: number | null;
  skippedCount: number | null;
  sizeBytes: number | null;
  error: string | null;
  requestedAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
}

export interface DocumentExportRequest {
  season?: string;
  assignmentIds?: string[];
}

export interface DocumentExportUrl {
  url: string;
  expiresAt: string;
  sizeBytes: number;
}
