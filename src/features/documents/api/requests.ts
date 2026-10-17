import { api, apiWithHeaders, ApiError } from '@/lib/api';
import type {
  AssignRequest,
  AssignResult,
  Assignment,
  CertUpload,
  CertUploadReview,
  CertUploadUrl,
  CertUploadUrlRequest,
  ChangeAudienceRequest,
  CompleteRequest,
  CompleteResult,
  ConfirmedTemplate,
  DocumentExport,
  DocumentExportRequest,
  DocumentExportUrl,
  Field,
  FileUrl,
  InstructorDocuments,
  MyChecklist,
  MyDocument,
  PublishPreview,
  PublishRequest,
  PublishResult,
  SignedUrl,
  Template,
  TemplateAssignmentPage,
  TemplateAssignmentQuery,
  TemplateAssignmentRow,
  TemplateCreate,
  TemplatePatch,
  TemplateSummary,
  UploadUrl,
} from './types';

/** React Query keys shared by every documents screen. */
export const documentsKeys = {
  templates: ['admin', 'documents', 'templates'] as const,
  template: (id: string) => ['admin', 'documents', 'templates', id] as const,
  publishPreview: (id: string, season: string | null) =>
    ['admin', 'documents', 'templates', id, 'publish-preview', season] as const,
  templateAssignments: (id: string, query?: TemplateAssignmentQuery) =>
    query
      ? (['admin', 'documents', 'templates', id, 'assignments', query] as const)
      : (['admin', 'documents', 'templates', id, 'assignments'] as const),
  templateExports: (id: string) =>
    ['admin', 'documents', 'templates', id, 'exports'] as const,
  documentExport: (exportId: string) =>
    ['admin', 'documents', 'exports', exportId] as const,
  instructorDocuments: (instructorId: string) =>
    ['admin', 'instructor', instructorId, 'documents'] as const,
  myChecklist: ['me', 'documents'] as const,
  myDocument: (assignmentId: string) =>
    ['me', 'documents', assignmentId] as const,
};

const enc = encodeURIComponent;

export function listTemplates() {
  return api<TemplateSummary[]>('/admin/documents/templates');
}

export function getTemplate(id: string) {
  return api<Template>(`/admin/documents/templates/${enc(id)}`);
}

export function createTemplate(body: TemplateCreate) {
  return api<Template>('/admin/documents/templates', { method: 'POST', body });
}

export function updateTemplate(id: string, body: TemplatePatch) {
  return api<Template>(`/admin/documents/templates/${enc(id)}`, {
    method: 'PATCH',
    body,
  });
}

export function getPublishPreview(id: string, season?: string) {
  const query = season ? `?season=${enc(season)}` : '';
  return api<PublishPreview>(
    `/admin/documents/templates/${enc(id)}/publish-preview${query}`,
  );
}

export function publishTemplate(id: string, body: PublishRequest) {
  return api<PublishResult>(`/admin/documents/templates/${enc(id)}/publish`, {
    method: 'POST',
    body,
  });
}

export function changeTemplateAudience(
  id: string,
  body: ChangeAudienceRequest,
) {
  return api<PublishResult>(`/admin/documents/templates/${enc(id)}/audience`, {
    method: 'POST',
    body,
  });
}

export function retireTemplate(id: string) {
  return api<Template>(`/admin/documents/templates/${enc(id)}/retire`, {
    method: 'POST',
  });
}

export function requestTemplateSourceUpload(id: string, contentLength: number) {
  return api<UploadUrl>(
    `/admin/documents/templates/${enc(id)}/source/upload-url`,
    { method: 'POST', body: { contentLength } },
  );
}

export function confirmTemplateSource(id: string) {
  return api<ConfirmedTemplate>(
    `/admin/documents/templates/${enc(id)}/source/confirm`,
    {
      method: 'POST',
    },
  );
}

export function saveTemplateFields(id: string, fields: Field[]) {
  return api<Template>(`/admin/documents/templates/${enc(id)}/fields`, {
    method: 'PUT',
    body: { fields },
  });
}

export function createAssignments(body: AssignRequest) {
  return api<AssignResult>('/admin/documents/assignments', {
    method: 'POST',
    body,
  });
}

export function getInstructorDocuments(instructorId: string) {
  return api<InstructorDocuments>(
    `/admin/instructors/${enc(instructorId)}/documents`,
  );
}

export function getAssignmentSignedUrl(assignmentId: string) {
  return api<SignedUrl>(
    `/admin/documents/assignments/${enc(assignmentId)}/signed-url`,
  );
}

export async function listTemplateAssignments(
  id: string,
  query: TemplateAssignmentQuery,
): Promise<TemplateAssignmentPage> {
  const qs = new URLSearchParams({
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.season) qs.set('season', query.season);
  if (query.status && query.status !== 'all') qs.set('status', query.status);
  if (query.q) qs.set('q', query.q);
  const { data, headers } = await apiWithHeaders<TemplateAssignmentRow[]>(
    `/admin/documents/templates/${enc(id)}/assignments?${qs.toString()}`,
  );
  const total = Number(headers.get('X-Total-Count') ?? Number.NaN);
  return {
    rows: data,
    page: query.page,
    total: Number.isFinite(total)
      ? total
      : (query.page - 1) * query.limit + data.length,
  };
}

export function createDocumentExport(
  templateId: string,
  body: DocumentExportRequest,
) {
  return api<DocumentExport>(
    `/admin/documents/templates/${enc(templateId)}/exports`,
    { method: 'POST', body },
  );
}

export function listDocumentExports(templateId: string) {
  return api<DocumentExport[]>(
    `/admin/documents/templates/${enc(templateId)}/exports`,
  );
}

export function getDocumentExport(exportId: string) {
  return api<DocumentExport>(`/admin/documents/exports/${enc(exportId)}`);
}

export function getDocumentExportUrl(exportId: string) {
  return api<DocumentExportUrl>(
    `/admin/documents/exports/${enc(exportId)}/url`,
  );
}

export function remindAssignment(assignmentId: string) {
  return api<void>(`/admin/documents/assignments/${enc(assignmentId)}/remind`, {
    method: 'POST',
  });
}

export function archiveAssignment(assignmentId: string) {
  return api<Assignment>(
    `/admin/documents/assignments/${enc(assignmentId)}/archive`,
    { method: 'POST' },
  );
}

export function getCertUploadUrl(uploadId: string) {
  return api<FileUrl>(`/admin/certification-uploads/${enc(uploadId)}/url`);
}

export function reviewCertUpload(uploadId: string, body: CertUploadReview) {
  return api<CertUpload>(`/admin/certification-uploads/${enc(uploadId)}`, {
    method: 'PATCH',
    body,
  });
}

export function getMyChecklist() {
  return api<MyChecklist>('/me/documents');
}

export function getMyDocument(assignmentId: string) {
  return api<MyDocument>(`/me/documents/${enc(assignmentId)}`);
}

export function completeMyDocument(
  assignmentId: string,
  body: CompleteRequest,
) {
  return api<CompleteResult>(`/me/documents/${enc(assignmentId)}/complete`, {
    method: 'POST',
    body,
  });
}

export function getMySignedUrl(assignmentId: string) {
  return api<SignedUrl>(`/me/documents/${enc(assignmentId)}/signed-url`);
}

export function requestMyCertUpload(body: CertUploadUrlRequest) {
  return api<CertUploadUrl>('/me/certification-uploads/upload-url', {
    method: 'POST',
    body,
  });
}

export function confirmMyCertUpload(uploadId: string) {
  return api<CertUpload>(`/me/certification-uploads/${enc(uploadId)}/confirm`, {
    method: 'POST',
  });
}

/**
 * PUTs a file to a presigned storage URL. No bearer token is sent; the URL
 * carries its own signature. Throws {@link ApiError} on a non-2xx response.
 */
export async function putToPresignedUrl(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'Upload failed — the link may have expired.');
  }
  if (!res.ok) throw new ApiError(res.status, `Upload failed (${res.status})`);
}
