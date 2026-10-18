import { http, HttpResponse } from 'msw';
import { CAP_CENTS, priceLessons } from './money';
import type {
  AdminInsuranceRecord,
  AdminInsuranceRequest,
  AdminInsuranceSummary,
  InsurancePaymentStatus,
  InsuranceRecord,
  InsuranceRequest,
  MyInsurance,
  RequestLessonBody,
  SubmitRequestBody,
} from './types';

const API = 'http://localhost:3000';

export const SEASON_2025 = {
  key: '2025/26',
  startsOn: '2025-11-01',
  endsOn: '2026-04-30',
};

export const SEASON_2026 = {
  key: '2026/27',
  startsOn: '2026-11-01',
  endsOn: '2027-04-30',
};

export const SEASON_2027 = {
  key: '2027/28',
  startsOn: '2027-11-01',
  endsOn: '2028-04-30',
};

export const SEASONS = [SEASON_2027, SEASON_2026, SEASON_2025];

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
    requests: [],
    ...overrides,
  };
}

export const LOCATIONS = [
  { id: 'l1', key: 'loc.msl', name: 'Mount St. Louis Moonstone', nameZh: null },
  { id: 'l2', key: 'loc.blue', name: 'Blue Mountain', nameZh: null },
  { id: 'l3', key: 'loc.horseshoe', name: 'Horseshoe Resort', nameZh: null },
];

function locationName(id: string | undefined) {
  return LOCATIONS.find((l) => l.id === id)?.name ?? null;
}

function lessonRecord(
  requestId: string,
  index: number,
  body: RequestLessonBody,
  price: { listCents: number; amountCents: number },
  paymentStatus: InsurancePaymentStatus,
  covered: 'season_pass' | null,
  createdAt: string,
  seasonKey: string,
): InsuranceRecord {
  return {
    id: `${requestId}-l${index + 1}`,
    recordNo: `${requestId}-l${index + 1}`,
    kind: 'lesson',
    seasonKey,
    lessonDate: body.lessonDate,
    durationHours: body.durationHours,
    locationId: body.locationId ?? null,
    locationName: locationName(body.locationId),
    locationOther: body.locationOther ?? null,
    students: body.students,
    studentCount: body.students.length,
    listCents: price.listCents,
    amountCents: price.amountCents,
    coverage: covered
      ? covered
      : price.amountCents === price.listCents
        ? 'per_lesson'
        : price.amountCents > 0
          ? 'cap_top_up'
          : 'capped',
    paymentStatus:
      paymentStatus === 'voided' || price.amountCents > 0
        ? paymentStatus
        : 'not_required',
    paidOn: null,
    createdAt,
  };
}

export function buildRequest(
  {
    id,
    requestNo,
    createdAt,
    paymentStatus,
    owedCents = 0,
    seasonPass = false,
    seasonKey = SEASON_2026.key,
  }: {
    id: string;
    requestNo: string;
    createdAt: string;
    paymentStatus?: InsurancePaymentStatus;
    owedCents?: number;
    seasonPass?: boolean;
    seasonKey?: string;
  },
  lessons: RequestLessonBody[],
): InsuranceRequest {
  const priced = priceLessons(
    lessons.map((l) => ({
      durationHours: l.durationHours,
      studentCount: l.students.length,
    })),
    { owedCents, capCents: CAP_CENTS, seasonPass },
  );
  const totalCents = priced.reduce((sum, p) => sum + p.amountCents, 0);
  const status = paymentStatus ?? (totalCents > 0 ? 'unpaid' : 'not_required');
  return {
    id,
    requestNo,
    seasonKey,
    paymentStatus: status,
    totalCents,
    lessonCount: lessons.length,
    studentCount: lessons.reduce((sum, l) => sum + l.students.length, 0),
    createdAt,
    paidOn: status === 'paid' ? createdAt.slice(0, 10) : null,
    lessons: lessons.map((l, i) =>
      lessonRecord(
        id,
        i,
        l,
        priced[i]!,
        status,
        seasonPass ? 'season_pass' : null,
        createdAt,
        seasonKey,
      ),
    ),
  };
}

const signed = (names: string[]) =>
  names.map((name) => ({ name, waiverConfirmed: true }));
const FAMILY = ['Kevin Xu', 'Amy Xu', 'Daniel Wu', 'Sophie Wu'];
const GROUP = ['Emma Liu', 'Jason Wang', 'Chloe Zhang', 'Ryan Chen'];

export const paidRequest = buildRequest(
  {
    id: 'req-1',
    requestNo: 'INS-20261006-0004',
    createdAt: '2026-10-06T15:00:00Z',
    paymentStatus: 'paid',
  },
  [
    {
      lessonDate: '2026-12-12',
      durationHours: 2,
      locationId: 'l1',
      students: signed(FAMILY),
    },
    {
      lessonDate: '2026-12-13',
      durationHours: 2,
      locationId: 'l1',
      students: signed([...FAMILY, 'Lucas He']),
    },
  ],
);

export const unpaidRequest = buildRequest(
  {
    id: 'req-2',
    requestNo: 'INS-20261014-0011',
    createdAt: '2026-10-14T15:00:00Z',
    owedCents: paidRequest.totalCents,
  },
  [
    {
      lessonDate: '2026-12-19',
      durationHours: 2,
      locationId: 'l2',
      students: signed(GROUP),
    },
    {
      lessonDate: '2026-12-20',
      durationHours: 2,
      locationId: 'l2',
      students: signed(GROUP),
    },
    {
      lessonDate: '2026-12-27',
      durationHours: 1,
      locationId: 'l3',
      students: signed(['Olivia Zhao', 'Ethan Li', 'Mia Sun']),
    },
  ],
);

export const withRequests = myInsurance({
  owedCents: 35000,
  paidCents: 16000,
  unpaidCents: 19000,
  requests: [unpaidRequest, paidRequest],
});

export const onboardingInsurance = myInsurance({
  locked: true,
  lockReason: 'onboarding_incomplete',
});

export interface InsuranceMockState {
  data: MyInsurance;
  seasons: Record<string, MyInsurance>;
  seasonQueries: string[];
  posts: SubmitRequestBody[];
  byKey: Record<string, InsuranceRequest>;
  nextNo: number;
}

export function createInsuranceState(
  data: MyInsurance,
  seasons: Record<string, MyInsurance> = {},
): InsuranceMockState {
  return {
    data: structuredClone(data),
    seasons: structuredClone(seasons),
    seasonQueries: [],
    posts: [],
    byKey: {},
    nextNo: 12,
  };
}

function seasonData(state: InsuranceMockState, key: string): MyInsurance {
  if (state.data.season?.key === key) return state.data;
  const season = SEASONS.find((x) => x.key === key)!;
  state.seasons[key] ??= myInsurance({
    locked: state.data.locked,
    lockReason: state.data.lockReason,
    season,
  });
  return state.seasons[key];
}

export function insuranceHandlers(state: InsuranceMockState) {
  return [
    http.get(`${API}/me/insurance`, ({ request }) => {
      const key = new URL(request.url).searchParams.get('season');
      if (!key) return HttpResponse.json(state.data);
      state.seasonQueries.push(key);
      if (!SEASONS.some((x) => x.key === key))
        return HttpResponse.json({ code: 'unknown_season' }, { status: 400 });
      return HttpResponse.json(seasonData(state, key));
    }),
    http.post(`${API}/me/insurance/requests`, async ({ request }) => {
      const body = (await request.json()) as SubmitRequestBody;
      state.posts.push(body);
      if (state.data.locked)
        return HttpResponse.json({ code: 'locked' }, { status: 403 });
      const repeat = state.byKey[body.idempotencyKey];
      if (repeat) return HttpResponse.json(repeat, { status: 200 });
      if (body.lessons.length < 1 || body.lessons.length > 10)
        return HttpResponse.json(
          { code: 'too_many_lessons', maxLessons: 10 },
          { status: 400 },
        );
      const unconfirmed = body.lessons.flatMap((l, lessonIndex) =>
        l.students.flatMap((s, studentIndex) =>
          s.waiverConfirmed ? [] : [{ lessonIndex, studentIndex }],
        ),
      );
      if (unconfirmed.length > 0)
        return HttpResponse.json(
          { code: 'waiver_unconfirmed', indexes: unconfirmed },
          { status: 400 },
        );
      const conflict = body.lessons.findIndex(
        (l) => l.locationId && l.locationOther,
      );
      if (conflict >= 0)
        return HttpResponse.json(
          { code: 'location_conflict', lessonIndex: conflict },
          { status: 400 },
        );
      const lessonSeasons = body.lessons.map((l) =>
        SEASONS.find(
          (x) => l.lessonDate >= x.startsOn && l.lessonDate <= x.endsOn,
        ),
      );
      const outside = lessonSeasons.findIndex((x) => !x);
      if (outside >= 0)
        return HttpResponse.json(
          { code: 'no_season', lessonIndex: outside },
          { status: 400 },
        );
      const seasonKey = lessonSeasons[0]!.key;
      const mixed = lessonSeasons.findIndex((x) => x!.key !== seasonKey);
      if (mixed >= 0)
        return HttpResponse.json(
          { code: 'mixed_seasons', lessonIndex: mixed, seasonKey },
          { status: 400 },
        );
      const d = seasonData(state, seasonKey);
      const no = String(state.nextNo++).padStart(4, '0');
      const created = buildRequest(
        {
          id: `req-new-${no}`,
          requestNo: `INS-20261018-${no}`,
          createdAt: '2026-10-18T15:30:00Z',
          owedCents: d.owedCents,
          seasonPass: d.coverage === 'season_pass',
          seasonKey,
        },
        body.lessons,
      );
      state.byKey[body.idempotencyKey] = created;
      d.requests = [created, ...d.requests];
      if (d.coverage !== 'season_pass') {
        d.owedCents += created.totalCents;
        d.unpaidCents += created.totalCents;
        if (d.owedCents >= d.capCents) d.coverage = 'capped';
      }
      return HttpResponse.json(created, { status: 201 });
    }),
  ];
}

export function adminRequest(
  request: InsuranceRequest,
  overrides: Partial<AdminInsuranceRequest> = {},
): AdminInsuranceRequest {
  return {
    ...structuredClone(request),
    instructorId: 'inst-1',
    instructorName: 'Jane Snow',
    instructorNameZh: '简雪',
    instructorEmail: 'jane@example.com',
    paidNote: null,
    voidedAt: null,
    voidedReason: null,
    ...overrides,
  };
}

export const adminRequests: AdminInsuranceRequest[] = [
  adminRequest(unpaidRequest),
  adminRequest(paidRequest, { paidNote: 'e-transfer #8812' }),
];

export interface AdminRequestsState {
  requests: AdminInsuranceRequest[];
  queries: URLSearchParams[];
  actions: { id: string; action: string; body: unknown }[];
}

export function createAdminRequestsState(
  requests: AdminInsuranceRequest[] = adminRequests,
): AdminRequestsState {
  return { requests: structuredClone(requests), queries: [], actions: [] };
}

export function adminRequestHandlers(state: AdminRequestsState) {
  return [
    http.get(`${API}/admin/insurance/requests`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      state.queries.push(params);
      const rows = state.requests.filter(
        (r) =>
          (!params.get('instructorId') ||
            r.instructorId === params.get('instructorId')) &&
          (!params.get('paymentStatus') ||
            r.paymentStatus === params.get('paymentStatus')),
      );
      return HttpResponse.json({ requests: rows, total: rows.length });
    }),
    http.post(
      `${API}/admin/insurance/requests/:id/:action`,
      async ({ request, params }) => {
        const id = String(params.id);
        const action = String(params.action);
        const body = (await request.json()) as {
          paidOn?: string;
          note?: string;
          reason?: string;
        };
        state.actions.push({ id, action, body });
        const r = state.requests.find((x) => x.id === id);
        if (!r)
          return HttpResponse.json({ code: 'not_found' }, { status: 404 });
        const status: InsurancePaymentStatus =
          action === 'mark-paid'
            ? 'paid'
            : action === 'mark-unpaid'
              ? 'unpaid'
              : 'voided';
        r.paymentStatus = status;
        r.paidOn = status === 'paid' ? (body.paidOn ?? null) : null;
        r.paidNote = status === 'paid' ? (body.note ?? null) : null;
        if (status === 'voided') {
          r.voidedAt = '2026-10-18T16:00:00Z';
          r.voidedReason = body.reason ?? null;
        }
        r.lessons = r.lessons.map((l) => ({
          ...l,
          paymentStatus:
            l.amountCents > 0 || status === 'voided' ? status : l.paymentStatus,
          paidOn: r.paidOn,
        }));
        return HttpResponse.json(r);
      },
    ),
  ];
}

export function adminRecord(
  overrides: Partial<AdminInsuranceRecord> = {},
): AdminInsuranceRecord {
  return {
    ...insuranceRecord(),
    requestId: null,
    requestNo: null,
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
