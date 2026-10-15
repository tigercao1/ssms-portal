import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  const uploads: string[] = [];
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
    http.put('http://storage.test/upload', async ({ request }) => {
      calls.push('PUT storage');
      uploads.push(await request.text());
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
  return { activationBodies, roleBodies, profileBodies, calls, uploads };
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

  it('shows an error when the approval request fails', async () => {
    serveRecord({ approvalStatus: 'pending', isActive: true });
    const approvalBodies: unknown[] = [];
    server.use(
      http.patch(
        `${API}/admin/instructors/:id/approval`,
        async ({ request }) => {
          approvalBodies.push(await request.json());
          return HttpResponse.json({}, { status: 500 });
        },
      ),
    );
    renderDetail();

    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Approve' }),
    );

    expect(
      await screen.findByText('Something went wrong.'),
    ).toBeInTheDocument();
    expect(approvalBodies).toEqual([{ approvalStatus: 'approved' }]);
    expect(screen.getByText('Pending')).toBeInTheDocument();
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

describe('AdminDetailPage legal name', () => {
  it('prefills the names and sends only the changed one', async () => {
    const { profileBodies } = serveRecord({}, 'instructor', {
      firstName: 'Jane',
      lastName: 'Snow',
    });
    renderDetail();

    const first = await screen.findByRole('textbox', { name: /First name/ });
    expect(first).toHaveValue('Jane');
    expect(screen.getByRole('textbox', { name: /Last name/ })).toHaveValue(
      'Snow',
    );
    await userEvent.clear(first);
    await userEvent.type(first, 'Janet');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(profileBodies).toHaveLength(1));
    expect(profileBodies[0]).toMatchObject({ firstName: 'Janet' });
    expect(profileBodies[0]).not.toHaveProperty('lastName');
  });

  it('blocks clearing a name that was set', async () => {
    const { profileBodies } = serveRecord({}, 'instructor', {
      firstName: 'Jane',
      lastName: 'Snow',
    });
    renderDetail();

    const last = await screen.findByRole('textbox', { name: /Last name/ });
    await userEvent.clear(last);
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(last).toHaveAttribute('aria-invalid', 'true');
    expect(profileBodies).toHaveLength(0);
  });

  it('leaves empty names optional until one is entered', async () => {
    const { profileBodies } = serveRecord({});
    renderDetail();

    const first = await screen.findByRole('textbox', { name: /First name/ });
    expect(first).toHaveValue('');
    await userEvent.type(first, 'Jane');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('This field is required.'),
    ).toBeInTheDocument();
    expect(profileBodies).toHaveLength(0);

    await userEvent.type(
      screen.getByRole('textbox', { name: /Last name/ }),
      'Snow',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(profileBodies).toHaveLength(1));
    expect(profileBodies[0]).toMatchObject({
      firstName: 'Jane',
      lastName: 'Snow',
    });
  });
});

describe('AdminDetailPage photo', () => {
  it('uploads through the admin photo routes', async () => {
    const { calls, uploads } = serveRecord({});
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
    expect(uploads).toEqual(['abcd']);
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

describe('AdminDetailPage machine-translation badge', () => {
  it('marks the machine-translated bio with the model name', async () => {
    serveRecord({}, 'instructor', {
      bioEn: 'Veteran instructor.',
      bioZh: '资深教练。',
      bioZhMachineTranslated: true,
      bioZhTranslatedBy: 'gemini-2.5-flash',
    });
    renderDetail();

    expect(await screen.findByDisplayValue('资深教练。')).toBeInTheDocument();
    expect(screen.getAllByText('Translated by gemini-2.5-flash')).toHaveLength(
      1,
    );
    expect(
      screen.getByText(/Editing this text replaces the machine translation/),
    ).toBeInTheDocument();
  });

  it('shows no badge for human-written bios', async () => {
    serveRecord({}, 'instructor', {
      bioEnTranslatedBy: null,
      bioZhTranslatedBy: null,
    });
    renderDetail();

    expect(
      await screen.findByDisplayValue('Veteran instructor.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
  });
});

describe('AdminDetailPage Shopify panel', () => {
  it('shows the instructor Shopify sync state', async () => {
    serveRecord({ approvalStatus: 'approved', isActive: true });
    renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Shopify' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('jane-snow')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sync this instructor now' }),
    ).toBeInTheDocument();
  });
});

describe('AdminDetailPage more photos', () => {
  function serveSlots(initial: Partial<InstructorProfile> = {}) {
    const calls: { route: string; body?: unknown }[] = [];
    let profile: InstructorProfile = { ...fakeProfile, ...initial };
    server.use(
      http.get(`${API}/admin/instructors/:id/profile`, () =>
        HttpResponse.json(profile),
      ),
      http.post(
        `${API}/admin/instructors/:id/photo/signed-upload-url`,
        async ({ request, params }) => {
          calls.push({
            route: `POST /admin/instructors/${params.id}/photo/signed-upload-url`,
            body: await request.json(),
          });
          return HttpResponse.json({
            uploadUrl: 'http://storage.test/upload',
            token: 'tok',
            publicUrl: 'http://storage.test/p2.png',
            path: 'inst-1/photo-2.png',
          });
        },
      ),
      http.post(
        `${API}/admin/instructors/:id/photo/confirm`,
        async ({ request, params }) => {
          calls.push({
            route: `POST /admin/instructors/${params.id}/photo/confirm`,
            body: await request.json(),
          });
          profile = { ...profile, photo2Url: 'http://storage.test/p2.png' };
          return HttpResponse.json(profile);
        },
      ),
      http.delete(`${API}/admin/instructors/:id/photo/:slot`, ({ params }) => {
        calls.push({
          route: `DELETE /admin/instructors/${params.id}/photo/${params.slot}`,
        });
        profile = { ...profile, photo3Url: null };
        return HttpResponse.json(profile);
      }),
    );
    return calls;
  }

  it('uploads slot 2 through the admin photo routes with its slot', async () => {
    const { uploads } = serveRecord({});
    const calls = serveSlots();
    renderDetail();

    const photo2 = await screen.findByRole('group', { name: 'Photo 2' });
    await userEvent.upload(
      photo2.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['abcd'], 'p2.png', { type: 'image/png' }),
    );

    expect(await within(photo2).findByRole('img')).toHaveAttribute(
      'src',
      'http://storage.test/p2.png',
    );
    expect(calls).toEqual([
      {
        route: 'POST /admin/instructors/inst-1/photo/signed-upload-url',
        body: { contentType: 'image/png', contentLength: 4, slot: 2 },
      },
      {
        route: 'POST /admin/instructors/inst-1/photo/confirm',
        body: { contentType: 'image/png', slot: 2 },
      },
    ]);
    expect(uploads).toEqual(['abcd']);
  });

  it('removes slot 3 through the admin delete route', async () => {
    serveRecord({});
    const calls = serveSlots({ photo3Url: 'http://storage.test/p3.png' });
    renderDetail();

    const photo3 = await screen.findByRole('group', { name: 'Photo 3' });
    expect(within(photo3).getByRole('img')).toBeInTheDocument();
    await userEvent.click(
      within(photo3).getByRole('button', { name: 'Remove photo' }),
    );

    await waitFor(() =>
      expect(within(photo3).queryByRole('img')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([
      { route: 'DELETE /admin/instructors/inst-1/photo/3' },
    ]);
  });

  it('refetches the profile when the delete returns no body', async () => {
    let photo2Url: string | null = 'http://storage.test/p2.png';
    serveRecord({});
    server.use(
      http.get(`${API}/admin/instructors/:id/profile`, () =>
        HttpResponse.json({ ...fakeProfile, photo2Url }),
      ),
      http.delete(`${API}/admin/instructors/:id/photo/2`, () => {
        photo2Url = null;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderDetail();

    const photo2 = await screen.findByRole('group', { name: 'Photo 2' });
    await userEvent.click(
      within(photo2).getByRole('button', { name: 'Remove photo' }),
    );
    await waitFor(() =>
      expect(within(photo2).queryByRole('img')).not.toBeInTheDocument(),
    );
  });
});

describe('AdminDetailPage display order', () => {
  function serveDisplayOrder() {
    const bodies: unknown[] = [];
    server.use(
      http.patch(
        `${API}/admin/instructors/:id/display-order`,
        async ({ request }) => {
          const body = (await request.json()) as {
            displayOrder: number | null;
          };
          bodies.push(body);
          return HttpResponse.json({
            ...fakeAdminList[0],
            displayOrder: body.displayOrder,
          });
        },
      ),
    );
    return bodies;
  }

  const label = 'Display order (lower shows first)';

  it('prefills the current order and saves a new one', async () => {
    serveRecord({ displayOrder: 4 });
    const bodies = serveDisplayOrder();
    renderDetail();

    const input = await screen.findByRole('spinbutton', { name: label });
    expect(input).toHaveValue(4);
    await userEvent.clear(input);
    await userEvent.type(input, '2');
    const card = input.closest('form') as HTMLFormElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bodies).toEqual([{ displayOrder: 2 }]));
    expect(await within(card).findByText('Saved')).toBeInTheDocument();
  });

  it('sends null when the field is cleared', async () => {
    serveRecord({ displayOrder: 7 });
    const bodies = serveDisplayOrder();
    renderDetail();

    const input = await screen.findByRole('spinbutton', { name: label });
    await userEvent.clear(input);
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    await waitFor(() => expect(bodies).toEqual([{ displayOrder: null }]));
  });

  it('starts empty when no order is set', async () => {
    serveRecord({ displayOrder: null });
    renderDetail();
    expect(await screen.findByRole('spinbutton', { name: label })).toHaveValue(
      null,
    );
  });

  it.each(['-1', '2.5', '2147483648'])(
    'rejects %j without saving',
    async (value) => {
      serveRecord({});
      const bodies = serveDisplayOrder();
      renderDetail();

      const input = await screen.findByRole('spinbutton', { name: label });
      await userEvent.type(input, value);
      fireEvent.submit(input.closest('form') as HTMLFormElement);

      expect(
        await screen.findByText(
          'Enter a whole number, 0 or more, or leave it empty.',
        ),
      ).toBeInTheDocument();
      expect(bodies).toHaveLength(0);
    },
  );

  it('shows an error when saving fails', async () => {
    serveRecord({});
    server.use(
      http.patch(
        `${API}/admin/instructors/:id/display-order`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderDetail();

    const input = await screen.findByRole('spinbutton', { name: label });
    await userEvent.type(input, '1');
    const card = input.closest('form') as HTMLFormElement;
    await userEvent.click(within(card).getByRole('button', { name: 'Save' }));
    expect(
      await within(card).findByText('Something went wrong.'),
    ).toBeInTheDocument();
  });

  it('labels the field in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveRecord({});
    renderDetail();
    expect(
      await screen.findByRole('spinbutton', {
        name: '显示顺序（数字越小越靠前）',
      }),
    ).toBeInTheDocument();
  });
});
