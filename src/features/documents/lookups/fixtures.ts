import { http, HttpResponse, type HttpHandler } from 'msw';
import { MOCK_STORAGE_ORIGIN } from '../api/fixtures';
import type { Customer, CustomerWaiver } from '@/lib/types';
import { customersByIds } from '@/test/msw';
import type { SignatureCheck, Signer, StudentSignature } from './api';

export const WAIVER_YEAR = '2026/27';

export const sampleSigners: Signer[] = [
  {
    subjectType: 'instructor',
    subjectId: 'inst-1',
    customerId: null,
    name: 'Jane Snow',
    email: 'jane@example.com',
    waiver: null,
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
        validThisYear: true,
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
        validThisYear: true,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-1',
    customerId: 'cu1',
    name: 'Lily Chen',
    email: 'lily@example.com',
    waiver: {
      status: 'signed',
      signedAt: '2026-11-08T03:30:00Z',
      year: WAIVER_YEAR,
    },
    signatures: [
      {
        assignmentId: 'asg-waiver-lily',
        templateId: 'tpl-waiver-form',
        titleEn: 'Liability waiver',
        titleZh: '免责声明',
        kind: 'form',
        language: 'zh',
        formVersion: 2,
        signedAt: '2026-11-08T03:30:00Z',
        hasSignedCopy: true,
        validThisYear: true,
      },
      {
        assignmentId: 'asg-rules-lily',
        templateId: 'tpl-hill-rules',
        titleEn: 'Hill safety rules',
        titleZh: '雪场安全须知',
        kind: 'read',
        language: null,
        formVersion: null,
        signedAt: '2026-11-08T03:20:00Z',
        hasSignedCopy: false,
        validThisYear: true,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-2',
    customerId: 'cu-janet',
    name: 'Janet Park',
    email: 'janet.park@example.com',
    waiver: { status: 'none', signedAt: null, year: WAIVER_YEAR },
    signatures: [],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-3',
    customerId: 'cu-max',
    name: 'Max Müller',
    email: 'max@example.com',
    waiver: {
      status: 'expired',
      signedAt: '2026-01-10T15:00:00Z',
      year: WAIVER_YEAR,
    },
    signatures: [
      {
        assignmentId: 'asg-waiver-max',
        templateId: 'tpl-waiver-form',
        titleEn: 'Liability waiver',
        titleZh: '免责声明',
        kind: 'sign',
        language: 'en',
        formVersion: 1,
        signedAt: '2026-01-10T15:00:00Z',
        hasSignedCopy: true,
        validThisYear: false,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-4',
    customerId: 'cu-fang-work',
    name: 'Fang Wang',
    email: 'fang.w@work.example',
    waiver: {
      status: 'signed',
      signedAt: '2026-10-30T18:00:00Z',
      year: WAIVER_YEAR,
    },
    signatures: [
      {
        assignmentId: 'asg-waiver-fang',
        templateId: 'tpl-waiver-form',
        titleEn: 'Liability waiver',
        titleZh: '免责声明',
        kind: 'form',
        language: 'zh',
        formVersion: 2,
        signedAt: '2026-10-30T18:00:00Z',
        hasSignedCopy: true,
        validThisYear: true,
      },
    ],
  },
  {
    subjectType: 'customer',
    subjectId: 'cust-5',
    customerId: 'cu-wang',
    name: 'Wang Fang',
    email: 'wang.fang@example.com',
    waiver: { status: 'none', signedAt: null, year: WAIVER_YEAR },
    signatures: [],
  },
];

export const sampleCustomers: Customer[] = sampleSigners
  .filter((s) => s.customerId)
  .map((s, i) => ({
    id: s.customerId ?? '',
    shopifyCustomerId: 7100 + i,
    firstName: s.name?.split(' ')[0] ?? null,
    lastName: s.name?.split(' ').slice(1).join(' ') ?? null,
    email: s.email,
    phone: null,
    shopifyUpdatedAt: null,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    waiver: s.waiver ?? undefined,
  }));

export const deletedCustomer: Customer = {
  id: '6f1c2a4e-0d3b-4c8e-9a51-2b7d8e3f4a10',
  shopifyCustomerId: 7200,
  firstName: 'Zoë',
  lastName: 'Tremblay',
  email: 'zoe.tremblay@example.com',
  phone: null,
  shopifyUpdatedAt: '2026-10-12T00:00:00Z',
  shopifyDeletedAt: '2026-10-12T00:00:00Z',
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  waiver: {
    status: 'expired',
    signedAt: '2026-01-10T15:00:00Z',
    year: WAIVER_YEAR,
  },
};

export const contactlessCustomer: Customer = {
  id: '0b9e7d52-6a14-4f3c-8e2d-5c1a9b7f3e21',
  shopifyCustomerId: 7201,
  firstName: null,
  lastName: null,
  email: null,
  phone: null,
  shopifyUpdatedAt: '2026-10-10T00:00:00Z',
  shopifyDeletedAt: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  waiver: { status: 'none', signedAt: null, year: WAIVER_YEAR },
};

export const sampleStudents: StudentSignature[] = [
  {
    name: 'Lily Chen',
    signed: true,
    signedAt: '2026-11-08T03:30:00Z',
    status: 'signed',
  },
  { name: 'Max Müller', signed: false, signedAt: null, status: 'none' },
  {
    name: 'Wang Fang',
    signed: true,
    signedAt: '2026-10-30T18:00:00Z',
    status: 'signed',
  },
  {
    name: 'Ava Brown',
    signed: false,
    signedAt: '2026-02-01T16:00:00Z',
    status: 'expired',
  },
];

export interface LookupsMockState {
  signers: Signer[];
  customers: Customer[];
  students: StudentSignature[];
  meStatus: 'approved' | 'pending' | 'rejected' | 'deactivated' | 'none';
  signatureQueries: string[];
  studentQueries: (string | null)[];
  checkEmails: string[];
  links: { assignmentId: string; customerId: string }[];
}

export function createLookupsState(
  overrides: Partial<LookupsMockState> = {},
): LookupsMockState {
  return {
    signers: structuredClone(sampleSigners),
    customers: structuredClone([
      ...sampleCustomers,
      deletedCustomer,
      contactlessCustomer,
    ]),
    students: structuredClone(sampleStudents),
    meStatus: 'approved',
    signatureQueries: [],
    studentQueries: [],
    checkEmails: [],
    links: [],
    ...overrides,
  };
}

const includes = (value: string | null, q: string) =>
  (value ?? '').toLowerCase().includes(q.toLowerCase());

const newestFirst = (a: { signedAt: string }, b: { signedAt: string }) =>
  b.signedAt.localeCompare(a.signedAt);

const isWaiverKind = (e: { kind: string }) =>
  e.kind === 'form' || e.kind === 'sign';

function waiverOf(signatures: Signer['signatures']): CustomerWaiver {
  const signed = signatures.filter(isWaiverKind).sort(newestFirst);
  const current = signed.filter((e) => e.validThisYear !== false);
  const latest = current[0] ?? signed[0];
  return {
    status: current.length > 0 ? 'signed' : latest ? 'expired' : 'none',
    signedAt: latest?.signedAt ?? null,
    year: WAIVER_YEAR,
  };
}

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
    http.get(`${apiBase}/admin/signatures/check`, ({ request }) => {
      const email = (new URL(request.url).searchParams.get('email') ?? '')
        .trim()
        .toLowerCase();
      state.checkEmails.push(email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return HttpResponse.json(
          { message: ['email must be an email'] },
          { status: 400 },
        );
      const entries = state.signers
        .filter((s) => s.email?.toLowerCase() === email)
        .flatMap((s) => s.signatures)
        .filter(isWaiverKind);
      const waiver = waiverOf(entries);
      const result: SignatureCheck = {
        signed: waiver.status === 'signed',
        signedAt: waiver.signedAt,
        status: waiver.status,
        templateTitles: [
          ...new Set(
            entries
              .filter((e) => e.validThisYear !== false)
              .sort(newestFirst)
              .map((e) => e.titleEn),
          ),
        ],
      };
      return HttpResponse.json(result);
    }),
    http.post(
      `${apiBase}/admin/signatures/:assignmentId/link`,
      async ({ params, request }) => {
        const assignmentId = String(params.assignmentId);
        const { customerId } = (await request.json()) as {
          customerId: string;
        };
        state.links.push({ assignmentId, customerId });
        const from = state.signers.find((s) =>
          s.signatures.some((e) => e.assignmentId === assignmentId),
        );
        const entry = from?.signatures.find(
          (e) => e.assignmentId === assignmentId,
        );
        const customer = state.customers.find((c) => c.id === customerId);
        if (!from || !entry || !customer)
          return HttpResponse.json({ message: 'Not found' }, { status: 404 });
        if (from.subjectType !== 'customer')
          return HttpResponse.json(
            { message: 'Not a completed customer signature' },
            { status: 400 },
          );
        let to = state.signers.find(
          (s) => s.subjectType === 'customer' && s.customerId === customerId,
        );
        if (!to) {
          to = {
            subjectType: 'customer',
            subjectId: customerId,
            customerId,
            name: [customer.firstName, customer.lastName]
              .filter(Boolean)
              .join(' '),
            email: customer.email,
            signatures: [],
          };
          state.signers.push(to);
        }
        if (to !== from) {
          from.signatures = from.signatures.filter((e) => e !== entry);
          to.signatures = [entry, ...to.signatures].sort(newestFirst);
        }
        from.waiver = waiverOf(from.signatures);
        to.waiver = waiverOf(to.signatures);
        customer.waiver = to.waiver;
        return HttpResponse.json(to);
      },
    ),
    http.get(`${apiBase}/admin/customers`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const ids = params.get('ids');
      if (ids !== null) return customersByIds(state.customers, ids);
      const q = (params.get('q') ?? '').trim();
      return HttpResponse.json(
        state.customers.filter(
          (c) =>
            !c.shopifyDeletedAt &&
            (includes(`${c.firstName ?? ''} ${c.lastName ?? ''}`, q) ||
              includes(c.email, q)),
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
