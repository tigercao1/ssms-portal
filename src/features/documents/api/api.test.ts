import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  getPublishPreview,
  getTemplate,
  listTemplates,
  publishTemplate,
  putToPresignedUrl,
  remindAssignment,
  requestMyCertUpload,
  requestTemplateSourceUpload,
  retireTemplate,
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
  presentCertUploads,
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
    expect(list.find((t) => t.id === 'tpl-conduct')).toMatchObject({
      hasSource: true,
      fieldCount: 4,
      assignedCount: 1,
      completedCount: 1,
      approvedCount: 1,
    });
    expect(list.find((t) => t.id === 'tpl-draft')).toMatchObject({
      hasSource: false,
      fieldCount: 0,
      assignedCount: 0,
      completedCount: 0,
      approvedCount: 0,
    });
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
    expect(confirmed.fieldsCleared).toBe(false);
    expect(confirmed.pages[0]).toEqual({
      x: 0,
      y: 0,
      width: 612,
      height: 792,
      rotate: 0,
    });
    expect(confirmed.sourceUrl).toMatch(/source\.pdf$/);
    expect(created).toMatchObject({
      status: 'draft',
      assignTo: null,
      season: null,
      publishedAt: null,
      hasCompletedAssignments: false,
    });
    const patched = await updateTemplate(created.id, { required: false });
    expect(patched.required).toBe(false);
    const saved = await saveTemplateFields(created.id, [fakeField()]);
    expect(saved.fields).toHaveLength(1);
    await expect(
      saveTemplateFields(created.id, [fakeField({ x: 600 })]),
    ).rejects.toMatchObject({ status: 400 });
    expect((await getTemplate(created.id)).fields[0]?.id).toBe('f_sig');
  });

  it('rejects oversize uploads and failed presigned PUTs', async () => {
    await expect(
      requestTemplateSourceUpload('tpl-waiver', 21 * 1024 * 1024),
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

describe('publish lifecycle requests', () => {
  it('previews, publishes to all approved instructors, retires and re-publishes', async () => {
    state.instructorIds = ['inst-1', 'inst-2'];
    state.pendingInstructorIds = ['inst-3'];
    expect(await getPublishPreview('tpl-draft')).toEqual({
      season: '2026/27',
      approvedCount: 2,
      pendingCount: 1,
      alreadyAssignedCount: 0,
    });
    await expect(
      publishTemplate('tpl-draft', { assignTo: 'all' }),
    ).rejects.toMatchObject({ status: 400 });
    state.templates.find((t) => t.id === 'tpl-handbook')!.status = 'draft';
    const published = await publishTemplate('tpl-handbook', {
      assignTo: 'all',
      season: '2026/27',
    });
    expect(published).toMatchObject({ created: 1, skipped: 1 });
    expect(published.template).toMatchObject({
      status: 'live',
      assignTo: 'all',
      season: '2026/27',
    });
    await expect(
      publishTemplate('tpl-handbook', { assignTo: 'all' }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getPublishPreview('tpl-handbook', '2027/28')).season).toBe(
      '2027/28',
    );
    expect((await retireTemplate('tpl-handbook')).status).toBe('retired');
    await expect(retireTemplate('tpl-handbook')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      createAssignments({
        templateId: 'tpl-handbook',
        season: '2026/27',
        allActiveInstructors: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
    const again = await publishTemplate('tpl-handbook', {
      assignTo: 'selected',
    });
    expect(again).toMatchObject({ created: 0, skipped: 0 });
    expect(again.template.assignTo).toBe('selected');
  });

  it('blocks source and field changes once a copy is completed and ignores isActive', async () => {
    await expect(
      requestTemplateSourceUpload('tpl-conduct', 1000),
    ).rejects.toMatchObject({ status: 409 });
    await expect(confirmTemplateSource('tpl-conduct')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      saveTemplateFields('tpl-conduct', [fakeField()]),
    ).rejects.toMatchObject({ status: 409 });
    const patched = await updateTemplate('tpl-conduct', {
      isActive: false,
      required: false,
    } as never);
    expect(patched).toMatchObject({ status: 'live', required: false });
  });
});

describe('admin assignment + cert requests', () => {
  it('assigns idempotently', async () => {
    state.instructorIds = ['inst-1', 'inst-2'];
    const first = await createAssignments({
      templateId: 'tpl-conduct',
      season: '2027/28',
      allActiveInstructors: true,
    });
    expect(first).toEqual({ created: 2, skipped: 0 });
    const again = await createAssignments({
      templateId: 'tpl-conduct',
      season: '2027/28',
      instructorIds: ['inst-2'],
    });
    expect(again).toEqual({ created: 0, skipped: 1 });
  });

  it('lists, reminds, archives and links documents', async () => {
    const docs = await getInstructorDocuments('inst-1');
    const conduct = docs.assignments.find((a) => a.id === 'asg-conduct');
    expect(conduct).toMatchObject({
      hasSignedCopy: true,
      template: {
        id: 'tpl-conduct',
        kind: 'sign',
        titleEn: 'Code of conduct',
        titleZh: '行为准则',
        required: true,
      },
    });
    expect(conduct).not.toHaveProperty('signerIp');
    expect(conduct).not.toHaveProperty('fieldValues');
    expect(
      docs.certificationUploads.map((u) => [u.id, u.current, u.state]),
    ).toEqual([
      ['cu-1', true, 'pending'],
      ['cu-2', true, expect.any(String)],
      ['cu-3', true, 'expired'],
    ]);
    await remindAssignment('asg-waiver');
    expect(state.reminded).toEqual(['asg-waiver']);
    await expect(remindAssignment('asg-conduct')).rejects.toMatchObject({
      status: 409,
    });
    const archived = await archiveAssignment('asg-waiver');
    expect(archived.status).toBe('archived');
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
    expect(list.season).toBe('2026/27');
    expect(list.locked).toBe(false);
    expect(list.lockReason).toBeNull();
    expect(list.items.filter((i) => i.type === 'certification')).toHaveLength(
      2,
    );
    expect(list.items.find((i) => i.type === 'document')).toEqual({
      type: 'document',
      assignmentId: 'asg-handbook',
      templateId: 'tpl-handbook',
      kind: 'read',
      titleEn: 'Instructor handbook',
      titleZh: '教练手册',
      descriptionEn: 'Read and acknowledge.',
      descriptionZh: '阅读并确认。',
      required: true,
      status: 'completed',
      season: '2026/27',
      assignedAt: '2026-10-05T15:00:00Z',
      viewedAt: '2026-10-06T15:00:00Z',
      completedAt: '2026-10-06T15:10:00Z',
      dueAt: null,
    });
    expect(list.items.find((i) => i.type === 'certification')).toEqual({
      type: 'certification',
      org: 'csia',
      track: 'regular',
      level: 3,
      uploadId: 'cu-1',
      reviewStatus: 'pending',
      reviewNote: null,
      validUntil: '2027-06-30',
      state: 'pending',
    });
    const doc = await getMyDocument('asg-waiver');
    expect(doc.template.fields.length).toBeGreaterThan(0);
    expect(doc.assignment.status).toBe('viewed');
    expect(doc.consentText).toEqual({
      en: expect.any(String),
      zh: expect.any(String),
    });
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

  it('returns a locked preview and 403s while pending approval', async () => {
    state.meApprovalStatus = 'pending';
    const list = await getMyChecklist();
    expect(list).toMatchObject({
      season: '2026/27',
      locked: true,
      lockReason: 'pending_approval',
    });
    expect(list.items.find((i) => i.type === 'document')).toEqual({
      type: 'document',
      assignmentId: null,
      templateId: 'tpl-handbook',
      kind: 'read',
      titleEn: 'Instructor handbook',
      titleZh: '教练手册',
      descriptionEn: 'Read and acknowledge.',
      descriptionZh: '阅读并确认。',
      required: true,
      status: null,
      season: '2026/27',
      assignedAt: null,
      viewedAt: null,
      completedAt: null,
      dueAt: null,
    });
    expect(
      list.items.filter((i) => i.type === 'document').map((i) => i.templateId),
    ).toEqual(['tpl-handbook', 'tpl-conduct']);
    expect(list.items.find((i) => i.type === 'certification')).toMatchObject({
      uploadId: null,
      state: 'pending',
    });
    const forbidden = { status: 403, body: { reason: 'pending_approval' } };
    await expect(getMyDocument('asg-waiver')).rejects.toMatchObject(forbidden);
    await expect(
      completeMyDocument('asg-waiver', { acknowledged: true }),
    ).rejects.toMatchObject(forbidden);
    await expect(
      requestMyCertUpload({
        org: 'csia',
        track: 'regular',
        validUntil: '2027-12-31',
        contentType: 'image/png',
        contentLength: 1000,
      }),
    ).rejects.toMatchObject(forbidden);
    await expect(confirmMyCertUpload('cu-1')).rejects.toMatchObject(forbidden);
  });
});

describe('/me requests for a rejected instructor', () => {
  it('returns an empty rejected lock and 403s with reason rejected', async () => {
    state.meApprovalStatus = 'rejected';
    expect(await getMyChecklist()).toEqual({
      season: '2026/27',
      locked: true,
      lockReason: 'rejected',
      items: [],
    });
    const forbidden = { status: 403, body: { reason: 'rejected' } };
    await expect(getMyDocument('asg-waiver')).rejects.toMatchObject(forbidden);
    await expect(confirmMyCertUpload('cu-1')).rejects.toMatchObject(forbidden);
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
    [{ reviewStatus: 'pending', validUntil: '2026-10-20' }, 'pending'],
    [{ reviewStatus: 'pending', validUntil: '2026-10-11' }, 'expired'],
  ] as const)('%o → %s', (upload, expected) => {
    expect(certState(upload, today)).toBe(expected);
  });

  it('uses the Toronto date for today', () => {
    expect(todayIso(new Date('2026-10-13T22:00:00-04:00'))).toBe('2026-10-13');
    expect(todayIso(new Date('2026-10-14T00:30:00-04:00'))).toBe('2026-10-14');
    expect(todayIso(new Date('2027-01-15T23:30:00-05:00'))).toBe('2027-01-15');
  });

  describe('at 22:00 Toronto on 2026-10-13', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-13T22:00:00-04:00'));
    });
    afterEach(() => vi.useRealTimers());

    it('treats a cert valid until 2026-10-13 as not yet expired', () => {
      expect(todayIso()).toBe('2026-10-13');
      expect(
        certState({ reviewStatus: 'approved', validUntil: '2026-10-13' }),
      ).toBe('expiring');
      expect(
        certState({ reviewStatus: 'approved', validUntil: '2026-10-12' }),
      ).toBe('expired');
      expect(
        presentCertUploads([fakeCertUpload({ validUntil: '2026-10-13' })])[0]!
          .state,
      ).toBe('pending');
    });
  });

  it('picks the latest upload per cert', () => {
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

  it('checks fields against an offset visible box', () => {
    const t = fakeTemplate({
      pages: [{ x: 50, y: 100, width: 400, height: 500, rotate: 0 }],
    });
    const inside = { x: 50, y: 100, w: 400, h: 500 };
    expect(validateFields(t, [fakeField(inside)])).toBeNull();
    expect(validateFields(t, [fakeField({ ...inside, x: 49 })])).toMatch(
      /outside/,
    );
    expect(validateFields(t, [fakeField({ ...inside, y: 99 })])).toMatch(
      /outside/,
    );
    expect(validateFields(t, [fakeField({ ...inside, w: 401 })])).toMatch(
      /outside/,
    );
    expect(
      validateFields(t, [fakeField({ ...inside, h: 500.005 })]),
    ).toBeNull();
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
