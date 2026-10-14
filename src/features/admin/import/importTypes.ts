export type ImportProblem =
  | 'instructor_not_found'
  | 'instructor_ambiguous'
  | 'lesson_type_unmapped'
  | 'invalid_row'
  | 'duplicate_row'
  | 'customer_not_found'
  | 'already_imported';

export type RowFilter = ImportProblem | 'any' | 'blocking';
export type ImportStatus = 'draft' | 'committed' | 'discarded';
export type ImportRowStatus = 'scheduled' | 'completed' | 'cancelled';
export type ManualField = 'instructor' | 'lesson_type' | 'customer';

export interface ImportSummary {
  total: number;
  matched: number;
  willImport: number;
  needsInstructor: number;
  needsLessonType: number;
  customerNotFound: number;
  cancelled: number;
  invalid: number;
  duplicate: number;
  alreadyImported: number;
  imported: number;
}

export interface CommitCounts {
  total: number;
  ready: number;
  created: number;
  alreadyImported: number;
  participants: number;
  skipped: number;
}

export interface ClassImport {
  id: string;
  filename: string;
  status: ImportStatus;
  counts: Partial<ImportSummary> & { commit?: CommitCounts };
  uploadedBy: string | null;
  committedAt: string | null;
  createdAt: string;
}

export interface ClassImportRow {
  rowNo: number;
  externalId: string;
  eventName: string | null;
  instructorName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  startsAt: string | null;
  endsAt: string | null;
  statusToSet: ImportRowStatus | null;
  instructorId: string | null;
  matchedInstructorName: string | null;
  lessonTypeId: string | null;
  customerId: string | null;
  matchedCustomerName: string | null;
  problems: ImportProblem[];
  manualFields: ManualField[];
  classId: string | null;
}

export interface EventNameSummary {
  eventName: string;
  rows: number;
  lessonTypeId: string | null;
}

export interface ClassImportDetail {
  import: ClassImport;
  summary: ImportSummary;
  eventNames: EventNameSummary[];
  rows: ClassImportRow[];
}

export interface ImportRowPatch {
  instructorId?: string;
  lessonTypeId?: string;
  customerId?: string | null;
}

export interface EventMapEntry {
  eventName: string;
  lessonTypeId: string | null;
}

export interface EventMapResult {
  mappings: { eventName: string; lessonTypeId: string }[];
  rematchedImports: number;
}

export interface CommitResult {
  import: ClassImport;
  counts: CommitCounts;
}
