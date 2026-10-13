import { http, HttpResponse, type HttpHandler } from 'msw';
import type {
  AssignRequest,
  Assignment,
  CertUpload,
  CertUploadReview,
  CertUploadUrlRequest,
  CompleteRequest,
  ConsentText,
  Field,
  Template,
  TemplateCreate,
  TemplatePatch,
  TemplatePage,
} from './types';
import {
  MOCK_CONSENT_TEXT,
  MOCK_SEASON,
  MOCK_STORAGE_ORIGIN,
  buildChecklist,
  fakeAssignment,
  fakeCertUpload,
  presentCertUploads,
  sampleAssignments,
  sampleCertUploads,
  sampleTemplates,
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
  meInstructorId: string;
  meCerts: { org: CertOrg; track: CertTrack; level: number }[];
  uploadedSources: Map<string, ArrayBuffer>;
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
    meInstructorId: 'inst-1',
    meCerts: [
      { org: 'csia', track: 'regular', level: 3 },
      { org: 'casi', track: 'park', level: 2 },
    ],
    uploadedSources: new Map(),
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
const badRequest = (message: string) =>
  HttpResponse.json({ message }, { status: 400 });

function nowIso() {
  return new Date().toISOString();
}

let seq = 0;
function nextId(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

const EDGE_TOLERANCE = 0.01;

/** Mirrors the API's `PUT …/fields` validation. */
export function validateFields(template: Template, fields: Field[]) {
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
  const findAssignment = (id: unknown) =>
    state.assignments.find((a) => a.id === id);
  const pdfFor = (t: Template) =>
    state.uploadedSources.get(t.id) ??
    buildSamplePdf(
      (t.pages.length ? t.pages : DEFAULT_PAGES).map((p, i) => ({
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
        lines: [t.titleEn, `Page ${i + 1}`],
      })),
    );

  return [
    http.get(`${A}/admin/documents/templates`, () =>
      HttpResponse.json(state.templates.map(toSummary)),
    ),
    http.post(`${A}/admin/documents/templates`, async ({ request }) => {
      const body = (await request.json()) as TemplateCreate;
      if (!body.titleEn?.trim()) return badRequest('titleEn is required');
      const t: Template = {
        id: nextId('tpl'),
        kind: body.kind,
        audience: body.audience,
        titleEn: body.titleEn,
        titleZh: body.titleZh ?? null,
        descriptionEn: body.descriptionEn ?? null,
        descriptionZh: body.descriptionZh ?? null,
        required: body.required,
        isActive: true,
        sortOrder: body.sortOrder,
        hasSource: false,
        sourceSha256: null,
        pageCount: null,
        fieldCount: 0,
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
      return t ? HttpResponse.json(withDerived(t)) : notFound();
    }),
    http.patch(
      `${A}/admin/documents/templates/:id`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        Object.assign(t, (await request.json()) as TemplatePatch, {
          updatedAt: nowIso(),
        });
        return HttpResponse.json(withDerived(t));
      },
    ),
    http.post(
      `${A}/admin/documents/templates/:id/source/upload-url`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
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
        return HttpResponse.json({ ...withDerived(t), fieldsCleared: false });
      },
    ),
    http.put(
      `${A}/admin/documents/templates/:id/fields`,
      async ({ params, request }) => {
        const t = findTemplate(params.id);
        if (!t) return notFound();
        const { fields } = (await request.json()) as { fields: Field[] };
        const error = validateFields(t, fields);
        if (error) return badRequest(error);
        t.fields = fields;
        t.updatedAt = nowIso();
        return HttpResponse.json(withDerived(t));
      },
    ),
    http.post(`${A}/admin/documents/assignments`, async ({ request }) => {
      const body = (await request.json()) as AssignRequest;
      const template = findTemplate(body.templateId);
      if (!template) return notFound();
      if (!body.season?.trim()) return badRequest('season is required');
      const ids = body.allActiveInstructors
        ? state.instructorIds
        : (body.instructorIds ?? []);
      let created = 0;
      let skipped = 0;
      for (const subjectId of ids) {
        const exists = state.assignments.some(
          (a) =>
            a.templateId === body.templateId &&
            a.subjectId === subjectId &&
            a.season === body.season &&
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
            templateId: body.templateId,
            template: toAssignmentTemplate(template),
            subjectId,
            season: body.season,
            assignedAt: nowIso(),
          }),
        );
      }
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
          reviewNote: body.reviewNote ?? null,
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
        buildChecklist(
          state.templates,
          state.assignments.filter((a) => a.subjectId === state.meInstructorId),
          state.meCerts,
          state.certUploads.filter(
            (u) => u.instructorId === state.meInstructorId,
          ),
          state.season,
        ),
      ),
    ),
    http.get(`${A}/me/documents/:assignmentId`, ({ params }) => {
      const a = findAssignment(params.assignmentId);
      const t = a && findTemplate(a.templateId);
      if (!a || !t || a.subjectId !== state.meInstructorId) return notFound();
      if (a.status === 'assigned') {
        a.status = 'viewed';
        a.viewedAt = nowIso();
      }
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
          pages: t.pages,
          fields: t.fields,
        },
        sourceUrl: `${MOCK_STORAGE_ORIGIN}/templates/${t.id}/source.pdf`,
        consentText: state.consentText,
      });
    }),
    http.post(
      `${A}/me/documents/:assignmentId/complete`,
      async ({ params, request }) => {
        const a = findAssignment(params.assignmentId);
        const t = a && findTemplate(a.templateId);
        if (!a || !t || a.subjectId !== state.meInstructorId) return notFound();
        if (a.status === 'completed')
          return HttpResponse.json(
            { message: 'Already completed' },
            { status: 409 },
          );
        const body = (await request.json()) as CompleteRequest;
        if (t.kind === 'read') {
          if (!('acknowledged' in body) || body.acknowledged !== true)
            return badRequest('acknowledged must be true');
        } else {
          if (!('consent' in body) || body.consent !== true)
            return badRequest('consent is required');
          if (!body.signerName?.trim())
            return badRequest('signerName is required');
          for (const f of t.fields.filter((x) => x.required)) {
            const isSig = f.type === 'signature' || f.type === 'initials';
            const present = isSig
              ? Boolean(body.signatures?.[f.id])
              : body.values?.[f.id] !== undefined && body.values[f.id] !== '';
            if (!present) return badRequest(`Field ${f.id} is required`);
          }
          a.signerName = body.signerName;
          a.consentAt = nowIso();
          a.templateSha256 = t.sourceSha256;
          a.signedSha256 = 'e5f6a7b8'.repeat(8);
          a.hasSignedCopy = true;
        }
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
        const u = state.certUploads.find((x) => x.id === params.uploadId);
        if (!u) return notFound();
        u.sha256 = 'f00dbabe'.repeat(8);
        return HttpResponse.json(u);
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
      () => new HttpResponse(null, { status: 200 }),
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
