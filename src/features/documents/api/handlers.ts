import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  AssignRequest,
  Assignment,
  CertUpload,
  CertUploadReview,
  CertUploadUrlRequest,
  ChangeAudienceRequest,
  CompleteRequest,
  ConsentText,
  DocumentLanguage,
  Field,
  PublishRequest,
  Template,
  TemplateCreate,
  TemplatePatch,
  TemplatePage,
  TemplateTranslation,
} from './types';
import { DOCUMENT_LANGUAGES } from './types';
import {
  MOCK_CONSENT_TEXT,
  MOCK_SEASON,
  MOCK_STORAGE_ORIGIN,
  buildChecklist,
  buildPreviewChecklist,
  fakeAssignment,
  fakeCertUpload,
  presentCertUploads,
  sampleAssignments,
  sampleCertUploads,
  sampleTemplates,
  templateLanguages,
  toAssignmentTemplate,
  toSummary,
  withDerived,
} from './fixtures';
import { buildSamplePdf } from './samplePdf';
import type { CertOrg, CertTrack } from '@/lib/types';

export interface DocumentsMockState {
  templates: Template[];
  assignments: Assignment[];
  certUploads: CertUpload[];
  instructorIds: string[];
  pendingInstructorIds: string[];
  meInstructorId: string;
  meApprovalStatus: 'approved' | 'pending' | 'rejected';
  meIsActive: boolean;
  meCerts: { org: CertOrg; track: CertTrack; level: number }[];
  uploadedSources: Map<string, ArrayBuffer>;
  uploadedCerts: Map<string, ArrayBuffer>;
  reminded: string[];
  season: string | null;
  consentText: ConsentText;
}

/** Fresh, deep-copied mock database seeded with the sample fixtures. */
export function createDocumentsState(
  overrides: Partial<DocumentsMockState> = {},
): DocumentsMockState {
  return {
    templates: structuredClone(sampleTemplates),
    assignments: structuredClone(sampleAssignments),
    certUploads: structuredClone(sampleCertUploads),
    instructorIds: ['inst-1'],
    pendingInstructorIds: [],
    meInstructorId: 'inst-1',
    meApprovalStatus: 'approved',
    meIsActive: true,
    meCerts: [
      { org: 'csia', track: 'regular', level: 3 },
      { org: 'casi', track: 'park', level: 2 },
    ],
    uploadedSources: new Map(),
    uploadedCerts: new Map(),
    reminded: [],
    season: MOCK_SEASON,
    consentText: structuredClone(MOCK_CONSENT_TEXT),
    ...overrides,
  };
}

const DEFAULT_PAGES: TemplatePage[] = [
  { x: 0, y: 0, width: 612, height: 792, rotate: 0 },
];

const notFound = () =>
  HttpResponse.json({ message: 'Not found' }, { status: 404 });
const TEMPLATE_PATCH_KEYS = new Set<string>([
  'titleEn',
  'titleZh',
  'descriptionEn',
  'descriptionZh',
  'required',
  'sortOrder',
  'sourceLanguage',
] satisfies (keyof TemplatePatch)[]);

const badRequest = (message: string) =>
  HttpResponse.json({ message }, { status: 400 });
const conflict = (message: string) =>
  HttpResponse.json({ message }, { status: 409 });
const notApproved = (status: 'pending' | 'rejected') =>
  HttpResponse.json(
    status === 'rejected'
      ? {
          message:
            'Your profile was not approved, so onboarding documents are not available',
          reason: 'rejected',
        }
      : {
          message: 'Your profile is pending approval',
          reason: 'pending_approval',
        },
    { status: 403 },
  );
const deactivated = () =>
  HttpResponse.json(
    {
      statusCode: 403,
      message: 'Your profile is deactivated',
      reason: 'deactivated',
    },
    { status: 403 },
  );
const TEMPLATE_LOCKED =
  'Someone has completed this document, so its PDF and fields can no longer change. Retire it and publish a new one instead.';

function nowIso() {
  return new Date().toISOString();
}

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

const EDGE_TOLERANCE = 0.01;

function isDocumentLanguage(value: unknown): value is DocumentLanguage {
  return DOCUMENT_LANGUAGES.includes(value as DocumentLanguage);
}

/** Mirrors the API's `PUT …/fields` validation. */
export function validateFields(
  template: Pick<Template, 'pages'>,
  fields: Field[],
) {
  const ids = new Set<string>();
  for (const f of fields) {
    if (ids.has(f.id)) return `Duplicate field id ${f.id}`;
    ids.add(f.id);
    const page = template.pages[f.page - 1];
    if (!page) return `Field ${f.id} is on a page that does not exist`;
    if (!f.labelEn.trim()) return `Field ${f.id} needs an English label`;
    if (f.w <= 0 || f.h <= 0) return `Field ${f.id} has no size`;
    if (
      f.x < page.x - EDGE_TOLERANCE ||
      f.y < page.y - EDGE_TOLERANCE ||
      f.x + f.w > page.x + page.width + EDGE_TOLERANCE ||
      f.y + f.h > page.y + page.height + EDGE_TOLERANCE
    )
      return `Field ${f.id} is outside page ${f.page}`;
  }
  return null;
}

/**
 * Stateful msw handlers for every documents endpoint (admin and `/me`) plus
 * the presigned storage URLs they hand out.
 */
export function documentsHandlers(
  state: DocumentsMockState = createDocumentsState(),
  apiBase = 'http://localhost:3000',
): HttpHandler[] {
  const A = apiBase;
  const findTemplate = (id: unknown) =>
    state.templates.find((t) => t.id === id);
  const present = (t: Template): Template => {
    const open = state.assignments.filter(
      (a) =>
        a.templateId === t.id &&
        a.status !== 'archived' &&
        t.season !== null &&
        a.season === t.season,
    );
    const approvedOpen = open.filter(
      (a) =>
        a.subjectType === 'instructor' &&
        state.instructorIds.includes(a.subjectId),
    );
    return withDerived({
      ...t,
      hasCompletedAssignments: state.assignments.some(
        (a) => a.templateId === t.id && a.status === 'completed',
      ),
      assignedCount: open.length,
      completedCount: open.filter((a) => a.status === 'completed').length,
      approvedAssignedCount: approvedOpen.length,
      approvedCompletedCount: approvedOpen.filter(
        (a) => a.status === 'completed',
      ).length,
      approvedCount:
        t.status === 'draft' || t.season === null
          ? 0
          : state.instructorIds.length,
    });
  };
  const assignToInstructors = (
    template: Template,
    season: string,
    ids: string[],
  ) => {
    let created = 0;
    let skipped = 0;
    for (const subjectId of ids) {
      const exists = state.assignments.some(
        (a) =>
          a.templateId === template.id &&
          a.subjectId === subjectId &&
          a.season === season &&
          a.status !== 'archived',
      );
      if (exists) {
        skipped += 1;
        continue;
      }
      created += 1;
      state.assignments.push(
        fakeAssignment({
          id: nextId('asg'),
          templateId: template.id,
          template: toAssignmentTemplate(template),
          subjectId,
          season,
          assignedAt: nowIso(),
        }),
      );
    }
    return { created, skipped };
  };
  const findAssignment = (id: unknown) =>
    state.assignments.find((a) => a.id === id);
  const sourceKey = (id: string, language: DocumentLanguage | null) =>
    language ? `${id}:${language}` : id;
  const findTranslation = (t: Template, language: unknown) =>
    t.translations.find((tr) => tr.language === language);
  const translationRequestError = (t: Template, language: unknown) => {
    if (!isDocumentLanguage(language))
      return badRequest('language must be en or zh');
    if (!t.sourceLanguage)
      return badRequest(
        'Set the main version language before adding another language',
      );
    if (language === t.sourceLanguage)
      return badRequest(
        'This language is the main version; pick the other language',
      );
    if (present(t).hasCompletedAssignments) return conflict(TEMPLATE_LOCKED);
    return null;
  };
  const servedVersion = (t: Template, requested: string | null) => {
    const translation = t.translations.find(
      (tr) => tr.language === requested && tr.sourceSha256 !== null,
    );
    return translation
      ? {
          language: translation.language,
          pageCount: translation.pageCount,
          pages: translation.pages,
          fields: translation.fields,
          sourceSha256: translation.sourceSha256,
          sourceUrl: translation.sourceUrl,
        }
      : {
          language: t.sourceLanguage,
          pageCount: t.pageCount,
          pages: t.pages,
          fields: t.fields,
          sourceSha256: t.sourceSha256,
          sourceUrl: t.hasSource
            ? `${MOCK_STORAGE_ORIGIN}/templates/${t.id}/source.pdf`
            : null,
        };
  };
  const pdfFor = (
    t: Template,
    version: Pick<TemplateTranslation, 'pages'> & {
      language: DocumentLanguage | null;
    } = { pages: t.pages, language: null },
  ) =>
    state.uploadedSources.get(sourceKey(t.id, version.language)) ??
    buildSamplePdf(
      (version.pages.length ? version.pages : DEFAULT_PAGES).map((p, i) => ({
        width: p.x + p.width,
        height: p.y + p.height,
        rotate: p.rotate,
        ...((p.x !== 0 || p.y !== 0) && {
          cropBox: [p.x, p.y, p.x + p.width, p.y + p.height] as [
            number,
            number,
            number,
            number,
          ],
        }),
        lines: [
          t.titleEn,
          `Page ${i + 1}`,
          ...(version.language ? [`Language ${version.language}`] : []),
        ],
      })),
    );

  return [
    http.get(`${A}/admin/documents/templates`, () =>
      HttpResponse.json(state.templates.map((t) => toSummary(present(t)))),
    ),
    http.post(`${A}/admin/documents/templates`, async ({ request }) => {
      const body = (await request.json()) as TemplateCreate;
      if (!body.titleEn?.trim()) return badRequest('titleEn is required');
      if (
        body.sourceLanguage !== undefined &&
        body.sourceLanguage !== null &&
        !isDocumentLanguage(body.sourceLanguage)
      )
        return badRequest('sourceLanguage must be en, zh or null');
      const t: Template = {
        id: nextId('tpl'),
        kind: body.kind,
        audience: body.audience,
        titleEn: body.titleEn,
        titleZh: body.titleZh ?? null,
        descriptionEn: body.descriptionEn ?? null,
        descriptionZh: body.descriptionZh ?? null,
        required: body.required,
        status: 'draft',
        assignTo: null,
        season: null,
        publishedAt: null,
        hasCompletedAssignments: false,
        assignedCount: 0,
        completedCount: 0,
        approvedAssignedCount: 0,
        approvedCompletedCount: 0,
        approvedCount: 0,
        sortOrder: body.sortOrder,
        hasSource: false,
        sourceSha256: null,
        pageCount: null,
        fieldCount: 0,
        sourceLanguage: body.sourceLanguage ?? null,
        languages: [],
        translations: [],
        updatedBy: 'auth-admin',
        insertedAt: nowIso(),
        updatedAt: nowIso(),
        pages: [],
        fields: [],
        sourceUrl: null,
      };
      state.templates.push(t);
      return HttpResponse.json(t, { status: 201 });
    }),
    http.get(`${A}/admin/documents/templates/:id`, ({ params }) => {
      const t = findTemplate(params.id);
      return t ? HttpResponse.json(present(t)) : notFound();
    }),
    http.patch(
      `${A}/admin/documents/templates/:id`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const body = (await request.json()) as TemplatePatch;
        const unknownKey = Object.keys(body).find(
          (key) => !TEMPLATE_PATCH_KEYS.has(key),
        );
        if (unknownKey)
          return badRequest(`property ${unknownKey} should not exist`);
        if (body.sourceLanguage !== undefined) {
          if (
            body.sourceLanguage !== null &&
            !isDocumentLanguage(body.sourceLanguage)
          )
            return badRequest('sourceLanguage must be en, zh or null');
          if (
            t.translations.length > 0 &&
            (body.sourceLanguage === null ||
              findTranslation(t, body.sourceLanguage))
          )
            return badRequest(
              'Remove the other language version before changing the main version language',
            );
        }
        Object.assign(t, body, { updatedAt: nowIso() });
        return HttpResponse.json(present(t));
      },
    ),
    http.get(
      `${A}/admin/documents/templates/:id/publish-preview`,
      ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const season =
          new URL(request.url).searchParams.get('season') ??
          state.season ??
          MOCK_SEASON;
        const alreadyAssignedCount = state.instructorIds.filter((id) =>
          state.assignments.some(
            (a) =>
              a.templateId === t.id &&
              a.subjectId === id &&
              a.season === season &&
              a.status !== 'archived',
          ),
        ).length;
        return HttpResponse.json({
          season,
          approvedCount: state.instructorIds.length,
          pendingCount: state.pendingInstructorIds.length,
          alreadyAssignedCount,
        });
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/publish`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const body = (await request.json()) as PublishRequest;
        if (body.assignTo !== 'all' && body.assignTo !== 'selected')
          return badRequest('assignTo must be all or selected');
        if (t.status === 'live')
          return conflict('This document is already published');
        if (!t.sourceSha256)
          return badRequest('Upload the PDF before publishing');
        if (t.kind === 'sign' && t.fields.length === 0)
          return badRequest(
            'Place at least one field before publishing a document to sign',
          );
        if (
          t.kind === 'sign' &&
          t.translations.some(
            (tr) => tr.sourceSha256 !== null && tr.fields.length === 0,
          )
        )
          return badRequest(
            'Place at least one field on every language version before publishing',
          );
        if (body.assignTo === 'all' && t.audience !== 'instructor')
          return badRequest(
            'Only instructor documents can be published to all instructors',
          );
        if (body.instructorIds && body.assignTo !== 'selected')
          return badRequest(
            'instructorIds can only be sent when assigning to selected instructors',
          );
        const season = body.season ?? state.season ?? MOCK_SEASON;
        Object.assign(t, {
          status: 'live',
          assignTo: body.assignTo,
          season,
          publishedAt: nowIso(),
          updatedAt: nowIso(),
        });
        const { created, skipped } =
          body.assignTo === 'all'
            ? assignToInstructors(t, season, state.instructorIds)
            : assignToInstructors(t, season, body.instructorIds ?? []);
        return HttpResponse.json({ template: present(t), created, skipped });
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/audience`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const body = (await request.json()) as ChangeAudienceRequest;
        if (body.assignTo !== 'all' && body.assignTo !== 'selected')
          return badRequest('assignTo must be all or selected');
        if (t.status !== 'live')
          return conflict(
            "Only a published document's audience can be changed",
          );
        if (t.assignTo === body.assignTo)
          return conflict('This document already has that audience');
        if (body.assignTo === 'all' && t.audience !== 'instructor')
          return badRequest(
            'Only instructor documents can be published to all instructors',
          );
        const season = t.season ?? state.season ?? MOCK_SEASON;
        Object.assign(t, {
          assignTo: body.assignTo,
          season,
          updatedAt: nowIso(),
        });
        const { created, skipped } =
          body.assignTo === 'all'
            ? assignToInstructors(t, season, state.instructorIds)
            : { created: 0, skipped: 0 };
        return HttpResponse.json({ template: present(t), created, skipped });
      },
    ),
    http.post(`${A}/admin/documents/templates/:id/retire`, ({ params }) => {
      const t = findTemplate(params.id);
      if (!t) return notFound();
      if (t.status !== 'live')
        return conflict('Only a published document can be retired');
      Object.assign(t, { status: 'retired', updatedAt: nowIso() });
      return HttpResponse.json(present(t));
    }),
    http.post(
      `${A}/admin/documents/templates/:id/source/upload-url`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        if (present(t).hasCompletedAssignments)
          return conflict(TEMPLATE_LOCKED);
        const { contentLength } = (await request.json()) as {
          contentLength: number;
        };
        if (!(contentLength > 0) || contentLength > 20 * 1024 * 1024)
          return badRequest('PDF must be 20 MB or smaller');
        return HttpResponse.json({
          uploadUrl: `${MOCK_STORAGE_ORIGIN}/upload/templates/${t.id}/source.pdf?sig=mock`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/source/confirm`,
      ({ params }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        if (present(t).hasCompletedAssignments)
          return conflict(TEMPLATE_LOCKED);
        if (!state.uploadedSources.has(t.id))
          return badRequest('No uploaded source found');
        const pages = t.pages.length ? t.pages : DEFAULT_PAGES;
        Object.assign(t, {
          pages,
          pageCount: pages.length,
          sourceSha256: 'd4c3b2a1'.repeat(8),
          sourceUrl: `${MOCK_STORAGE_ORIGIN}/templates/${t.id}/source.pdf`,
          updatedAt: nowIso(),
        });
        return HttpResponse.json({ ...present(t), fieldsCleared: false });
      },
    ),
    http.put(
      `${A}/admin/documents/templates/:id/fields`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        if (present(t).hasCompletedAssignments)
          return conflict(TEMPLATE_LOCKED);
        const { fields } = (await request.json()) as { fields: Field[] };
        const error = validateFields(t, fields);
        if (error) return badRequest(error);
        t.fields = fields;
        t.updatedAt = nowIso();
        return HttpResponse.json(present(t));
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/translations/:language/source/upload-url`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const error = translationRequestError(t, params.language);
        if (error) return error;
        const { contentLength } = (await request.json()) as {
          contentLength: number;
        };
        if (!(contentLength > 0) || contentLength > 20 * 1024 * 1024)
          return badRequest('PDF must be 20 MB or smaller');
        return HttpResponse.json({
          uploadUrl: `${MOCK_STORAGE_ORIGIN}/upload/templates/${t.id}/${String(params.language)}/source.pdf?sig=mock`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/translations/:language/source/confirm`,
      ({ params }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const error = translationRequestError(t, params.language);
        if (error) return error;
        const language = params.language as DocumentLanguage;
        if (!state.uploadedSources.has(sourceKey(t.id, language)))
          return badRequest('No uploaded source found');
        const existing = findTranslation(t, language);
        const pages = existing?.pages.length ? existing.pages : DEFAULT_PAGES;
        const translation: TemplateTranslation = {
          language,
          hasSource: true,
          sourceSha256: 'c4d5e6f7'.repeat(8),
          pageCount: pages.length,
          pages,
          fields: existing?.fields ?? [],
          sourceUrl: `${MOCK_STORAGE_ORIGIN}/templates/${t.id}/${language}/source.pdf`,
        };
        t.translations = [
          ...t.translations.filter((tr) => tr.language !== language),
          translation,
        ];
        t.updatedAt = nowIso();
        return HttpResponse.json({ ...present(t), fieldsCleared: false });
      },
    ),
    http.put(
      `${A}/admin/documents/templates/:id/translations/:language/fields`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const error = translationRequestError(t, params.language);
        if (error) return error;
        const translation = findTranslation(t, params.language);
        if (!translation?.sourceSha256)
          return badRequest('Upload this language version first');
        const { fields } = (await request.json()) as { fields: Field[] };
        const invalid = validateFields(translation, fields);
        if (invalid) return badRequest(invalid);
        translation.fields = fields;
        t.updatedAt = nowIso();
        return HttpResponse.json(present(t));
      },
    ),
    http.delete(
      `${A}/admin/documents/templates/:id/translations/:language`,
      ({ params }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const error = translationRequestError(t, params.language);
        if (error) return error;
        if (!findTranslation(t, params.language)) return notFound();
        t.translations = t.translations.filter(
          (tr) => tr.language !== params.language,
        );
        state.uploadedSources.delete(
          sourceKey(t.id, params.language as DocumentLanguage),
        );
        t.updatedAt = nowIso();
        return HttpResponse.json(present(t));
      },
    ),
    http.post(`${A}/admin/documents/assignments`, async ({ request }) => {
      const body = (await request.json()) as AssignRequest;
      const template = findTemplate(body.templateId);
      if (!template) return notFound();
      if (template.status !== 'live')
        return badRequest(
          'Only live instructor templates with an uploaded PDF can be assigned',
        );
      if (!body.season?.trim()) return badRequest('season is required');
      const ids = body.allActiveInstructors
        ? state.instructorIds
        : (body.instructorIds ?? []);
      const { created, skipped } = assignToInstructors(
        template,
        body.season,
        ids,
      );
      return HttpResponse.json({ created, skipped }, { status: 201 });
    }),
    http.get(`${A}/admin/instructors/:id/documents`, ({ params }) =>
      HttpResponse.json({
        assignments: state.assignments.filter(
          (a) => a.subjectType === 'instructor' && a.subjectId === params.id,
        ),
        certificationUploads: presentCertUploads(
          state.certUploads.filter((u) => u.instructorId === params.id),
        ),
      }),
    ),
    http.get(
      `${A}/admin/documents/assignments/:id/signed-url`,
      ({ params }) => {
        const a = findAssignment(params.id);
        if (!a?.hasSignedCopy || !a.signedSha256) return notFound();
        return HttpResponse.json({
          url: `${MOCK_STORAGE_ORIGIN}/signed/${a.id}.pdf?sig=mock`,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          sha256: a.signedSha256,
        });
      },
    ),
    http.post(`${A}/admin/documents/assignments/:id/remind`, ({ params }) => {
      const a = findAssignment(params.id);
      if (!a) return notFound();
      if (a.status === 'completed' || a.status === 'archived')
        return HttpResponse.json(
          { message: 'Assignment is not open' },
          { status: 409 },
        );
      a.reminderSentAt = nowIso();
      state.reminded.push(a.id);
      return new HttpResponse(null, { status: 202 });
    }),
    http.post(`${A}/admin/documents/assignments/:id/archive`, ({ params }) => {
      const a = findAssignment(params.id);
      if (!a) return notFound();
      a.status = 'archived';
      a.updatedAt = nowIso();
      return HttpResponse.json(a);
    }),
    http.get(`${A}/admin/certification-uploads/:id/url`, ({ params }) => {
      const u = state.certUploads.find((x) => x.id === params.id);
      if (!u) return notFound();
      return HttpResponse.json({
        url: `${MOCK_STORAGE_ORIGIN}/certifications/${u.id}?sig=mock`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        sha256: u.sha256,
      });
    }),
    http.patch(
      `${A}/admin/certification-uploads/:id`,
      async ({ params, request }) => {
        const u = state.certUploads.find((x) => x.id === params.id);
        if (!u) return notFound();
        const body = (await request.json()) as CertUploadReview;
        if (body.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(body.validUntil))
          return badRequest('validUntil must be YYYY-MM-DD');
        Object.assign(u, {
          reviewStatus: body.reviewStatus,
          reviewNote:
            body.reviewNote === undefined ? u.reviewNote : body.reviewNote,
          validUntil: body.validUntil ?? u.validUntil,
          reviewedBy: 'auth-admin',
          reviewedAt: nowIso(),
          updatedAt: nowIso(),
        });
        return HttpResponse.json(u);
      },
    ),

    http.get(`${A}/me/documents`, () =>
      HttpResponse.json(
        !state.meIsActive || state.meApprovalStatus === 'rejected'
          ? {
              season: state.season,
              locked: true,
              lockReason: state.meIsActive ? 'rejected' : 'deactivated',
              items: [],
            }
          : state.meApprovalStatus === 'approved'
            ? buildChecklist(
                state.templates,
                state.assignments.filter(
                  (a) => a.subjectId === state.meInstructorId,
                ),
                state.meCerts,
                state.certUploads.filter(
                  (u) => u.instructorId === state.meInstructorId,
                ),
                state.season,
              )
            : buildPreviewChecklist(
                state.templates,
                state.meCerts,
                state.certUploads.filter(
                  (u) => u.instructorId === state.meInstructorId,
                ),
                state.season,
              ),
      ),
    ),
    http.get(`${A}/me/documents/:assignmentId`, ({ params, request }) => {
      if (!state.meIsActive) return deactivated();
      if (state.meApprovalStatus !== 'approved')
        return notApproved(state.meApprovalStatus);
      const a = findAssignment(params.assignmentId);
      const t = a && findTemplate(a.templateId);
      if (!a || !t || a.subjectId !== state.meInstructorId) return notFound();
      const requested = new URL(request.url).searchParams.get('language');
      if (requested !== null && !isDocumentLanguage(requested))
        return badRequest('language must be en or zh');
      if (a.status === 'assigned') {
        a.status = 'viewed';
        a.viewedAt = nowIso();
      }
      const version = servedVersion(t, requested);
      return HttpResponse.json({
        assignment: a,
        template: {
          id: t.id,
          kind: t.kind,
          titleEn: t.titleEn,
          titleZh: t.titleZh,
          descriptionEn: t.descriptionEn,
          descriptionZh: t.descriptionZh,
          required: t.required,
          pageCount: version.pageCount,
          pages: version.pages,
          fields: version.fields,
        },
        sourceUrl: version.sourceUrl,
        consentText: state.consentText,
        language: version.language,
        availableLanguages: templateLanguages(t),
      });
    }),
    http.post(
      `${A}/me/documents/:assignmentId/complete`,
      async ({ params, request }) => {
        if (!state.meIsActive) return deactivated();
        if (state.meApprovalStatus !== 'approved')
          return notApproved(state.meApprovalStatus);
        const a = findAssignment(params.assignmentId);
        const t = a && findTemplate(a.templateId);
        if (!a || !t || a.subjectId !== state.meInstructorId) return notFound();
        if (a.status === 'completed')
          return HttpResponse.json(
            { message: 'Already completed' },
            { status: 409 },
          );
        const body = (await request.json()) as CompleteRequest;
        if (
          body.language !== undefined &&
          !templateLanguages(t).includes(body.language)
        )
          return badRequest('That language version is not available');
        const version = servedVersion(t, body.language ?? null);
        if (t.kind === 'read') {
          if (!('acknowledged' in body) || body.acknowledged !== true)
            return badRequest('acknowledged must be true');
        } else {
          if (!('consent' in body) || body.consent !== true)
            return badRequest('consent is required');
          if (!body.signerName?.trim())
            return badRequest('signerName is required');
          for (const f of version.fields.filter((x) => x.required)) {
            const isSig = f.type === 'signature' || f.type === 'initials';
            const present = isSig
              ? Boolean(body.signatures?.[f.id])
              : body.values?.[f.id] !== undefined && body.values[f.id] !== '';
            if (!present) return badRequest(`Field ${f.id} is required`);
          }
          a.signerName = body.signerName;
          a.consentAt = nowIso();
          a.templateSha256 = version.sourceSha256;
          a.signedSha256 = 'e5f6a7b8'.repeat(8);
          a.hasSignedCopy = true;
        }
        a.language = body.language ?? null;
        a.status = 'completed';
        a.completedAt = nowIso();
        return HttpResponse.json({
          assignment: a,
          ...(t.kind === 'sign' && {
            signedUrl: `${MOCK_STORAGE_ORIGIN}/signed/${a.id}.pdf?sig=mock`,
          }),
        });
      },
    ),
    http.get(`${A}/me/documents/:assignmentId/signed-url`, ({ params }) => {
      const a = findAssignment(params.assignmentId);
      if (
        !a?.hasSignedCopy ||
        !a.signedSha256 ||
        a.subjectId !== state.meInstructorId
      )
        return notFound();
      return HttpResponse.json({
        url: `${MOCK_STORAGE_ORIGIN}/signed/${a.id}.pdf?sig=mock`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        sha256: a.signedSha256,
      });
    }),
    http.post(
      `${A}/me/certification-uploads/upload-url`,
      async ({ request }) => {
        if (!state.meIsActive) return deactivated();
        if (state.meApprovalStatus !== 'approved')
          return notApproved(state.meApprovalStatus);
        const body = (await request.json()) as CertUploadUrlRequest;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(body.validUntil ?? ''))
          return badRequest('validUntil must be YYYY-MM-DD');
        if (!(body.contentLength > 0) || body.contentLength > 10 * 1024 * 1024)
          return badRequest('File must be 10 MB or smaller');
        const upload = fakeCertUpload({
          id: nextId('cu'),
          instructorId: state.meInstructorId,
          org: body.org,
          track: body.track,
          contentType: body.contentType,
          sizeBytes: body.contentLength,
          validUntil: body.validUntil,
          insertedAt: nowIso(),
          updatedAt: nowIso(),
        });
        state.certUploads.push({ ...upload, sha256: '' });
        return HttpResponse.json({
          uploadId: upload.id,
          uploadUrl: `${MOCK_STORAGE_ORIGIN}/upload/certifications/${upload.id}?sig=mock`,
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        });
      },
    ),
    http.post(
      `${A}/me/certification-uploads/:uploadId/confirm`,
      ({ params }) => {
        if (!state.meIsActive) return deactivated();
        if (state.meApprovalStatus !== 'approved')
          return notApproved(state.meApprovalStatus);
        const u = state.certUploads.find((x) => x.id === params.uploadId);
        if (!u) return notFound();
        u.sha256 = 'f00dbabe'.repeat(8);
        return HttpResponse.json(u);
      },
    ),

    http.put(
      `${MOCK_STORAGE_ORIGIN}/upload/templates/:id/:language/source.pdf`,
      async ({ params, request }) => {
        state.uploadedSources.set(
          sourceKey(String(params.id), params.language as DocumentLanguage),
          await request.arrayBuffer(),
        );
        return new HttpResponse(null, { status: 200 });
      },
    ),
    http.put(
      `${MOCK_STORAGE_ORIGIN}/upload/templates/:id/source.pdf`,
      async ({ params, request }) => {
        state.uploadedSources.set(
          String(params.id),
          await request.arrayBuffer(),
        );
        return new HttpResponse(null, { status: 200 });
      },
    ),
    http.put(
      `${MOCK_STORAGE_ORIGIN}/upload/certifications/:id`,
      async ({ params, request }) => {
        state.uploadedCerts.set(String(params.id), await request.arrayBuffer());
        return new HttpResponse(null, { status: 200 });
      },
    ),
    http.get(
      `${MOCK_STORAGE_ORIGIN}/templates/:id/source.pdf`,
      ({ params }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        return new HttpResponse(pdfFor(t), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    ),
    http.get(
      `${MOCK_STORAGE_ORIGIN}/templates/:id/:language/source.pdf`,
      ({ params }) => {
        const t = findTemplate(params.id);
        const translation = t && findTranslation(t, params.language);
        if (!t || !translation) return notFound();
        return new HttpResponse(pdfFor(t, translation), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    ),
    http.get(
      `${MOCK_STORAGE_ORIGIN}/signed/:file`,
      () =>
        new HttpResponse(
          buildSamplePdf([
            { width: 612, height: 792, lines: ['Signed copy (mock)'] },
          ]),
          { headers: { 'Content-Type': 'application/pdf' } },
        ),
    ),
  ];
}
