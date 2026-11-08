import { http, HttpResponse, type HttpHandler } from 'msw';
import type { DocumentLanguage } from '../api';
import {
  FORM_LANGUAGES,
  SIGNER_EMAIL_KEY,
  SIGNER_NAME_KEY,
  type FormDraft,
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
    hasOriginalPdf: by((l) => !!form.languages[l].published?.originalPdf),
    lastChangedAt: FORM_LANGUAGES.flatMap((l) => [
      form.languages[l].draft?.updatedAt,
      form.languages[l].published?.updatedAt,
    ]).reduce<string>(
      (latest, at) => (at && at > latest ? at : latest),
      form.updatedAt,
    ),
    updatedAt: form.updatedAt,
  };
}

export function fieldsInvalid(fields: FormField[]): string | null {
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) return `${f.key} appears twice`;
    keys.add(f.key);
  }
  const has = (key: string, type: FormField['type']) =>
    fields.some((f) => f.key === key && f.type === type && f.required);
  if (!has(SIGNER_NAME_KEY, 'text') || !has(SIGNER_EMAIL_KEY, 'email'))
    return 'it needs a required participant_name text field and a required email field';
  if (!fields.some((f) => f.type === 'signature' && f.required))
    return 'it needs a required signature field';
  return null;
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
  const changed = () =>
    bad('This form was changed by someone else; reload it and try again', 409);
  const stale = (draft: FormVersion | null, body: unknown) => {
    const expected = (body as { expectedUpdatedAt?: string } | undefined)
      ?.expectedUpdatedAt;
    return expected !== undefined && draft?.updatedAt !== expected;
  };
  const stamp = (draft: FormVersion | null) =>
    new Date(
      Math.max(Date.now(), Date.parse(draft?.updatedAt ?? '') + 1 || 0),
    ).toISOString();
  const lang = (value: unknown) =>
    FORM_LANGUAGES.includes(value as DocumentLanguage)
      ? (value as DocumentLanguage)
      : null;

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
    http.patch(`${base}/:id`, async ({ params, request }) => {
      await log(request);
      const form = find(params.id);
      if (!form) return notFound();
      Object.assign(form, await request.json(), {
        updatedAt: new Date().toISOString(),
      });
      return HttpResponse.json(form);
    }),
    http.put(`${base}/:id/versions/:lang`, async ({ params, request }) => {
      await log(request);
      const form = find(params.id);
      const l = lang(params.lang);
      if (!form || !l) return notFound();
      const body = (await request.json()) as FormDraft;
      const slot = form.languages[l];
      if (stale(slot.draft, body)) return changed();
      const fields =
        body.fields ??
        slot.draft?.fields ??
        slot.published?.fields ??
        defaultFormFields[l];
      const problem = fieldsInvalid(fields);
      if (problem) return bad(`The field list is not valid: ${problem}`);
      const source = slot.draft ?? slot.published;
      const keys = new Set(fields.map((f) => f.key));
      slot.draft = {
        ...(source ?? fakeFormVersion()),
        version: slot.draft?.version ?? (slot.published?.version ?? 0) + 1,
        title: body.title,
        bodyMarkdown: body.bodyMarkdown,
        fields,
        originalPdf: source?.originalPdf ?? null,
        placements: (source?.placements ?? []).filter((p) => keys.has(p.key)),
        publishedAt: null,
        updatedAt: stamp(slot.draft),
      };
      return HttpResponse.json(form);
    }),
    http.post(
      `${base}/:id/versions/:lang/publish`,
      async ({ params, request }) => {
        await log(request);
        const form = find(params.id);
        const l = lang(params.lang);
        if (!form || !l) return notFound();
        const slot = form.languages[l];
        if (!slot.draft)
          return bad('There is no draft to publish in this language');
        const body: unknown = request.headers
          .get('content-type')
          ?.includes('json')
          ? await request.json()
          : undefined;
        if (stale(slot.draft, body)) return changed();
        slot.published = {
          ...slot.draft,
          publishedAt: new Date().toISOString(),
        };
        slot.draft = null;
        return HttpResponse.json(form);
      },
    ),
  ];
}
