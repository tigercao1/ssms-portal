import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type {
  AdminClass,
  AdminInstructorRecord,
  InstructorProfile,
  LessonProduct,
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

export function fakeLessonProduct(
  overrides: Partial<LessonProduct> = {},
): LessonProduct {
  return {
    id: 'lp1',
    shopifyProductId: 9001,
    shopifyVariantId: 90011,
    productTitle: '一对一',
    variantTitle: '单次',
    lessonType: 'private',
    groupSize: 1,
    sessions: 1,
    durationMin: null,
    pricedPerStudent: false,
    instructorId: 'inst-1',
    status: 'suggested',
    price: '120.00',
    currency: 'CAD',
    createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    ...overrides,
  };
}

export function fakeClass(overrides: Partial<AdminClass> = {}): AdminClass {
  return {
    id: 'c1',
    instructorId: 'inst-1',
    lessonProductId: 'lp1',
    locationId: null,
    startsAt: '2026-12-05T17:00:00Z',
    endsAt: '2026-12-05T19:00:00Z',
    status: 'scheduled',
    source: 'ssms',
    googleCalendarId: null,
    googleEventId: null,
    notes: null,
    participants: [],
    ...overrides,
  };
}

const refs: RefItem[] = [{ id: 'l1', key: 'loc.whistler', name: 'Whistler' }];

export const handlers = [
  http.get(`${API}/me/instructor`, () => HttpResponse.json(fakeProfile)),
  http.patch(`${API}/me/instructor`, async ({ request }) => {
    const body = (await request.json()) as Partial<InstructorProfile>;
    return HttpResponse.json({ ...fakeProfile, ...body });
  }),
  http.get(`${API}/admin/instructors`, () => HttpResponse.json(fakeAdminList)),
  http.get(`${API}/admin/instructors/:id`, () =>
    HttpResponse.json(fakeAdminList[0]),
  ),
  http.get(`${API}/reference/:slug`, () => HttpResponse.json(refs)),
  http.get(`${API}/admin/lesson-products`, () => HttpResponse.json([])),
  http.get(`${API}/admin/classes`, () => HttpResponse.json([])),
  http.get(`${API}/admin/shopify-sync/status`, () =>
    HttpResponse.json(fakeShopifySyncStatus),
  ),
  http.get(`${API}/admin/shopify-sync/instructors/:id`, () =>
    HttpResponse.json(fakeShopifyInstructorSync),
  ),
];

export const server = setupServer(...handlers);
