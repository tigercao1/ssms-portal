import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type {
  AdminClass,
  AdminInstructorRecord,
  Customer,
  GoogleCalendar,
  GoogleConnectionStatus,
  InstructorProfile,
  LessonType,
  PayRate,
  PublicPage,
  RefItem,
  ShopifyInstructorSync,
  ShopifySyncStatus,
} from '@/lib/types';

const API = 'http://localhost:3000';

export const fakeProfile: InstructorProfile = {
  id: 'inst-1',
  email: 'jane@example.com',
  displayNameEn: 'Jane Snow',
  displayNameZh: '简雪',
  bioEn: 'Veteran instructor.',
  bioZh: null,
  bioEnMachineTranslated: false,
  bioZhMachineTranslated: false,
  dateOfBirth: null,
  preferredLanguage: 'en',
  approvalStatus: 'pending',
  isActive: true,
  profilePhotoUrl: null,
  minStudentAge: 5,
  teachingLocations: [{ id: 'l1', key: 'loc.whistler', name: 'Whistler' }],
  languages: [{ id: 'la1', key: 'lang.en', name: 'English' }],
  courseLevelsOffered: [],
  certifications: [
    {
      org: 'csia',
      track: 'regular',
      level: 4,
      isPartial: false,
      partialComponents: [],
      achievedOn: '2020-01-01',
      display: 'CSIA Level 4',
    },
  ],
  trainerStatus: [],
};

export const fakeAdminList: AdminInstructorRecord[] = [
  {
    id: 'inst-1',
    authUserId: 'auth-1',
    email: 'jane@example.com',
    displayNameEn: 'Jane Snow',
    displayNameZh: null,
    bioEn: null,
    bioZh: null,
    dateOfBirth: null,
    profilePhotoUrl: null,
    preferredLanguage: 'en',
    approvalStatus: 'pending',
    isActive: true,
    insertedAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

export const fakeShopifySyncStatus: ShopifySyncStatus = {
  enabled: false,
  masterSwitch: true,
  configured: true,
  lastTickAt: '2026-10-10T03:00:00Z',
  lastSuccessAt: '2026-10-10T02:55:00Z',
  lastError: null,
  lastErrorAt: null,
  queue: { pending: 3, retrying: 1, oldestEnqueuedAt: '2026-10-10T02:00:00Z' },
  entries: { synced: 12, active: 9, draft: 3, failed: 2 },
  storefrontPreviewBaseUrl: 'https://ssnow.club/pages/our-team-preview/',
};

export const fakeShopifyInstructorSync: ShopifyInstructorSync = {
  handle: 'jane-snow',
  metaobjectId: 'gid://shopify/Metaobject/1',
  status: 'active',
  lastSyncedAt: '2026-10-10T02:55:00Z',
  lastError: null,
  queued: false,
  attempts: 0,
  previewUrl: 'https://ssnow.club/pages/our-team-preview/jane-snow',
};

export const fakeGoogleStatus: GoogleConnectionStatus = {
  configured: true,
  connected: true,
  accountEmail: 'admin@ssnow.club',
  scopes: [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.events.freebusy',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  ],
  connectedAt: '2026-10-10T15:00:00Z',
  lastError: null,
};

export const fakeGoogleCalendars: GoogleCalendar[] = [
  {
    id: 'admin@ssnow.club',
    summary: 'SSNOW Admin',
    accessRole: 'owner',
    canWrite: true,
  },
  {
    id: 'jane.snow@ssnow.club',
    summary: 'Jane Snow',
    accessRole: 'writer',
    canWrite: true,
  },
  {
    id: 'li.wei@gmail.com',
    summary: 'Li Wei',
    accessRole: 'reader',
    canWrite: false,
  },
  {
    id: 'sam.ski@gmail.com',
    summary: 'Sam Ski',
    accessRole: 'freeBusyReader',
    canWrite: false,
  },
];

export function fakePage(overrides: Partial<PublicPage> = {}): PublicPage {
  const slug = overrides.slug ?? 'winter-guide';
  return {
    id: 'p1',
    slug,
    title: 'Winter guide',
    status: 'draft',
    hasContent: false,
    sizeBytes: null,
    hasUnpublishedChanges: false,
    url: `https://docs.ssnow.club/${slug}`,
    publishedAt: null,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-02T10:00:00Z',
    ...overrides,
  };
}

export function fakeLessonType(
  overrides: Partial<LessonType> = {},
): LessonType {
  return {
    id: 'lt1',
    nameEn: 'Private 2h',
    nameZh: '1对1滑雪课 - 2小时',
    groupSize: 1,
    durationMin: 120,
    isPromo: false,
    active: true,
    sortOrder: 0,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function fakePayRate(overrides: Partial<PayRate> = {}): PayRate {
  return {
    id: 'pr1',
    lessonTypeId: 'lt1',
    instructorId: null,
    hourlyRate: 45,
    currency: 'CAD',
    effectiveFrom: '2026-11-01',
    effectiveTo: null,
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function fakeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cu1',
    shopifyCustomerId: 7001,
    firstName: 'Lily',
    lastName: 'Chen',
    email: 'lily@example.com',
    phone: '+16475550100',
    shopifyUpdatedAt: '2026-10-10T00:00:00Z',
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function fakeClass(overrides: Partial<AdminClass> = {}): AdminClass {
  return {
    id: 'c1',
    instructorId: 'inst-1',
    instructorName: 'Jane Snow',
    instructorNameZh: null,
    lessonTypeId: 'lt1',
    lessonTypeNameEn: 'Private 2h',
    lessonTypeNameZh: '1对1滑雪课 - 2小时',
    durationMin: 120,
    groupSize: 1,
    isPromo: false,
    locationId: null,
    locationName: null,
    startsAt: '2026-12-05T17:00:00Z',
    endsAt: '2026-12-05T19:00:00Z',
    status: 'scheduled',
    source: 'ssms',
    googleCalendarId: null,
    googleEventId: null,
    googleSyncStatus: 'ok',
    googleSyncError: null,
    googleSyncAttempts: 0,
    googleSyncedAt: null,
    notes: null,
    participants: [],
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function listAdminInstructors(
  all: AdminInstructorRecord[],
  params: URLSearchParams,
): { rows: AdminInstructorRecord[]; total: number } {
  const status = params.get('status');
  const active = params.get('active');
  const tokens = (params.get('q') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const matches = all.filter((r) => {
    const haystack = [r.displayNameEn, r.displayNameZh, r.email]
      .join(' ')
      .toLowerCase();
    return (
      (!status || r.approvalStatus === status) &&
      (active === null || String(r.isActive) === active) &&
      tokens.every((token) => haystack.includes(token))
    );
  });
  const page = params.get('page');
  const limit = params.get('limit');
  if (page === null && limit === null) {
    return { rows: matches, total: matches.length };
  }
  const size = Number(limit ?? 50);
  const offset = (Number(page ?? 1) - 1) * size;
  return { rows: matches.slice(offset, offset + size), total: matches.length };
}

export function listAdminClasses(
  all: AdminClass[],
  params: URLSearchParams,
): { rows: AdminClass[]; total: number } {
  const instructorId = params.get('instructorId');
  const matches = instructorId
    ? all.filter((c) => c.instructorId === instructorId)
    : all;
  const page = params.get('page');
  const limit = params.get('limit');
  if (page === null && limit === null) {
    return { rows: matches, total: matches.length };
  }
  const size = Number(limit ?? 50);
  const offset = (Number(page ?? 1) - 1) * size;
  return { rows: matches.slice(offset, offset + size), total: matches.length };
}

const refs: RefItem[] = [{ id: 'l1', key: 'loc.whistler', name: 'Whistler' }];

export const handlers = [
  http.get(`${API}/me/instructor`, () => HttpResponse.json(fakeProfile)),
  http.patch(`${API}/me/instructor`, async ({ request }) => {
    const body = (await request.json()) as Partial<InstructorProfile>;
    return HttpResponse.json({ ...fakeProfile, ...body });
  }),
  http.get(`${API}/me/instructor/bio/ai-usage`, () =>
    HttpResponse.json({ limit: 5, used: 0, remaining: 5, resetsAt: null }),
  ),
  http.get(`${API}/admin/instructors`, ({ request }) => {
    const { rows, total } = listAdminInstructors(
      fakeAdminList,
      new URL(request.url).searchParams,
    );
    return HttpResponse.json(rows, {
      headers: { 'X-Total-Count': String(total) },
    });
  }),
  http.get(`${API}/admin/instructors/:id`, () =>
    HttpResponse.json(fakeAdminList[0]),
  ),
  http.get(`${API}/reference/:slug`, () => HttpResponse.json(refs)),
  http.get(`${API}/admin/classes`, ({ request }) => {
    const { rows, total } = listAdminClasses(
      [],
      new URL(request.url).searchParams,
    );
    return HttpResponse.json(rows, {
      headers: { 'X-Total-Count': String(total) },
    });
  }),
  http.get(`${API}/admin/booking/sync-issues`, () =>
    HttpResponse.json({ classes: [], deletions: [] }),
  ),
  http.get(`${API}/admin/lesson-types`, () => HttpResponse.json([])),
  http.get(`${API}/admin/pay-rates`, () => HttpResponse.json([])),
  http.get(`${API}/admin/customers`, () => HttpResponse.json([])),
  http.get(`${API}/admin/customers/sync-status`, () =>
    HttpResponse.json({
      scheduled: false,
      intervalMinutes: 15,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastFetched: null,
      lastError: null,
    }),
  ),
  http.get(`${API}/admin/instructors/:id/google-calendar`, ({ params }) =>
    HttpResponse.json({
      instructorId: params.id,
      googleCalendarId: null,
      calendarSummary: null,
      matchStatus: null,
      updatedAt: null,
    }),
  ),
  http.get(`${API}/admin/shopify-sync/status`, () =>
    HttpResponse.json(fakeShopifySyncStatus),
  ),
  http.get(`${API}/admin/shopify-sync/instructors/:id`, () =>
    HttpResponse.json(fakeShopifyInstructorSync),
  ),
  http.get(`${API}/admin/google/status`, () =>
    HttpResponse.json(fakeGoogleStatus),
  ),
  http.get(`${API}/admin/google/calendars`, () =>
    HttpResponse.json(fakeGoogleCalendars),
  ),
  http.get(`${API}/admin/instructor-calendars`, () =>
    HttpResponse.json({
      google: { connected: true, error: null },
      instructors: [],
    }),
  ),
  http.get(`${API}/admin/documents/templates`, () => HttpResponse.json([])),
  http.get(`${API}/admin/instructors/:id/documents`, () =>
    HttpResponse.json({ assignments: [], certificationUploads: [] }),
  ),
];

export const server = setupServer(...handlers);
