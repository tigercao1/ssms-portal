import { http, HttpResponse, type HttpHandler } from 'msw';
import type { DocumentLanguage } from '../api';
import { MOCK_STORAGE_ORIGIN } from '../api/fixtures';
import {
  FORM_LANGUAGES,
  SIGNER_EMAIL_KEY,
  SIGNER_NAME_KEY,
  type FormDraft,
  type FormField,
  type FormOriginalPdf,
  type FormPlacement,
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

export function fakeOriginalPdf(
  overrides: Partial<FormOriginalPdf> = {},
): FormOriginalPdf {
  return {
    sha256: 'e5f6a7b8'.repeat(8),
    sizeBytes: 182_000,
    pageCount: 2,
    pages: [
      { width: 612, height: 792, rotate: 0, x: 0, y: 0 },
      { width: 612, height: 792, rotate: 0, x: 0, y: 0 },
    ],
    url: `${MOCK_STORAGE_ORIGIN}/forms/waiver/original.pdf?sig=mock`,
    urlExpiresAt: '2026-11-08T20:00:00Z',
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
  uploads: Map<string, { bytes: number; pageCount: number }>;
  nextPageCount: number;
  requests: { method: string; path: string; body?: unknown }[];
}

export function createFormsState(
  overrides: Partial<FormsMockState> = {},
): FormsMockState {
  return {
    forms: structuredClone(sampleForms),
    uploads: new Map(),
    nextPageCount: 2,
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

function placementProblem(
  placement: FormPlacement,
  version: FormVersion,
): string | null {
  const pdf = version.originalPdf!;
  const page = pdf.pages[placement.page - 1];
  if (!version.fields.some((f) => f.key === placement.key))
    return `${placement.key} is not a field of this version`;
  if (!page)
    return `${placement.key} is on page ${placement.page}, but the PDF has ${pdf.pages.length} page(s)`;
  const inside =
    placement.x >= page.x &&
    placement.y >= page.y &&
    placement.x + placement.w <= page.x + page.width &&
    placement.y + placement.h <= page.y + page.height;
  return inside ? null : `${placement.key} is outside page ${placement.page}`;
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
  const stale = (
    current: { updatedAt: string } | null,
    body: unknown,
    nullMeansNoDraft = false,
  ) => {
    const expected = (body as { expectedUpdatedAt?: string | null } | undefined)
      ?.expectedUpdatedAt;
    if (expected === undefined) return false;
    if (expected === null && !nullMeansNoDraft)
      throw new Error('expectedUpdatedAt: null is only valid on a draft save');
    return expected === null
      ? current !== null
      : current?.updatedAt !== expected;
  };
  const stamp = (current: { updatedAt: string } | null) =>
    new Date(
      Math.max(Date.now(), Date.parse(current?.updatedAt ?? '') + 1 || 0),
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
      const { expectedUpdatedAt, ...patch } = (await request.json()) as {
        expectedUpdatedAt?: string | null;
      };
      if (stale(form, { expectedUpdatedAt })) return changed();
      Object.assign(form, patch, { updatedAt: stamp(form) });
      return HttpResponse.json(form);
    }),
    http.put(`${base}/:id/versions/:lang`, async ({ params, request }) => {
      await log(request);
      const form = find(params.id);
      const l = lang(params.lang);
      if (!form || !l) return notFound();
      const body = (await request.json()) as FormDraft;
      const slot = form.languages[l];
      if (stale(slot.draft, body, true)) return changed();
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
        const draft = slot.draft;
        if (!draft) return bad('There is no draft to publish in this language');
        const body: unknown = request.headers
          .get('content-type')
          ?.includes('json')
          ? await request.json()
          : undefined;
        if (stale(draft, body)) return changed();
        const placed = new Set(draft.placements.map((p) => p.key));
        const missing = draft.originalPdf
          ? draft.fields.filter((f) => f.required && !placed.has(f.key))
          : [];
        if (missing.length > 0)
          return bad(
            `Place these required fields on the PDF before publishing: ${missing.map((f) => f.key).join(', ')}`,
          );
        slot.published = {
          ...draft,
          publishedAt: new Date().toISOString(),
        };
        slot.draft = null;
        return HttpResponse.json(form);
      },
    ),
    http.post(
      `${base}/:id/versions/:lang/source/upload-url`,
      async ({ params, request }) => {
        await log(request);
        const form = find(params.id);
        const l = lang(params.lang);
        if (!form || !l) return notFound();
        if (!form.languages[l].draft)
          return bad('Save a draft in this language before changing its PDF');
        return HttpResponse.json({
          uploadUrl: `${MOCK_STORAGE_ORIGIN}/upload/forms/${form.id}/${l}.pdf?sig=mock`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      },
    ),
    http.put(
      `${MOCK_STORAGE_ORIGIN}/upload/forms/:id/:file`,
      async ({ params, request }) => {
        state.uploads.set(`${params.id}/${params.file}`, {
          bytes: (await request.arrayBuffer()).byteLength,
          pageCount: state.nextPageCount,
        });
        return new HttpResponse(null, { status: 200 });
      },
    ),
    http.post(
      `${base}/:id/versions/:lang/source/confirm`,
      async ({ params, request }) => {
        await log(request);
        const form = find(params.id);
        const l = lang(params.lang);
        const draft = l && form?.languages[l].draft;
        if (!form || !l) return notFound();
        if (!draft)
          return bad('Save a draft in this language before changing its PDF');
        const upload = state.uploads.get(`${form.id}/${l}.pdf`);
        if (!upload)
          return bad(
            'No uploaded PDF found; request an upload URL and upload the file first',
          );
        state.uploads.delete(`${form.id}/${l}.pdf`);
        const pages = Array.from({ length: upload.pageCount }, () => ({
          width: 612,
          height: 792,
          rotate: 0 as const,
          x: 0,
          y: 0,
        }));
        const placementsCleared =
          draft.placements.length > 0 &&
          JSON.stringify(draft.originalPdf?.pages) !== JSON.stringify(pages);
        draft.originalPdf = fakeOriginalPdf({
          sha256: `${upload.bytes}`.padStart(64, '0'),
          sizeBytes: upload.bytes,
          pageCount: pages.length,
          pages,
          url: `${MOCK_STORAGE_ORIGIN}/forms/${form.id}/${l}-v${draft.version}.pdf?sig=mock`,
        });
        if (placementsCleared) draft.placements = [];
        draft.updatedAt = stamp(draft);
        return HttpResponse.json({ ...form, placementsCleared });
      },
    ),
    http.delete(
      `${base}/:id/versions/:lang/source`,
      async ({ params, request }) => {
        await log(request);
        const form = find(params.id);
        const l = lang(params.lang);
        const draft = l && form?.languages[l].draft;
        if (!form || !l) return notFound();
        if (!draft)
          return bad('Save a draft in this language before changing its PDF');
        if (!draft.originalPdf)
          return bad('This draft has no original PDF', 404);
        draft.originalPdf = null;
        draft.placements = [];
        draft.updatedAt = stamp(draft);
        return HttpResponse.json(form);
      },
    ),
    http.put(
      `${base}/:id/versions/:lang/placements`,
      async ({ params, request }) => {
        await log(request);
        const form = find(params.id);
        const l = lang(params.lang);
        const draft = l && form?.languages[l].draft;
        if (!form || !l) return notFound();
        if (!draft) return bad('There is no draft in this language');
        if (!draft.originalPdf) return bad('This draft has no original PDF');
        const body = (await request.json()) as {
          placements: FormPlacement[];
        };
        if (stale(draft, body)) return changed();
        const { placements } = body;
        for (const placement of placements) {
          const problem = placementProblem(placement, draft);
          if (problem)
            return bad(`The field positions are not valid: ${problem}`);
        }
        draft.placements = placements;
        draft.updatedAt = stamp(draft);
        return HttpResponse.json(form);
      },
    ),
  ];
}
