import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import {
  archiveAssignment,
  changeTemplateAudience,
  confirmTemplateSource,
  createAssignments,
  createTemplate,
  documentsKeys,
  getInstructorDocuments,
  getPublishPreview,
  getTemplate,
  listTemplates,
  publishTemplate,
  putToPresignedUrl,
  remindAssignment,
  requestTemplateSourceUpload,
  retireTemplate,
  reviewCertUpload,
  saveTemplateFields,
  updateTemplate,
  type AssignRequest,
  type ChangeAudienceRequest,
  type CertUploadReview,
  type Field,
  type PublishRequest,
  type Template,
  type TemplateCreate,
  type TemplatePatch,
} from '../api';

export const MAX_TEMPLATE_BYTES = 20 * 1024 * 1024;

export function useTemplates() {
  return useQuery({
    queryKey: documentsKeys.templates,
    queryFn: listTemplates,
  });
}

export function useTemplate(id: string) {
  return useQuery({
    queryKey: documentsKeys.template(id),
    queryFn: () => getTemplate(id),
    staleTime: 60_000,
  });
}

function useTemplateSync() {
  const qc = useQueryClient();
  return (t: Template) => {
    qc.setQueryData(documentsKeys.template(t.id), t);
    return qc.invalidateQueries({
      queryKey: documentsKeys.templates,
      exact: true,
    });
  };
}

export function useCreateTemplate() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: (body: TemplateCreate) => createTemplate(body),
    onSuccess: sync,
  });
}

export function useUpdateTemplate() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: ({ id, ...body }: TemplatePatch & { id: string }) =>
      updateTemplate(id, body),
    onSuccess: sync,
  });
}

/** Who a publish would reach; `season` null lets the API pick the current one. */
export function usePublishPreview(id: string, season: string | null) {
  return useQuery({
    queryKey: documentsKeys.publishPreview(id, season),
    queryFn: () => getPublishPreview(id, season ?? undefined),
    placeholderData: (prev) => prev,
  });
}

export function usePublishTemplate() {
  const sync = useTemplateSync();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PublishRequest & { id: string }) =>
      publishTemplate(id, body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'instructor'] });
      return sync(result.template);
    },
  });
}

export function useChangeAudience() {
  const sync = useTemplateSync();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ChangeAudienceRequest & { id: string }) =>
      changeTemplateAudience(id, body),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'instructor'] });
      return sync(result.template);
    },
  });
}

export function useRetireTemplate() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: (id: string) => retireTemplate(id),
    onSuccess: sync,
  });
}

/** Presigned PUT of a PDF followed by the server-side confirm step. */
export function useUploadTemplateSource() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
        throw new ApiError(415, 'not-pdf');
      if (file.size > MAX_TEMPLATE_BYTES) throw new ApiError(413, 'too-large');
      const { uploadUrl } = await requestTemplateSourceUpload(id, file.size);
      await putToPresignedUrl(uploadUrl, file, 'application/pdf');
      return confirmTemplateSource(id);
    },
    onSuccess: sync,
  });
}

export function useSaveFields() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Field[] }) =>
      saveTemplateFields(id, fields),
    onSuccess: sync,
  });
}

export function useCreateAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AssignRequest) => createAssignments(body),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['admin', 'instructor'] }),
        qc.invalidateQueries({ queryKey: documentsKeys.templates }),
      ]),
  });
}

export function useInstructorDocuments(instructorId: string) {
  return useQuery({
    queryKey: documentsKeys.instructorDocuments(instructorId),
    queryFn: () => getInstructorDocuments(instructorId),
  });
}

function useInstructorDocumentsInvalidate(instructorId: string) {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      queryKey: documentsKeys.instructorDocuments(instructorId),
    });
}

export function useRemindAssignment(instructorId: string) {
  const invalidate = useInstructorDocumentsInvalidate(instructorId);
  return useMutation({
    mutationFn: (assignmentId: string) => remindAssignment(assignmentId),
    onSuccess: invalidate,
  });
}

export function useArchiveAssignment(instructorId: string) {
  const invalidate = useInstructorDocumentsInvalidate(instructorId);
  return useMutation({
    mutationFn: (assignmentId: string) => archiveAssignment(assignmentId),
    onSuccess: invalidate,
  });
}

export function useReviewCertUpload(instructorId: string) {
  const invalidate = useInstructorDocumentsInvalidate(instructorId);
  return useMutation({
    mutationFn: ({ id, ...body }: CertUploadReview & { id: string }) =>
      reviewCertUpload(id, body),
    onSuccess: invalidate,
  });
}
