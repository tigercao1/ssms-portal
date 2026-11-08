import { useCallback } from 'react';
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { env } from '@/lib/env';
import {
  putToPresignedUrl,
  type DocumentLanguage,
  type UploadUrl,
} from '../api';

export const FORM_LANGUAGES: readonly DocumentLanguage[] = ['en', 'zh'];
export const FORM_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FORM_SLUG_MAX = 60;
export const FORM_TITLE_MAX = 200;
export const FORM_BODY_MAX = 50_000;
export const MAX_FORM_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_FORM_PDF_PAGES = 30;
export const SIGNER_NAME_KEY = 'participant_name';
export const SIGNER_EMAIL_KEY = 'email';

export type FormFieldType = 'text' | 'email' | 'date' | 'signature';

export interface FormField {
  key: string;
  type: FormFieldType;
  label: string;
  required: boolean;
}

export interface FormPlacement {
  key: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormPdfPage {
  width: number;
  height: number;
  rotate: 0 | 90 | 180 | 270;
  x: number;
  y: number;
}

export interface FormOriginalPdf {
  sha256: string;
  sizeBytes: number;
  pageCount: number;
  pages: FormPdfPage[];
  url: string;
  urlExpiresAt: string;
}

export interface FormVersion {
  version: number;
  title: string;
  bodyMarkdown: string;
  bodySha256: string;
  fields: FormField[];
  originalPdf: FormOriginalPdf | null;
  placements: FormPlacement[];
  publishedAt: string | null;
  updatedAt: string;
}

export interface FormLanguageVersions {
  published: FormVersion | null;
  draft: FormVersion | null;
}

export interface FormTemplate {
  id: string;
  slug: string;
  titleEn: string;
  titleZh: string | null;
  emailCopy: boolean;
  languages: Record<DocumentLanguage, FormLanguageVersions>;
  defaultFields: Record<DocumentLanguage, FormField[]>;
  insertedAt: string;
  updatedAt: string;
}

export interface FormTemplateSummary {
  id: string;
  slug: string;
  titleEn: string;
  titleZh: string | null;
  emailCopy: boolean;
  publishedVersions: Record<DocumentLanguage, number | null>;
  hasDraft: Record<DocumentLanguage, boolean>;
  hasOriginalPdf: Record<DocumentLanguage, boolean>;
  lastChangedAt: string;
  updatedAt: string;
}

export interface FormCreate {
  slug: string;
  titleEn: string;
  titleZh?: string | null;
}

export interface FormPatch {
  titleEn?: string;
  titleZh?: string | null;
  emailCopy?: boolean;
  expectedUpdatedAt: string;
}

export interface FormDraft {
  title: string;
  bodyMarkdown: string;
  fields: FormField[];
}

export interface FormRevision {
  expectedUpdatedAt: string | null;
}

export interface DraftRevision {
  updatedAt: string | null;
  text: FormDraft;
}

export type ConfirmedFormPdf = FormTemplate & { placementsCleared: boolean };

export const formsKeys = {
  all: ['admin', 'documents', 'forms'] as const,
  list: ['admin', 'documents', 'forms', 'list'] as const,
  form: (id: string) => ['admin', 'documents', 'forms', 'form', id] as const,
  revision: (id: string, lang: DocumentLanguage) =>
    ['admin', 'documents', 'forms', 'revision', id, lang] as const,
  writes: (id: string, lang: DocumentLanguage) =>
    ['admin', 'documents', 'forms', 'writes', id, lang] as const,
};

const enc = encodeURIComponent;
const formPath = (id: string) => `/admin/documents/forms/${enc(id)}`;
const versionPath = (id: string, lang: DocumentLanguage) =>
  `${formPath(id)}/versions/${lang}`;

export function publicFormUrl(slug: string): string {
  return `${env.signSiteUrl.replace(/\/+$/, '')}/w/${slug}`;
}

export function revisionOf(
  form: FormTemplate,
  lang: DocumentLanguage,
): string | null {
  return form.languages[lang].draft?.updatedAt ?? null;
}

export function baselineOf(
  form: FormTemplate,
  lang: DocumentLanguage,
): FormDraft {
  const version = editableVersion(form, lang);
  return {
    title:
      version?.title ??
      (lang === 'zh' ? (form.titleZh ?? form.titleEn) : form.titleEn),
    bodyMarkdown: version?.bodyMarkdown ?? '',
    fields: version?.fields ?? form.defaultFields[lang],
  };
}

export function sameDraft(a: FormDraft, b: FormDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function draftRevisionOf(
  form: FormTemplate,
  lang: DocumentLanguage,
): DraftRevision {
  return { updatedAt: revisionOf(form, lang), text: baselineOf(form, lang) };
}

export function isConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

export function editableVersion(
  form: FormTemplate,
  lang: DocumentLanguage,
): FormVersion | null {
  const { draft, published } = form.languages[lang];
  return draft ?? published;
}

export function unplacedRequired(version: FormVersion): FormField[] {
  if (!version.originalPdf) return [];
  const placed = new Set(version.placements.map((p) => p.key));
  return version.fields.filter((f) => f.required && !placed.has(f.key));
}

export function useForms() {
  return useQuery({
    queryKey: formsKeys.list,
    queryFn: () => api<FormTemplateSummary[]>('/admin/documents/forms'),
  });
}

export function useForm(id: string) {
  return useQuery({
    queryKey: formsKeys.form(id),
    queryFn: () => api<FormTemplate>(formPath(id)),
    staleTime: 60_000,
  });
}

export function useFormWriting(id: string, lang: DocumentLanguage): boolean {
  return useIsMutating({ mutationKey: formsKeys.writes(id, lang) }) > 0;
}

export function useDraftRevision(form: FormTemplate, lang: DocumentLanguage) {
  const qc = useQueryClient();
  const key = formsKeys.revision(form.id, lang);
  const { data } = useQuery({
    queryKey: key,
    queryFn: () =>
      qc.getQueryData<DraftRevision>(key) ?? draftRevisionOf(form, lang),
    initialData: () => draftRevisionOf(form, lang),
    staleTime: Infinity,
  });
  const setRevision = useCallback(
    (fresh: FormTemplate) => qc.setQueryData(key, draftRevisionOf(fresh, lang)),
    [qc, key, lang],
  );
  return [data, setRevision] as const;
}

function useDraftSync(
  id: string,
  lang: DocumentLanguage,
  onlyWithSameText = false,
) {
  const qc = useQueryClient();
  const sync = useFormSync();
  return (form: FormTemplate) => {
    const key = formsKeys.revision(id, lang);
    const known = qc.getQueryData<DraftRevision>(key);
    const next = draftRevisionOf(form, lang);
    if (!onlyWithSameText || (known && sameDraft(known.text, next.text)))
      qc.setQueryData(key, next);
    return sync(form);
  };
}

export function useReloadForm(id: string) {
  const qc = useQueryClient();
  return async () => {
    const form = await qc.fetchQuery({
      queryKey: formsKeys.form(id),
      queryFn: () => api<FormTemplate>(formPath(id)),
      staleTime: 0,
    });
    void qc.invalidateQueries({ queryKey: formsKeys.list, exact: true });
    return form;
  };
}

export function useFormSync() {
  const qc = useQueryClient();
  return (form: FormTemplate) => {
    qc.setQueryData(formsKeys.form(form.id), form);
    return qc.invalidateQueries({ queryKey: formsKeys.list, exact: true });
  };
}

function useRefreshOnConflict(id: string) {
  const qc = useQueryClient();
  return (err: unknown) => {
    if (err instanceof ApiError && err.status === 409)
      void qc.invalidateQueries({ queryKey: formsKeys.form(id) });
  };
}

export function useCreateForm() {
  const sync = useFormSync();
  return useMutation({
    mutationFn: (body: FormCreate) =>
      api<FormTemplate>('/admin/documents/forms', { method: 'POST', body }),
    onSuccess: sync,
  });
}

export function useUpdateForm(id: string) {
  const sync = useFormSync();
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationFn: (body: FormPatch) =>
      api<FormTemplate>(formPath(id), { method: 'PATCH', body }),
    onSuccess: sync,
    onError: refresh,
  });
}

export function useSaveFormDraft(id: string, lang: DocumentLanguage) {
  const sync = useDraftSync(id, lang);
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationKey: formsKeys.writes(id, lang),
    mutationFn: (body: FormDraft & FormRevision) =>
      api<FormTemplate>(versionPath(id, lang), { method: 'PUT', body }),
    onSuccess: sync,
    onError: refresh,
  });
}

export function usePublishForm(id: string, lang: DocumentLanguage) {
  const sync = useDraftSync(id, lang);
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationKey: formsKeys.writes(id, lang),
    mutationFn: (expectedUpdatedAt: string) =>
      api<FormTemplate>(`${versionPath(id, lang)}/publish`, {
        method: 'POST',
        body: { expectedUpdatedAt },
      }),
    onSuccess: sync,
    onError: refresh,
  });
}

export function useUploadFormPdf(id: string, lang: DocumentLanguage) {
  const sync = useDraftSync(id, lang, true);
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationKey: formsKeys.writes(id, lang),
    mutationFn: async (file: File) => {
      if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
        throw new ApiError(415, 'not-pdf');
      if (file.size > MAX_FORM_PDF_BYTES) throw new ApiError(413, 'too-large');
      const sourcePath = `${versionPath(id, lang)}/source`;
      const { uploadUrl } = await api<UploadUrl>(`${sourcePath}/upload-url`, {
        method: 'POST',
        body: { contentLength: file.size },
      });
      await putToPresignedUrl(uploadUrl, file, 'application/pdf');
      return api<ConfirmedFormPdf>(`${sourcePath}/confirm`, {
        method: 'POST',
      });
    },
    onSuccess: sync,
    onError: refresh,
  });
}

export function useRemoveFormPdf(id: string, lang: DocumentLanguage) {
  const sync = useDraftSync(id, lang, true);
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationKey: formsKeys.writes(id, lang),
    mutationFn: () =>
      api<FormTemplate>(`${versionPath(id, lang)}/source`, {
        method: 'DELETE',
      }),
    onSuccess: sync,
    onError: refresh,
  });
}

export function useSaveFormPlacements(id: string, lang: DocumentLanguage) {
  const sync = useDraftSync(id, lang, true);
  const refresh = useRefreshOnConflict(id);
  return useMutation({
    mutationKey: formsKeys.writes(id, lang),
    mutationFn: (body: {
      placements: FormPlacement[];
      expectedUpdatedAt: string;
    }) =>
      api<FormTemplate>(`${versionPath(id, lang)}/placements`, {
        method: 'PUT',
        body,
      }),
    onSuccess: sync,
    onError: refresh,
  });
}
