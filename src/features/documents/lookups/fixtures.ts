import { http, HttpResponse, type HttpHandler } from 'msw';
import { MOCK_STORAGE_ORIGIN } from '../api/fixtures';
import type { Signer, StudentSignature } from './api';

export const sampleSigners: Signer[] = [
  {
    subjectType: 'instructor',
    subjectId: 'inst-1',
    name: 'Jane Snow',
    email: 'jane@example.com',
    signatures: [
      {
        assignmentId: 'asg-conduct',
        templateId: 'tpl-conduct',
        titleEn: 'Code of conduct',
        titleZh: '行为准则',
        kind: 'sign',
        language: 'en',
        formVersion: null,
        signedAt: '2026-10-07T15:05:00Z',
        hasSignedCopy: true,
      },
      {
        assignmentId: 'asg-handbook',
        templateId: 'tpl-handbook',
        titleEn: 'Instructor handbook',
        titleZh: '教练手册',
        kind: 'read',
        language: null,
        formVersion: null,
        signedAt: '2026-10-06T15:10:00Z',
        hasSignedCopy: false,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-1',
    name: 'Lily Chen',
    email: 'lily@example.com',
    signatures: [
      {
        assignmentId: 'asg-waiver-lily',
        templateId: 'tpl-waiver-form',
        titleEn: 'Liability waiver',
        titleZh: '免责声明',
        kind: 'sign',
        language: 'zh',
        formVersion: 2,
        signedAt: '2026-11-08T03:30:00Z',
        hasSignedCopy: true,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-2',
    name: 'Janet Park',
    email: 'janet.park@example.com',
    signatures: [],
  },
];

export const sampleStudents: StudentSignature[] = [
  { name: 'Lily Chen', signed: true, signedAt: '2026-11-08T03:30:00Z' },
  { name: 'Max Müller', signed: false, signedAt: null },
  { name: 'Wang Fang', signed: true, signedAt: '2026-10-30T18:00:00Z' },
];

export interface LookupsMockState {
  signers: Signer[];
  students: StudentSignature[];
  meStatus: 'approved' | 'pending' | 'rejected' | 'deactivated' | 'none';
  signatureQueries: string[];
  studentQueries: (string | null)[];
}

export function createLookupsState(
  overrides: Partial<LookupsMockState> = {},
): LookupsMockState {
  return {
    signers: structuredClone(sampleSigners),
    students: structuredClone(sampleStudents),
    meStatus: 'approved',
    signatureQueries: [],
    studentQueries: [],
    ...overrides,
  };
}

const includes = (value: string | null, q: string) =>
  (value ?? '').toLowerCase().includes(q.toLowerCase());

export function lookupsHandlers(
  state: LookupsMockState = createLookupsState(),
  apiBase = 'http://localhost:3000',
): HttpHandler[] {
  return [
    http.get(`${apiBase}/admin/signatures`, ({ request }) => {
      const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
      state.signatureQueries.push(q);
      if (q.length < 2)
        return HttpResponse.json(
          { message: 'q must be longer than or equal to 2 characters' },
          { status: 400 },
        );
      return HttpResponse.json(
        state.signers.filter(
          (s) => includes(s.name, q) || includes(s.email, q),
        ),
      );
    }),
    http.get(`${apiBase}/me/students/signatures`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      state.studentQueries.push(q);
      if (state.meStatus === 'none')
        return HttpResponse.json({ message: 'Not found' }, { status: 404 });
      if (state.meStatus !== 'approved')
        return HttpResponse.json(
          {
            message: 'Your profile is not approved',
            reason:
              state.meStatus === 'pending'
                ? 'pending_approval'
                : state.meStatus,
          },
          { status: 403 },
        );
      return HttpResponse.json(
        state.students.filter((s) => !q || includes(s.name, q)),
      );
    }),
    http.get(
      `${apiBase}/admin/documents/assignments/:id/signed-url`,
      ({ params }) => {
        const entry = state.signers
          .flatMap((s) => s.signatures)
          .find((e) => e.assignmentId === params.id && e.hasSignedCopy);
        if (!entry) return undefined;
        return HttpResponse.json({
          url: `${MOCK_STORAGE_ORIGIN}/signed/${entry.assignmentId}.pdf?sig=mock`,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
          sha256: 'b7e4d2a1'.repeat(8),
        });
      },
    ),
  ];
}
