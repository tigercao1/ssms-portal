import { beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '@/test/msw';
import { ApiError } from '@/lib/api';
import {
  archiveAssignment,
  certState,
  completeMyDocument,
  confirmMyCertUpload,
  confirmTemplateSource,
  createAssignments,
  createTemplate,
  currentUploads,
  getAssignmentSignedUrl,
  getCertUploadUrl,
  getInstructorDocuments,
  getMyChecklist,
  getMyDocument,
  getMySignedUrl,
  getTemplate,
  listTemplates,
  putToPresignedUrl,
  remindAssignment,
  requestMyCertUpload,
  requestTemplateSourceUpload,
  reviewCertUpload,
  saveTemplateFields,
  todayIso,
  updateTemplate,
} from './index';
import {
  createDocumentsState,
  documentsHandlers,
  validateFields,
  type DocumentsMockState,
} from './handlers';
import {
  buildChecklist,
  fakeCertUpload,
  fakeField,
  fakeTemplate,
} from './fixtures';
import { buildSamplePdf } from './samplePdf';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

let state: DocumentsMockState;
beforeEach(() => {
  state = createDocumentsState();
  server.use(...documentsHandlers(state));
});

describe('admin template requests', () => {
  it('lists summaries without pages or fields', async () => {
    const list = await listTemplates();
    expect(list.map((t) => t.id)).toContain('tpl-conduct');
    expect(list[0]).not.toHaveProperty('fields');
  });

  it('creates, uploads, confirms, patches and saves fields', async () => {
    const created = await createTemplate({
      kind: 'sign',
      audience: 'instructor',
      titleEn: 'New',
      required: true,
      sortOrder: 1,
    });
    expect(created.sourceUrl).toBeNull();
    await expect(confirmTemplateSource(created.id)).rejects.toBeInstanceOf(
      ApiError,
    );
    const pdf = new Blob([buildSamplePdf([{ width: 612, height: 792 }])]);
    const { uploadUrl } = await requestTemplateSourceUpload(
      created.id,
      pdf.size,
    );
    await putToPresignedUrl(uploadUrl, pdf, 'application/pdf');
    const confirmed = await confirmTemplateSource(created.id);
    expect(confirmed.pageCount).toBe(1);
    expect(confirmed.sourceUrl).toMatch(/source\.pdf$/);
    const patched = await updateTemplate(created.id, { isActive: false });
    expect(patched.isActive).toBe(false);
    const saved = await saveTemplateFields(created.id, [fakeField()]);
    expect(saved.fields).toHaveLength(1);
    await expect(
      saveTemplateFields(created.id, [fakeField({ x: 600 })]),
    ).rejects.toMatchObject({ status: 400 });
    expect((await getTemplate(created.id)).fields[0]?.id).toBe('f_sig');
  });

  it('rejects oversize uploads and failed presigned PUTs', async () => {
    await expect(
      requestTemplateSourceUpload('tpl-conduct', 21 * 1024 * 1024),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      putToPresignedUrl(
        'https://storage.mock/nowhere',
        new Blob(['x']),
        'application/pdf',
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('admin assignment + cert requests', () => {
  it('assigns idempotently', async () => {
    state.instructorIds = ['inst-1', 'inst-2'];
    const first = await createAssignments({
      templateId: 'tpl-conduct',
      season: '2027-28',
      allActiveInstructors: true,
    });
    expect(first).toEqual({ created: 2, skipped: 0 });
    const again = await createAssignments({
      templateId: 'tpl-conduct',
      season: '2027-28',
      instructorIds: ['inst-2'],
    });
    expect(again).toEqual({ created: 0, skipped: 1 });
  });

  it('lists, reminds, archives and links documents', async () => {
    const docs = await getInstructorDocuments('inst-1');
    expect(docs.assignments.length).toBeGreaterThan(0);
    expect(docs.certificationUploads.length).toBeGreaterThan(0);
    await remindAssignment('asg-waiver');
    expect(state.reminded).toEqual(['asg-waiver']);
    await expect(remindAssignment('asg-conduct')).rejects.toMatchObject({
      status: 409,
    });
    const archived = await archiveAssignment('asg-waiver');
    expect(archived?.status).toBe('archived');
    const signed = await getAssignmentSignedUrl('asg-conduct');
    expect(signed.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await getCertUploadUrl('cu-1')).url).toContain('cu-1');
    const reviewed = await reviewCertUpload('cu-1', {
      reviewStatus: 'rejected',
      reviewNote: 'Blurry',
      validUntil: '2027-01-31',
    });
    expect(reviewed).toMatchObject({
      reviewStatus: 'rejected',
      validUntil: '2027-01-31',
    });
  });
});

describe('/me requests', () => {
  it('builds the checklist and marks a document viewed', async () => {
    const list = await getMyChecklist();
    expect(list.season).toBe('2026-27');
    expect(list.items.filter((i) => i.type === 'certification')).toHaveLength(
      2,
    );
    const doc = await getMyDocument('asg-waiver');
    expect(doc.template.fields.length).toBeGreaterThan(0);
    expect(doc.assignment.status).toBe('viewed');
  });

  it('completes sign and read documents', async () => {
    await expect(
      completeMyDocument('asg-waiver', {
        consent: true,
        signerName: 'Jane',
        values: {},
        signatures: {},
      }),
    ).rejects.toMatchObject({ status: 400 });
    const done = await completeMyDocument('asg-waiver', {
      consent: true,
      signerName: 'Jane Snow',
      values: {},
      signatures: { f_w_sig: { mode: 'typed', text: 'Jane Snow' } },
    });
    expect(done.signedUrl).toBeDefined();
    expect((await getMySignedUrl('asg-waiver')).url).toContain('asg-waiver');
    await expect(
      completeMyDocument('asg-waiver', { acknowledged: true }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('uploads a certification', async () => {
    const { uploadId, uploadUrl } = await requestMyCertUpload({
      org: 'csia',
      track: 'regular',
      validUntil: '2027-12-31',
      contentType: 'image/png',
      contentLength: 1000,
    });
    await putToPresignedUrl(uploadUrl, new Blob(['x']), 'image/png');
    const confirmed = await confirmMyCertUpload(uploadId);
    expect(confirmed.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('validity rules', () => {
  const today = '2026-10-12';
  it.each([
    [null, 'missing'],
    [{ reviewStatus: 'rejected', validUntil: '2030-01-01' }, 'rejected'],
    [{ reviewStatus: 'approved', validUntil: '2026-10-11' }, 'expired'],
    [{ reviewStatus: 'approved', validUntil: '2026-10-12' }, 'expiring'],
    [{ reviewStatus: 'approved', validUntil: '2026-11-11' }, 'expiring'],
    [{ reviewStatus: 'approved', validUntil: '2026-11-12' }, 'valid'],
    [{ reviewStatus: 'pending', validUntil: '2027-06-30' }, 'pending'],
  ] as const)('%o → %s', (upload, expected) => {
    expect(certState(upload, today)).toBe(expected);
  });

  it('formats today locally and picks the latest upload per cert', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    const current = currentUploads([
      fakeCertUpload({ id: 'old', insertedAt: '2025-01-01T00:00:00Z' }),
      fakeCertUpload({ id: 'new', insertedAt: '2026-01-01T00:00:00Z' }),
      fakeCertUpload({ id: 'park', track: 'park' }),
    ]);
    expect(current.map((u) => u.id).sort()).toEqual(['new', 'park']);
  });
});

describe('mock helpers', () => {
  it('validates fields like the API', () => {
    const t = fakeTemplate();
    expect(validateFields(t, [fakeField()])).toBeNull();
    expect(validateFields(t, [fakeField(), fakeField()])).toMatch(/Duplicate/);
    expect(validateFields(t, [fakeField({ page: 3 })])).toMatch(/page/);
    expect(validateFields(t, [fakeField({ labelEn: ' ' })])).toMatch(/label/);
    expect(validateFields(t, [fakeField({ w: 0 })])).toMatch(/size/);
  });

  it('skips archived assignments in the checklist', () => {
    const list = buildChecklist(
      [fakeTemplate()],
      [{ ...createDocumentsState().assignments[1]!, status: 'archived' }],
      [],
      [],
    );
    expect(list.items).toHaveLength(0);
  });
});
