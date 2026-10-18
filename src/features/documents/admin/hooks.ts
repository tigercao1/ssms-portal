import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { adminGoLiveKey } from '@/features/admin/api';
import {
  archiveAssignment,
  changeTemplateAudience,
  confirmTemplateSource,
  confirmTranslationSource,
  createAssignments,
  createDocumentExport,
  createTemplate,
  deleteTemplate,
  deleteTranslation,
  documentsKeys,
  getDocumentExport,
  getInstructorDocuments,
  getPublishPreview,
  getTemplate,
  listDocumentExports,
  listTemplateAssignments,
  listTemplates,
  publishTemplate,
  putToPresignedUrl,
  remindAssignment,
  requestTemplateSourceUpload,
  requestTranslationSourceUpload,
  retireTemplate,
  reviewCertUpload,
  saveTemplateFields,
  saveTranslationFields,
  updateTemplate,
  type AssignRequest,
  type ChangeAudienceRequest,
  type CertUploadReview,
  type DocumentExport,
  type DocumentExportRequest,
  type DocumentLanguage,
  type Field,
  type PublishRequest,
  type Template,
  type TemplateAssignmentQuery,
  type TemplateCreate,
  type TemplatePatch,
  type TemplateSummary,
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
export function usePublishPreview(
  id: string,
  season: string | null,
  options: { fresh?: boolean } = {},
) {
  return useQuery({
    queryKey: documentsKeys.publishPreview(id, season),
    queryFn: () => getPublishPreview(id, season ?? undefined),
    placeholderData: options.fresh ? undefined : (prev) => prev,
    ...(options.fresh
      ? { staleTime: 0, refetchOnMount: 'always' as const }
      : {}),
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
      void qc.invalidateQueries({
        queryKey: [
          ...documentsKeys.template(result.template.id),
          'publish-preview',
        ],
      });
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

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: (_, id) => {
      qc.setQueryData<TemplateSummary[]>(documentsKeys.templates, (rows) =>
        rows?.filter((row) => row.id !== id),
      );
      qc.removeQueries({ queryKey: documentsKeys.template(id) });
      void qc.invalidateQueries({ queryKey: ['admin', 'instructor'] });
      return qc.invalidateQueries({
        queryKey: documentsKeys.templates,
        exact: true,
      });
    },
  });
}

/** Presigned PUT of a PDF followed by the server-side confirm step. */
export function useUploadTemplateSource() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: async ({
      id,
      file,
      language,
    }: {
      id: string;
      file: File;
      language?: DocumentLanguage;
    }) => {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
        throw new ApiError(415, 'not-pdf');
      if (file.size > MAX_TEMPLATE_BYTES) throw new ApiError(413, 'too-large');
      const { uploadUrl } = language
        ? await requestTranslationSourceUpload(id, language, file.size)
        : await requestTemplateSourceUpload(id, file.size);
      await putToPresignedUrl(uploadUrl, file, 'application/pdf');
      return language
        ? confirmTranslationSource(id, language)
        : confirmTemplateSource(id);
    },
    onSuccess: sync,
  });
}

export function useSaveFields() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: ({
      id,
      fields,
      language,
    }: {
      id: string;
      fields: Field[];
      language?: DocumentLanguage;
    }) =>
      language
        ? saveTranslationFields(id, language, fields)
        : saveTemplateFields(id, fields),
    onSuccess: sync,
  });
}

export function useDeleteTranslation() {
  const sync = useTemplateSync();
  return useMutation({
    mutationFn: ({
      id,
      language,
    }: {
      id: string;
      language: DocumentLanguage;
    }) => deleteTranslation(id, language),
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
    Promise.all([
      qc.invalidateQueries({
        queryKey: documentsKeys.instructorDocuments(instructorId),
      }),
      qc.invalidateQueries({ queryKey: adminGoLiveKey(instructorId) }),
    ]);
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

export const SIGNED_COPIES_PAGE_SIZE = 50;
export const EXPORT_POLL_MS = 2_000;

export function isExportActive(e: Pick<DocumentExport, 'status'>): boolean {
  return e.status === 'queued' || e.status === 'running';
}

export function useTemplateAssignments(
  id: string,
  query: TemplateAssignmentQuery,
) {
  return useQuery({
    queryKey: documentsKeys.templateAssignments(id, query),
    queryFn: () => listTemplateAssignments(id, query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Count of completed assignments with a signed copy for a season, read from
 * `X-Total-Count`.
 */
export function useSignedCopyCount(id: string, season: string | undefined) {
  const query: TemplateAssignmentQuery = {
    season,
    status: 'completed',
    hasSignedCopy: true,
    page: 1,
    limit: 1,
  };
  return useQuery({
    queryKey: documentsKeys.templateAssignments(id, query),
    queryFn: () => listTemplateAssignments(id, query),
    select: (page) => page.total,
  });
}

export function useDocumentExports(templateId: string) {
  return useQuery({
    queryKey: documentsKeys.templateExports(templateId),
    queryFn: () => listDocumentExports(templateId),
  });
}

function mergeExport(list: DocumentExport[] | undefined, e: DocumentExport) {
  const rest = (list ?? []).filter((x) => x.id !== e.id);
  return [e, ...rest]
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .slice(0, 10);
}

/**
 * Polls one export every {@link EXPORT_POLL_MS} while it is queued or running
 * and writes each result into the template's export list.
 */
export function useDocumentExportPolling(exp: DocumentExport) {
  const qc = useQueryClient();
  const active = isExportActive(exp);
  return useQuery({
    queryKey: documentsKeys.documentExport(exp.id),
    queryFn: async () => {
      const e = await getDocumentExport(exp.id);
      qc.setQueryData<DocumentExport[]>(
        documentsKeys.templateExports(e.templateId),
        (list) => mergeExport(list, e),
      );
      return e;
    },
    enabled: active,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const data = query.state.data;
      return !data || isExportActive(data) ? EXPORT_POLL_MS : false;
    },
  });
}

export function useCreateDocumentExport(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DocumentExportRequest) =>
      createDocumentExport(templateId, body),
    onSuccess: (e) => {
      qc.setQueryData<DocumentExport[]>(
        documentsKeys.templateExports(templateId),
        (list) => mergeExport(list, e),
      );
    },
  });
}
