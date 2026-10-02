import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { AdminDetailPage } from './AdminDetailPage';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, fakeProfile, server } from '@/test/msw';
import type {
  AdminInstructorRecord,
  InstructorProfile,
  UserRole,
} from '@/lib/types';

const API = 'http://localhost:3000';

const session = vi.hoisted(() => ({ userId: 'admin-self' }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: true,
    user: { id: session.userId, email: 'admin@example.com' },
    signOut: vi.fn(),
  }),
}));

function serveRecord(
  overrides: Partial<AdminInstructorRecord>,
  initialRole: UserRole = 'instructor',
  profileOverrides: Partial<InstructorProfile> = {},
) {
  let profile: InstructorProfile = { ...fakeProfile, ...profileOverrides };
  const calls: string[] = [];
  const profileBodies: unknown[] = [];
  let record: AdminInstructorRecord = {
    ...(fakeAdminList[0] as AdminInstructorRecord),
    ...overrides,
  };
  let role = initialRole;
  const activationBodies: unknown[] = [];
  const roleBodies: unknown[] = [];
  server.use(
    http.get(`${API}/admin/instructors/:id`, () => HttpResponse.json(record)),
    http.get(`${API}/admin/instructors/:id/profile`, () =>
      HttpResponse.json(profile),
    ),
    http.patch(`${API}/admin/instructors/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<InstructorProfile>;
      calls.push(`PATCH /admin/instructors/${params.id}`);
      profileBodies.push(body);
      profile = { ...profile, ...body } as InstructorProfile;
      return HttpResponse.json(profile);
    }),
    http.post(
      `${API}/admin/instructors/:id/photo/signed-upload-url`,
      async ({ request, params }) => {
        calls.push(
          `POST /admin/instructors/${params.id}/photo/signed-upload-url`,
        );
        expect(await request.json()).toEqual({
          contentType: 'image/png',
          contentLength: 4,
        });
        return HttpResponse.json({
          uploadUrl: 'http://storage.test/upload',
          token: 'tok',
          publicUrl: 'http://storage.test/photo.png',
          path: 'inst-1/photo.png',
        });
      },
    ),
    http.put('http://storage.test/upload', () => {
      calls.push('PUT storage');
      return new HttpResponse(null, { status: 200 });
    }),
    http.post(`${API}/admin/instructors/:id/photo/confirm`, ({ params }) => {
      calls.push(`POST /admin/instructors/${params.id}/photo/confirm`);
      profile = {
        ...profile,
        profilePhotoUrl: 'http://storage.test/photo.png',
      };
      return HttpResponse.json(profile);
    }),
    http.post(`${API}/me/instructor/photo/*`, () => {
      calls.push('instructor photo route');
      return HttpResponse.json({}, { status: 500 });
    }),
    http.patch(
      `${API}/admin/instructors/:id/activation`,
      async ({ request }) => {
        const body = (await request.json()) as { isActive: boolean };
        activationBodies.push(body);
        record = {
          ...record,
          isActive: body.isActive,
          updatedAt: new Date().toISOString(),
        };
        return HttpResponse.json(record);
      },
    ),
    http.get(`${API}/admin/users/:id/role`, () => HttpResponse.json({ role })),
    http.patch(`${API}/admin/users/:id/role`, async ({ request, params }) => {
      const body = (await request.json()) as { role: UserRole };
      roleBodies.push({ userId: params.id, ...body });
      const previousRole = role;
      role = body.role;
      return HttpResponse.json({
        userId: params.id,
        role,
        previousRole,
        changed: previousRole !== role,
      });
    }),
  );
  return { activationBodies, roleBodies, profileBodies, calls };
}

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/instructors/:id" element={<AdminDetailPage />} />
    </Routes>,
    { route: '/admin/instructors/inst-1' },
  );
}

beforeEach(() => {
  session.userId = 'admin-self';
});

describe('AdminDetailPage actions', () => {
  it('takes an active instructor offline only after confirming', async () => {
    const { activationBodies: bodies } = serveRecord({
      approvalStatus: 'approved',
      isActive: true,
    });
    renderDetail();

    expect(await screen.findByText('Active')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Put online' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'Activate' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Take offline' }));
    expect(screen.getByText(/notified by email/)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bodies).toEqual([{ isActive: false }]));
    expect(
      await screen.findByRole('button', { name: 'Put online' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('puts an inactive instructor back online after confirming', async () => {
    const { activationBodies: bodies } = serveRecord({
      approvalStatus: 'approved',
      isActive: false,
    });
    renderDetail();

    expect(await screen.findByText('Inactive')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Put online' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(bodies).toEqual([{ isActive: true }]));
  });

  it('cancelling the confirm step sends nothing', async () => {
    const { activationBodies: bodies } = serveRecord({
      approvalStatus: 'approved',
      isActive: true,
    });
    renderDetail();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Take offline' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: 'Take offline' }),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('groups approve and reject for pending instructors without an offline action', async () => {
    serveRecord({ approvalStatus: 'pending', isActive: true });
    renderDetail();

    expect(
      await screen.findByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Take offline' }),
    ).not.toBeInTheDocument();
  });
});

describe('AdminDetailPage role', () => {
  it('shows the instructor role and only allows promoting', async () => {
    const { roleBodies } = serveRecord({}, 'instructor');
    renderDetail();

    expect(await screen.findByText('Instructor')).toBeInTheDocument();
    const promote = screen.getByRole('button', { name: 'Promote to admin' });
    const demote = screen.getByRole('button', { name: 'Demote to instructor' });
    expect(promote).toBeEnabled();
    expect(demote).toBeDisabled();
    expect(demote).toHaveAccessibleDescription('Already an instructor.');

    await userEvent.click(promote);
    await waitFor(() =>
      expect(roleBodies).toEqual([{ userId: 'auth-1', role: 'admin' }]),
    );
    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Promote to admin' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Demote to instructor' }),
    ).toBeEnabled();
  });

  it('shows the admin role and only allows demoting', async () => {
    serveRecord({}, 'admin');
    renderDetail();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    const promote = screen.getByRole('button', { name: 'Promote to admin' });
    expect(promote).toBeDisabled();
    expect(promote).toHaveAccessibleDescription('Already an admin.');
    expect(
      screen.getByRole('button', { name: 'Demote to instructor' }),
    ).toBeEnabled();
  });

  it('keeps the self-edit guard', async () => {
    session.userId = 'auth-1';
    serveRecord({}, 'admin');
    renderDetail();

    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(
      screen.getByText('You can’t change your own role.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote to admin' }),
    ).not.toBeInTheDocument();
  });
});

describe('AdminDetailPage profile editor', () => {
  const richProfile: Partial<InstructorProfile> = {
    preferredLanguage: 'zh-CN',
    minStudentAge: 9,
    trainerStatus: [
      {
        discipline: 'snowboard',
        rookieSessionCompleted: true,
        trainerExamPassed: false,
        trainerLevel: 2,
        display: null,
      },
    ],
  };

  it('prefills every field and submits the full body', async () => {
    const { profileBodies, calls } = serveRecord({}, 'instructor', richProfile);
    renderDetail();

    const name = await screen.findByDisplayValue('Jane Snow');
    expect(screen.getByDisplayValue('简雪')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Veteran instructor.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Minimum student age/)).toHaveValue(9);
    expect(screen.getByLabelText('Preferred language')).toHaveValue('zh-CN');
    expect(screen.getByDisplayValue('CSIA')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Snowboard')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Whistler', pressed: true }),
    ).toBeInTheDocument();

    await userEvent.clear(name);
    await userEvent.type(name, 'Jane Powder');
    const age = screen.getByLabelText(/Minimum student age/);
    await userEvent.clear(age);
    await userEvent.type(age, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(profileBodies).toHaveLength(1));
    expect(calls).toEqual(['PATCH /admin/instructors/inst-1']);
    expect(profileBodies[0]).toEqual({
      displayNameEn: 'Jane Powder',
      displayNameZh: '简雪',
      bioEn: 'Veteran instructor.',
      bioZh: null,
      dateOfBirth: null,
      preferredLanguage: 'zh-CN',
      minStudentAge: 12,
      teachingLocationIds: ['l1'],
      languageIds: ['la1'],
      courseLevelOfferedIds: [],
      certifications: [
        {
          org: 'csia',
          track: 'regular',
          level: 4,
          isPartial: false,
          partialComponents: [],
          achievedOn: '2020-01-01',
        },
      ],
      trainerStatus: [
        {
          discipline: 'snowboard',
          rookieSessionCompleted: true,
          trainerExamPassed: false,
          trainerLevel: 2,
        },
      ],
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('defaults the minimum student age to 5 when the profile lacks it', async () => {
    const { profileBodies } = serveRecord({}, 'instructor', {
      minStudentAge: undefined,
    });
    renderDetail();

    expect(await screen.findByLabelText(/Minimum student age/)).toHaveValue(5);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(profileBodies).toHaveLength(1));
    expect(profileBodies[0]).toMatchObject({ minStudentAge: 5 });
  });

  it.each(['19', '-1', '2.5', ''])(
    'rejects a minimum student age of %j without saving',
    async (value) => {
      const { profileBodies } = serveRecord({}, 'instructor', richProfile);
      renderDetail();

      const age = await screen.findByLabelText(/Minimum student age/);
      await userEvent.clear(age);
      if (value) await userEvent.type(age, value);
      fireEvent.submit(age.closest('form') as HTMLFormElement);

      expect(
        await screen.findByText(
          value
            ? 'Enter a whole number from 0 to 18.'
            : 'This field is required.',
        ),
      ).toBeInTheDocument();
      expect(profileBodies).toHaveLength(0);
    },
  );
});

describe('AdminDetailPage photo', () => {
  it('uploads through the admin photo routes', async () => {
    const { calls } = serveRecord({});
    const { container } = renderDetail();

    await screen.findByDisplayValue('Jane Snow');
    expect(
      screen.queryByRole('button', { name: 'Remove photo' }),
    ).not.toBeInTheDocument();
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(['abcd'], 'me.png', { type: 'image/png' }),
    );

    expect(
      await screen.findByRole('img', { name: 'Jane Snow' }),
    ).toHaveAttribute('src', 'http://storage.test/photo.png');
    expect(calls).toEqual([
      'POST /admin/instructors/inst-1/photo/signed-upload-url',
      'PUT storage',
      'POST /admin/instructors/inst-1/photo/confirm',
    ]);
  });

  it('removes the photo with a null profilePhotoUrl', async () => {
    const { profileBodies } = serveRecord({}, 'instructor', {
      profilePhotoUrl: 'http://storage.test/old.png',
    });
    renderDetail();

    expect(
      await screen.findByRole('img', { name: 'Jane Snow' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    await waitFor(() =>
      expect(profileBodies).toEqual([{ profilePhotoUrl: null }]),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('img', { name: 'Jane Snow' }),
      ).not.toBeInTheDocument(),
    );
  });
});
