import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import type { DocumentLanguage } from '../api';

export const FORM_LANGUAGES: readonly DocumentLanguage[] = ['en', 'zh'];
export const FORM_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FORM_SLUG_MAX = 60;
export const FORM_TITLE_MAX = 200;

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
  updatedAt: string;
}

export interface FormCreate {
  slug: string;
  titleEn: string;
  titleZh?: string | null;
}

export const formsKeys = {
  all: ['admin', 'documents', 'forms'] as const,
  list: ['admin', 'documents', 'forms', 'list'] as const,
  form: (id: string) => ['admin', 'documents', 'forms', 'form', id] as const,
};

const enc = encodeURIComponent;
const formPath = (id: string) => `/admin/documents/forms/${enc(id)}`;

export function publicFormUrl(slug: string): string {
  return `${env.signSiteUrl.replace(/\/+$/, '')}/w/${slug}`;
}

export function editableVersion(
  form: FormTemplate,
  lang: DocumentLanguage,
): FormVersion | null {
  const { draft, published } = form.languages[lang];
  return draft ?? published;
}

export function lastChange(form: FormTemplate): string {
  return FORM_LANGUAGES.flatMap((lang) => {
    const { draft, published } = form.languages[lang];
    return [draft?.updatedAt, published?.updatedAt];
  }).reduce<string>(
    (latest, at) => (at && at > latest ? at : latest),
    form.updatedAt,
  );
}

export function useForms() {
  return useQuery({
    queryKey: formsKeys.list,
    queryFn: () => api<FormTemplateSummary[]>('/admin/documents/forms'),
  });
}

export function useFormDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: formsKeys.form(id),
      queryFn: () => api<FormTemplate>(formPath(id)),
      staleTime: 60_000,
    })),
  });
}

export function useFormSync() {
  const qc = useQueryClient();
  return (form: FormTemplate) => {
    qc.setQueryData(formsKeys.form(form.id), form);
    return qc.invalidateQueries({ queryKey: formsKeys.list, exact: true });
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
