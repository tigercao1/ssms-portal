import { api, ApiError } from '@/lib/api';
import type {
  AssignRequest,
  AssignResult,
  Assignment,
  CertUpload,
  CertUploadReview,
  CertUploadUrl,
  CertUploadUrlRequest,
  CompleteRequest,
  CompleteResult,
  ConfirmedTemplate,
  Field,
  FileUrl,
  InstructorDocuments,
  MyChecklist,
  MyDocument,
  SignedUrl,
  Template,
  TemplateCreate,
  TemplatePatch,
  TemplateSummary,
  UploadUrl,
} from './types';

/** React Query keys shared by every documents screen. */
export const documentsKeys = {
  templates: ['admin', 'documents', 'templates'] as const,
  template: (id: string) => ['admin', 'documents', 'templates', id] as const,
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
