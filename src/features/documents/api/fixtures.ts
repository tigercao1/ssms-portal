import type {
  Assignment,
  AssignmentTemplate,
  CertUpload,
  CertificationChecklistItem,
  ConsentText,
  DocumentChecklistItem,
  DocumentLanguage,
  DocumentPreviewItem,
  Field,
  MyChecklist,
  Template,
  TemplateSummary,
  TemplateTranslation,
} from './types';
import { certState, currentUploads, todayIso } from './validity';

export const MOCK_STORAGE_ORIGIN = 'https://storage.mock';
export const MOCK_SEASON = '2026/27';
export const MOCK_CONSENT_TEXT: ConsentText = {
  en: 'I agree to sign this document electronically.',
  zh: '我同意以电子方式签署本文件。',
};
const HASH = 'a3f1c9e2'.repeat(8);

export function fakeField(overrides: Partial<Field> = {}): Field {
  return {
    id: 'f_sig',
    type: 'signature',
    page: 1,
    x: 72,
    y: 120,
    w: 180,
    h: 36,
    required: true,
    labelEn: 'Signature',
    labelZh: '签名',
    prefill: null,
    ...overrides,
  };
}

export const sampleFields: Field[] = [
  fakeField({
    id: 'f_name',
    type: 'full_name',
    x: 72,
    y: 200,
    w: 200,
    h: 24,
    labelEn: 'Full name',
    labelZh: '姓名',
    prefill: 'full_name',
  }),
  fakeField({
    id: 'f_date',
    type: 'date',
    x: 340,
    y: 200,
    w: 120,
    h: 24,
    labelEn: 'Date',
    labelZh: '日期',
    prefill: 'date_signed',
  }),
  fakeField({ id: 'f_sig' }),
  fakeField({
    id: 'f_agree',
    type: 'checkbox',
    x: 72,
    y: 260,
    w: 18,
    h: 18,
    labelEn: 'I agree',
    labelZh: '我同意',
  }),
];

/** Languages with an uploaded PDF: the labelled main version, then each translation. */
export function templateLanguages(t: Template): DocumentLanguage[] {
  return [
    ...(t.sourceLanguage && t.sourceSha256 !== null ? [t.sourceLanguage] : []),
    ...t.translations
      .filter((tr) => tr.sourceSha256 !== null)
      .map((tr) => tr.language),
  ];
}

/** Recomputes the summary flags the API derives from the source and fields. */
export function withDerived(t: Template): Template {
  const translations = t.translations.map((tr) => ({
    ...tr,
    hasSource: tr.sourceSha256 !== null,
  }));
  return {
    ...t,
    translations,
    hasSource: t.sourceSha256 !== null,
    fieldCount: t.fields.length,
    languages: templateLanguages({ ...t, translations }),
  };
}

export function fakeTranslation(
  templateId: string,
  overrides: Partial<TemplateTranslation> = {},
): TemplateTranslation {
  const language = overrides.language ?? 'en';
  return {
    language,
    hasSource: true,
    sourceSha256: 'c4d5e6f7'.repeat(8),
    pageCount: 1,
    pages: [{ x: 0, y: 0, width: 612, height: 792, rotate: 0 }],
    fields: [],
    sourceUrl: `${MOCK_STORAGE_ORIGIN}/templates/${templateId}/${language}/source.pdf`,
    ...overrides,
  };
}

export function fakeTemplate(overrides: Partial<Template> = {}): Template {
  const id = overrides.id ?? 'tpl-conduct';
  return withDerived({
    id,
    kind: 'sign',
    audience: 'instructor',
    titleEn: 'Code of conduct',
    titleZh: '行为准则',
    descriptionEn: 'Sign before your first lesson.',
    descriptionZh: '首次上课前签署。',
    required: true,
    status: 'live',
    assignTo: 'all',
    season: MOCK_SEASON,
    publishedAt: '2026-10-02T15:00:00Z',
    hasCompletedAssignments: false,
    assignedCount: 0,
    completedCount: 0,
    approvedAssignedCount: 0,
    approvedCompletedCount: 0,
    approvedCount: 0,
    sortOrder: 10,
    hasSource: true,
    sourceSha256: HASH,
    pageCount: 2,
    fieldCount: 0,
    sourceLanguage: null,
    languages: [],
    translations: [],
    updatedBy: 'auth-admin',
    insertedAt: '2026-10-01T15:00:00Z',
    updatedAt: '2026-10-10T15:00:00Z',
    pages: [
      { x: 0, y: 0, width: 612, height: 792, rotate: 0 },
      { x: 0, y: 0, width: 612, height: 792, rotate: 0 },
    ],
    fields: sampleFields,
    sourceUrl: `${MOCK_STORAGE_ORIGIN}/templates/${id}/source.pdf`,
    ...overrides,
  });
}

export function toSummary(t: Template): TemplateSummary {
  return {
    id: t.id,
    kind: t.kind,
    audience: t.audience,
    titleEn: t.titleEn,
    titleZh: t.titleZh,
    descriptionEn: t.descriptionEn,
    descriptionZh: t.descriptionZh,
    required: t.required,
    status: t.status,
    assignTo: t.assignTo,
    season: t.season,
    publishedAt: t.publishedAt,
    hasCompletedAssignments: t.hasCompletedAssignments,
    assignedCount: t.assignedCount,
    completedCount: t.completedCount,
    approvedAssignedCount: t.approvedAssignedCount,
    approvedCompletedCount: t.approvedCompletedCount,
    approvedCount: t.approvedCount,
    sortOrder: t.sortOrder,
    hasSource: t.sourceSha256 !== null,
    pageCount: t.pageCount,
    fieldCount: t.fields.length,
    sourceLanguage: t.sourceLanguage,
    languages: templateLanguages(t),
    insertedAt: t.insertedAt,
    updatedAt: t.updatedAt,
  };
}

export const sampleTemplates: Template[] = [
  fakeTemplate({ hasCompletedAssignments: true }),
  fakeTemplate({
    id: 'tpl-handbook',
    hasCompletedAssignments: true,
    kind: 'read',
    titleEn: 'Instructor handbook',
    titleZh: '教练手册',
    descriptionEn: 'Read and acknowledge.',
    descriptionZh: '阅读并确认。',
    sortOrder: 5,
    pageCount: 3,
    pages: [
      { x: 0, y: 0, width: 612, height: 792, rotate: 0 },
      { x: 0, y: 0, width: 612, height: 792, rotate: 0 },
      { x: 0, y: 0, width: 792, height: 612, rotate: 0 },
    ],
    fields: [],
  }),
  fakeTemplate({
    id: 'tpl-waiver',
    titleEn: 'Liability waiver',
    titleZh: '免责声明',
    descriptionEn: null,
    descriptionZh: null,
    assignTo: 'selected',
    sortOrder: 20,
    pageCount: 1,
    pages: [{ x: 0, y: 0, width: 612, height: 792, rotate: 90 }],
    fields: [fakeField({ id: 'f_w_sig', x: 400, y: 100 })],
  }),
  fakeTemplate({
    id: 'tpl-draft',
    titleEn: 'Uniform policy',
    titleZh: null,
    descriptionEn: null,
    descriptionZh: null,
    status: 'draft',
    assignTo: null,
    season: null,
    publishedAt: null,
    required: false,
    sortOrder: 30,
    sourceSha256: null,
    pageCount: null,
    pages: [],
    fields: [],
    sourceUrl: null,
  }),
];

export function toAssignmentTemplate(t: Template): AssignmentTemplate {
  return {
    id: t.id,
    kind: t.kind,
    titleEn: t.titleEn,
    titleZh: t.titleZh,
    required: t.required,
  };
}

export function fakeAssignment(
  overrides: Partial<Assignment> = {},
): Assignment {
  const templateId = overrides.templateId ?? 'tpl-conduct';
  const template = sampleTemplates.find((t) => t.id === templateId);
  return {
    id: 'asg-1',
    templateId,
    template: template ? toAssignmentTemplate(template) : null,
    subjectType: 'instructor',
    subjectId: 'inst-1',
    season: MOCK_SEASON,
    classId: null,
    status: 'assigned',
    assignedAt: '2026-10-05T15:00:00Z',
    viewedAt: null,
    completedAt: null,
    dueAt: null,
    reminderSentAt: null,
    signerName: null,
    signerEmail: null,
    consentAt: null,
    templateSha256: null,
    signedSha256: null,
    hasSignedCopy: false,
    language: null,
    insertedAt: '2026-10-05T15:00:00Z',
    updatedAt: '2026-10-05T15:00:00Z',
    ...overrides,
  };
}

export const sampleAssignments: Assignment[] = [
  fakeAssignment({
    id: 'asg-handbook',
    templateId: 'tpl-handbook',
    status: 'completed',
    viewedAt: '2026-10-06T15:00:00Z',
    completedAt: '2026-10-06T15:10:00Z',
    signerName: 'Jane Snow',
    signerEmail: 'jane@example.com',
  }),
  fakeAssignment({
    id: 'asg-conduct',
    templateId: 'tpl-conduct',
    status: 'completed',
    viewedAt: '2026-10-07T15:00:00Z',
    completedAt: '2026-10-07T15:05:00Z',
    signerName: 'Jane Snow',
    signerEmail: 'jane@example.com',
    consentAt: '2026-10-07T15:05:00Z',
    templateSha256: HASH,
    signedSha256: 'b7e4d2a1'.repeat(8),
    hasSignedCopy: true,
  }),
  fakeAssignment({
    id: 'asg-waiver',
    templateId: 'tpl-waiver',
    status: 'viewed',
    viewedAt: '2026-10-08T15:00:00Z',
    reminderSentAt: '2026-10-09T12:00:00Z',
  }),
];

export function fakeCertUpload(
  overrides: Partial<CertUpload> = {},
): CertUpload {
  return {
    id: 'cu-1',
    instructorId: 'inst-1',
    org: 'csia',
    track: 'regular',
    sha256: 'c0ffee00'.repeat(8),
    contentType: 'application/pdf',
    sizeBytes: 482_113,
    reviewStatus: 'pending',
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    validUntil: '2027-06-30',
    current: true,
    state: 'pending',
    aiResult: null,
    aiModel: null,
    aiCheckedAt: null,
    insertedAt: '2026-10-08T15:00:00Z',
    updatedAt: '2026-10-08T15:00:00Z',
    ...overrides,
  };
}

export const sampleCertUploads: CertUpload[] = [
  fakeCertUpload(),
  fakeCertUpload({
    id: 'cu-2',
    org: 'casi',
    track: 'park',
    contentType: 'image/jpeg',
    sizeBytes: 1_204_551,
    reviewStatus: 'approved',
    reviewedAt: '2026-09-01T15:00:00Z',
    validUntil: '2026-10-31',
    state: 'expiring',
    insertedAt: '2026-09-01T12:00:00Z',
  }),
  fakeCertUpload({
    id: 'cu-3',
    org: 'csia',
    track: 'park',
    reviewStatus: 'approved',
    reviewedAt: '2025-11-01T15:00:00Z',
    validUntil: '2026-06-30',
    state: 'expired',
    insertedAt: '2025-11-01T12:00:00Z',
  }),
];

/** Uploads newest first, with `current` and `state` set as the API presents them. */
export function presentCertUploads(
  uploads: CertUpload[],
  today: string = todayIso(),
): CertUpload[] {
  const currentIds = new Set(currentUploads(uploads).map((u) => u.id));
  return [...uploads]
    .sort((a, b) => b.insertedAt.localeCompare(a.insertedAt))
    .map((u) => ({
      ...u,
      current: currentIds.has(u.id),
      state: certState(u, today),
    }));
}

/** Builds a `/me/documents` checklist from templates, assignments and uploads. */
export function buildChecklist(
  templates: Template[],
  assignments: Assignment[],
  certs: {
    org: CertUpload['org'];
    track: CertUpload['track'];
    level: number;
  }[],
  uploads: CertUpload[],
  season: string | null = MOCK_SEASON,
  today: string = todayIso(),
): MyChecklist {
  const docs: DocumentChecklistItem[] = assignments
    .filter((a) => a.status !== 'archived')
    .flatMap((a) => {
      const t = templates.find((x) => x.id === a.templateId);
      if (!t) return [];
      return [
        {
          type: 'document' as const,
          assignmentId: a.id,
          templateId: t.id,
          kind: t.kind,
          titleEn: t.titleEn,
          titleZh: t.titleZh,
          descriptionEn: t.descriptionEn,
          descriptionZh: t.descriptionZh,
          required: t.required,
          status: a.status,
          season: a.season,
          assignedAt: a.assignedAt,
          viewedAt: a.viewedAt,
          completedAt: a.completedAt,
          dueAt: a.dueAt,
          languages: templateLanguages(t),
        },
      ];
    });
  const current = currentUploads(uploads);
  const certItems: CertificationChecklistItem[] = certs.map((c) => {
    const upload =
      current.find((u) => u.org === c.org && u.track === c.track) ?? null;
    return {
      type: 'certification',
      org: c.org,
      track: c.track,
      level: c.level,
      uploadId: upload?.id ?? null,
      reviewStatus: upload?.reviewStatus ?? null,
      reviewNote: upload?.reviewNote ?? null,
      validUntil: upload?.validUntil ?? null,
      state: certState(upload, today),
    };
  });
  return {
    season,
    locked: false,
    lockReason: null,
    items: [...docs, ...certItems],
  };
}

/** The locked `/me/documents` preview a pending instructor gets. */
export function buildPreviewChecklist(
  templates: Template[],
  certs: {
    org: CertUpload['org'];
    track: CertUpload['track'];
    level: number;
  }[],
  uploads: CertUpload[],
  season: string | null = MOCK_SEASON,
  today: string = todayIso(),
): MyChecklist {
  const docs: DocumentPreviewItem[] = templates
    .filter(
      (t) =>
        t.status === 'live' &&
        t.assignTo === 'all' &&
        t.audience === 'instructor' &&
        t.season === season,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((t) => ({
      type: 'document',
      assignmentId: null,
      templateId: t.id,
      kind: t.kind,
      titleEn: t.titleEn,
      titleZh: t.titleZh,
      descriptionEn: t.descriptionEn,
      descriptionZh: t.descriptionZh,
      required: t.required,
      status: null,
      season,
      assignedAt: null,
      viewedAt: null,
      completedAt: null,
      dueAt: null,
      languages: templateLanguages(t),
    }));
  const certItems = buildChecklist(
    [],
    [],
    certs,
    uploads,
    season,
    today,
  ).items.map((c) => ({ ...c, uploadId: null }));
  return {
    season,
    locked: true,
    lockReason: 'pending_approval',
    items: [...docs, ...certItems],
  };
}
