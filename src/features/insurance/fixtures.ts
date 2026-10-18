import { http, HttpResponse } from 'msw';
import { CAP_CENTS, listCents } from './money';
import type {
  AdminInsuranceRecord,
  AdminInsuranceSummary,
  InsuranceRecord,
  MyInsurance,
  RegisterLessonBody,
} from './types';

const API = 'http://localhost:3000';

export const SEASON_2026 = {
  key: '2026/27',
  startsOn: '2026-11-01',
  endsOn: '2027-04-30',
};

export function insuranceRecord(
  overrides: Partial<InsuranceRecord> = {},
): InsuranceRecord {
  return {
    id: 'rec-1',
    recordNo: 'INS-20261212-0001',
    kind: 'lesson',
    seasonKey: SEASON_2026.key,
    lessonDate: '2026-12-12',
    durationHours: 2,
    locationId: 'l1',
    locationName: 'Whistler',
    locationOther: null,
    students: [
      { name: 'Wei Zhang', waiverConfirmed: true },
      { name: 'Amy Li', waiverConfirmed: true },
    ],
    studentCount: 2,
    listCents: 4000,
    amountCents: 4000,
    coverage: 'per_lesson',
    paymentStatus: 'paid',
    paidOn: '2026-12-13',
    createdAt: '2026-12-11T15:30:00Z',
    ...overrides,
  };
}

export function myInsurance(overrides: Partial<MyInsurance> = {}): MyInsurance {
  return {
    locked: false,
    lockReason: null,
    season: SEASON_2026,
    capCents: CAP_CENTS,
    owedCents: 0,
    paidCents: 0,
    unpaidCents: 0,
    coverage: 'none',
    records: [],
    ...overrides,
  };
}

export const historyRecords: InsuranceRecord[] = [
  insuranceRecord({
    id: 'rec-3',
    recordNo: 'INS-20261219-0002',
    lessonDate: '2026-12-19',
    durationHours: 1,
    students: [{ name: 'Leo Chen', waiverConfirmed: true }],
    studentCount: 1,
    listCents: 1000,
    amountCents: 1000,
    paymentStatus: 'unpaid',
    paidOn: null,
    createdAt: '2026-12-18T20:05:00Z',
  }),
  insuranceRecord(),
  insuranceRecord({
    id: 'rec-2',
    recordNo: 'INS-20261205-0001',
    lessonDate: '2026-12-05',
    durationHours: 1,
    locationId: null,
    locationName: null,
    locationOther: 'Mont Tremblant',
    students: [{ name: 'Sam Park', waiverConfirmed: true }],
    studentCount: 1,
    listCents: 1000,
    amountCents: 1000,
    paymentStatus: 'voided',
    paidOn: null,
    createdAt: '2026-12-04T18:00:00Z',
  }),
];

export const withHistory = myInsurance({
  owedCents: 5000,
  paidCents: 4000,
  unpaidCents: 1000,
  records: historyRecords,
});

export const onboardingInsurance = myInsurance({
  locked: true,
  lockReason: 'onboarding_incomplete',
});

export const SEASON_2025 = {
  key: '2025/26',
  startsOn: '2025-11-01',
  endsOn: '2026-04-30',
};

export interface InsuranceMockState {
  data: MyInsurance;
  otherSeasons: Record<string, MyInsurance>;
  seasonGets: string[];
  posts: RegisterLessonBody[];
  nextNo: number;
}

export function createInsuranceState(
  data: MyInsurance,
  otherSeasons: MyInsurance[] = [],
): InsuranceMockState {
  return {
    data: structuredClone(data),
    otherSeasons: Object.fromEntries(
      otherSeasons.map((o) => [o.season!.key, structuredClone(o)]),
    ),
    seasonGets: [],
    posts: [],
    nextNo: 1,
  };
}

function overviewFor(state: InsuranceMockState, lessonDate: string) {
  return (
    Object.values(state.otherSeasons).find(
      (o) =>
        o.season &&
        lessonDate >= o.season.startsOn &&
        lessonDate <= o.season.endsOn,
    ) ?? state.data
  );
}

function addRecord(d: MyInsurance, record: InsuranceRecord) {
  d.records = [record, ...d.records];
  d.owedCents += record.amountCents;
  if (record.paymentStatus === 'unpaid') d.unpaidCents += record.amountCents;
  if (d.owedCents >= d.capCents)
    d.coverage = d.coverage === 'season_pass' ? 'season_pass' : 'capped';
}

function recordNo(state: InsuranceMockState) {
  return `INS-20261015-${String(state.nextNo++).padStart(4, '0')}`;
}

export function insuranceHandlers(state: InsuranceMockState) {
  return [
    http.get(`${API}/me/insurance`, ({ request }) => {
      const season = new URL(request.url).searchParams.get('season');
      if (!season || season === state.data.season?.key)
        return HttpResponse.json(state.data);
      state.seasonGets.push(season);
      return HttpResponse.json(
        state.otherSeasons[season] ??
          myInsurance({ season: { ...SEASON_2026, key: season } }),
      );
    }),
    http.post(`${API}/me/insurance/records`, async ({ request }) => {
      const body = (await request.json()) as RegisterLessonBody;
      state.posts.push(body);
      if (state.data.locked)
        return HttpResponse.json(
          { message: 'Forbidden', reason: state.data.lockReason },
          { status: 403 },
        );
      const d = overviewFor(state, body.lessonDate);
      const list = listCents(body.durationHours, body.students.length);
      const base = {
        id: `new-${state.nextNo}`,
        kind: 'lesson' as const,
        seasonKey: d.season?.key ?? '',
        lessonDate: body.lessonDate,
        durationHours: body.durationHours,
        locationId: body.locationId ?? null,
        locationName: body.locationId ? 'Whistler' : null,
        locationOther: body.locationOther ?? null,
        students: body.students,
        studentCount: body.students.length,
        listCents: list,
        paidOn: null,
        createdAt: '2026-10-15T14:00:00Z',
      };
      let record: InsuranceRecord;
      if (d.owedCents >= d.capCents) {
        record = {
          ...base,
          recordNo: recordNo(state),
          amountCents: 0,
          coverage: d.coverage === 'season_pass' ? 'season_pass' : 'capped',
          paymentStatus: 'not_required',
        };
      } else if (d.owedCents + list >= d.capCents) {
        record = {
          ...base,
          recordNo: recordNo(state),
          amountCents: d.capCents - d.owedCents,
          coverage: 'cap_top_up',
          paymentStatus: 'unpaid',
        };
      } else {
        record = {
          ...base,
          recordNo: recordNo(state),
          amountCents: list,
          coverage: 'per_lesson',
          paymentStatus: 'unpaid',
        };
      }
      addRecord(d, record);
      return HttpResponse.json(record, { status: 201 });
    }),
  ];
}

export function adminRecord(
  overrides: Partial<AdminInsuranceRecord> = {},
): AdminInsuranceRecord {
  return {
    ...insuranceRecord(),
    instructorId: 'inst-1',
    instructorName: 'Jane Snow',
    instructorNameZh: '简雪',
    instructorEmail: 'jane@example.com',
    paidNote: null,
    voidedAt: null,
    voidedReason: null,
    voidedFromStatus: null,
    ...overrides,
  };
}

export const adminSummary: AdminInsuranceSummary[] = [
  {
    instructorId: 'inst-1',
    name: 'Jane Snow',
    nameZh: '简雪',
    email: 'jane@example.com',
    owedCents: 38000,
    paidCents: 30000,
    unpaidCents: 8000,
    coverage: 'none',
    records: 14,
    seasonPassRecordId: null,
    seasonPassPaymentStatus: null,
  },
  {
    instructorId: 'inst-2',
    name: 'Li Wei',
    nameZh: null,
    email: 'li@example.com',
    owedCents: 40000,
    paidCents: 40000,
    unpaidCents: 0,
    coverage: 'season_pass',
    records: 3,
    seasonPassRecordId: 'a-3',
    seasonPassPaymentStatus: 'paid',
  },
];

export const adminRecords: AdminInsuranceRecord[] = [
  adminRecord({
    id: 'a-1',
    recordNo: 'INS-20261219-0002',
    lessonDate: '2026-12-19',
    paymentStatus: 'unpaid',
    paidOn: null,
  }),
  adminRecord({
    id: 'a-2',
    recordNo: 'INS-20261212-0001',
    paidNote: 'e-transfer #8812',
  }),
  adminRecord({
    id: 'a-3',
    recordNo: 'INS-20261101-0001',
    instructorId: 'inst-2',
    instructorName: 'Li Wei',
    instructorNameZh: null,
    instructorEmail: 'li@example.com',
    kind: 'season_pass',
    lessonDate: null,
    durationHours: null,
    students: [],
    studentCount: null,
    listCents: 40000,
    amountCents: 40000,
    coverage: null,
    createdAt: '2026-11-01T16:00:00Z',
  }),
  adminRecord({
    id: 'a-4',
    recordNo: 'INS-20261120-0003',
    lessonDate: '2026-11-20',
    paymentStatus: 'voided',
    paidOn: null,
    voidedAt: '2026-11-21T12:00:00Z',
    voidedReason: 'Duplicate registration',
    voidedFromStatus: 'unpaid',
  }),
];
