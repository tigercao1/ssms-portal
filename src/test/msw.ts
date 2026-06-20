import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type {
  AdminInstructorRecord,
  InstructorProfile,
  RefItem,
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
];

export const server = setupServer(...handlers);
