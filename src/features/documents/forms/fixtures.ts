import { http, HttpResponse, type HttpHandler } from 'msw';
import type { DocumentLanguage } from '../api';
import {
  FORM_LANGUAGES,
  type FormField,
  type FormTemplate,
  type FormTemplateSummary,
  type FormVersion,
} from './api';

const field = (
  key: string,
  type: FormField['type'],
  required: boolean,
  label: string,
): FormField => ({ key, type, required, label });

export const defaultFormFields: Record<DocumentLanguage, FormField[]> = {
  en: [
    field('participant_name', 'text', true, 'Participant name'),
    field('email', 'email', true, 'Email'),
    field('date', 'date', true, 'Date'),
    field('id_number', 'text', false, 'ID number'),
    field('initials', 'text', false, 'Initials'),
    field('participant_signature', 'signature', true, 'Participant signature'),
    field('guardian_name', 'text', false, 'Guardian name'),
    field('guardian_signature', 'signature', false, 'Guardian signature'),
    field('witness_name', 'text', false, 'Witness name'),
    field('witness_signature', 'signature', false, 'Witness signature'),
  ],
  zh: [
    field('participant_name', 'text', true, '参与者姓名'),
    field('email', 'email', true, '电子邮箱'),
    field('date', 'date', true, '日期'),
    field('id_number', 'text', false, '证件号码'),
    field('initials', 'text', false, '姓名缩写'),
    field('participant_signature', 'signature', true, '参与者签名'),
    field('guardian_name', 'text', false, '监护人姓名'),
    field('guardian_signature', 'signature', false, '监护人签名'),
    field('witness_name', 'text', false, '见证人姓名'),
    field('witness_signature', 'signature', false, '见证人签名'),
  ],
};

export function fakeFormVersion(
  overrides: Partial<FormVersion> = {},
): FormVersion {
  return {
    version: 1,
    title: 'Liability waiver',
    bodyMarkdown:
      '# Liability waiver\n\nSkiing has risks.\n\n- I follow the instructor\n- I wear a helmet\n\n**Read carefully.**',
    bodySha256: 'a1'.repeat(32),
    fields: defaultFormFields.en.slice(0, 6),
    originalPdf: null,
    placements: [],
    publishedAt: '2026-11-01T15:00:00Z',
    updatedAt: '2026-11-01T15:00:00Z',
    ...overrides,
  };
}

export function fakeForm(overrides: Partial<FormTemplate> = {}): FormTemplate {
  return {
    id: 'form-waiver',
    slug: 'waiver',
    titleEn: 'Liability waiver',
    titleZh: '免责声明',
    emailCopy: true,
    languages: {
      en: { published: fakeFormVersion(), draft: null },
      zh: {
        published: null,
        draft: fakeFormVersion({
          title: '免责声明',
          bodyMarkdown: '# 免责声明\n\n滑雪有风险。',
          fields: defaultFormFields.zh.slice(0, 6),
          publishedAt: null,
          updatedAt: '2026-11-07T18:30:00Z',
        }),
      },
    },
    defaultFields: defaultFormFields,
    insertedAt: '2026-10-30T12:00:00Z',
    updatedAt: '2026-11-01T15:00:00Z',
    ...overrides,
  };
}

export const sampleForms: FormTemplate[] = [
  fakeForm(),
  fakeForm({
    id: 'form-rental',
    slug: 'rental-agreement',
    titleEn: 'Equipment rental agreement',
    titleZh: null,
    emailCopy: false,
    languages: {
      en: { published: null, draft: null },
      zh: { published: null, draft: null },
    },
    updatedAt: '2026-11-05T09:00:00Z',
  }),
];

export interface FormsMockState {
  forms: FormTemplate[];
  requests: { method: string; path: string; body?: unknown }[];
}

export function createFormsState(
  overrides: Partial<FormsMockState> = {},
): FormsMockState {
  return {
    forms: structuredClone(sampleForms),
    requests: [],
    ...overrides,
  };
}

export function toSummary(form: FormTemplate): FormTemplateSummary {
  const by = <T>(fn: (lang: DocumentLanguage) => T) =>
    Object.fromEntries(FORM_LANGUAGES.map((l) => [l, fn(l)])) as Record<
      DocumentLanguage,
      T
    >;
  return {
    id: form.id,
    slug: form.slug,
    titleEn: form.titleEn,
    titleZh: form.titleZh,
    emailCopy: form.emailCopy,
    publishedVersions: by((l) => form.languages[l].published?.version ?? null),
    hasDraft: by((l) => form.languages[l].draft !== null),
    updatedAt: form.updatedAt,
  };
}

const bad = (message: string, status = 400) =>
  HttpResponse.json(
    { statusCode: status, message, error: 'Bad Request' },
    { status },
  );

export function formsHandlers(
  state: FormsMockState = createFormsState(),
  apiBase = 'http://localhost:3000',
): HttpHandler[] {
  const base = `${apiBase}/admin/documents/forms`;
  const find = (id: unknown) => state.forms.find((f) => f.id === id);
  const log = async (request: Request) => {
    const body = request.headers.get('content-type')?.includes('json')
      ? await request.clone().json()
      : undefined;
    state.requests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      ...(body !== undefined && { body }),
    });
  };
  const notFound = () => bad('Form not found', 404);

  return [
    http.get(base, () => HttpResponse.json(state.forms.map(toSummary))),
    http.post(base, async ({ request }) => {
      await log(request);
      const body = (await request.json()) as {
        slug: string;
        titleEn: string;
        titleZh?: string | null;
      };
      if (state.forms.some((f) => f.slug === body.slug))
        return bad('Another document already uses this link name', 409);
      const form = fakeForm({
        id: `form-${body.slug}`,
        slug: body.slug,
        titleEn: body.titleEn,
        titleZh: body.titleZh ?? null,
        emailCopy: true,
        languages: {
          en: { published: null, draft: null },
          zh: { published: null, draft: null },
        },
        updatedAt: new Date().toISOString(),
      });
      state.forms.push(form);
      return HttpResponse.json(form, { status: 201 });
    }),
    http.get(`${base}/:id`, ({ params }) => {
      const form = find(params.id);
      return form ? HttpResponse.json(form) : notFound();
    }),
  ];
}
