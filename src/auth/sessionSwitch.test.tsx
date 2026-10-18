import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  auth,
  fakeSession,
  resetAuth,
  setSession,
  setStoredSession,
} from '@/test/supabaseAuth';
import { fakeProfile, server } from '@/test/msw';
import { I18nProvider } from '@/i18n/core/I18nProvider';
import { RequireAuth } from '@/app/router/guards';
import { ProfileViewPage } from '@/features/instructor/ProfileViewPage';
import { EditProfilePage } from '@/features/instructor/EditProfilePage';
import type { InstructorProfile, UpdateProfileBody } from '@/lib/types';
import { SessionProvider } from './SessionProvider';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));
vi.mock('@/lib/analytics', () => ({
  identifyUser: vi.fn(),
  resetUser: vi.fn(),
  track: vi.fn(),
}));

const API = 'http://localhost:3000';

function sessionFor(id: string): Session {
  const base = fakeSession(`${id}@example.com`);
  return { ...base, access_token: `jwt-${id}`, user: { ...base.user, id } };
}

const profiles: Record<string, InstructorProfile> = {
  t5: {
    ...fakeProfile,
    id: 'inst-t5',
    email: 't5@example.com',
    displayNameEn: 'T5 Documents',
    approvalStatus: 'pending',
  },
  t6: {
    ...fakeProfile,
    id: 'inst-t6',
    email: 't6@example.com',
    displayNameEn: 'T6 Person',
    approvalStatus: 'pending',
  },
  t7: {
    ...fakeProfile,
    id: 'inst-t7',
    email: 't7@example.com',
    displayNameEn: 'T7 Rejected',
    approvalStatus: 'rejected',
  },
  t2: {
    ...fakeProfile,
    id: 'inst-t2',
    email: 't2@example.com',
    displayNameEn: 'T2 Pending',
    approvalStatus: 'pending',
  },
};

let releaseProfile: Record<string, Promise<void>> = {};
let releasePatch: Record<string, Promise<void>> = {};
let patches: Array<{ token: string | null; body: UpdateProfileBody }> = [];

function userFromToken(request: Request) {
  return request.headers.get('Authorization')?.replace('Bearer jwt-', '') ?? '';
}

beforeEach(() => {
  resetAuth();
  releaseProfile = {};
  releasePatch = {};
  patches = [];
  server.use(
    http.get(`${API}/me/instructor`, async ({ request }) => {
      const user = userFromToken(request);
      await releaseProfile[user];
      return HttpResponse.json(profiles[user]);
    }),
    http.patch(`${API}/me/instructor`, async ({ request }) => {
      const body = (await request.json()) as UpdateProfileBody;
      patches.push({ token: request.headers.get('Authorization'), body });
      await releasePatch[userFromToken(request)];
      return HttpResponse.json({
        ...profiles[userFromToken(request)],
        ...body,
      });
    }),
    http.get(`${API}/me/documents`, () => HttpResponse.json({ items: [] })),
  );
});

function hold(gates: Record<string, Promise<void>>, user: string) {
  let release!: () => void;
  gates[user] = new Promise<void>((r) => (release = r));
  return release;
}

function holdProfile(user: string) {
  return hold(releaseProfile, user);
}

function renderPortal(route: string) {
  return render(
    <I18nProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <ProfileViewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profile/edit"
              element={
                <RequireAuth>
                  <EditProfilePage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </I18nProvider>,
  );
}

describe('switching the signed-in account', () => {
  it("never shows the previous user's status while the next user's profile loads", async () => {
    setStoredSession(sessionFor('t7'));
    renderPortal('/profile');
    expect(await screen.findByText('T7 Rejected')).toBeInTheDocument();
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);

    const release = holdProfile('t2');
    act(() => setSession(sessionFor('t2')));

    expect(screen.queryByText('T7 Rejected')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();

    release();
    expect(await screen.findByText('T2 Pending')).toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
  });

  it('reloads the edit form for the new user when another tab signs in', async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    act(() => setSession(sessionFor('t6')));

    expect(screen.queryByDisplayValue('T5 Documents')).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('T6 Person')).toBeInTheDocument();
  });

  it('picks up a sign-in written to storage by another tab', async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    setStoredSession(sessionFor('t6'));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'sb-project-auth-token' }),
      );
    });

    expect(await screen.findByDisplayValue('T6 Person')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('T5 Documents')).not.toBeInTheDocument();
  });

  it("refuses to save one user's form once the session belongs to someone else", async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    setStoredSession(sessionFor('t6'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText(/You are now signed in as a different account/),
    ).toBeInTheDocument();
    await waitFor(() => expect(patches).toEqual([]));
  });

  it("keeps the new user's profile when the previous user's save finishes after the switch", async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    const releaseT5Save = hold(releasePatch, 't5');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(patches).toHaveLength(1));

    act(() => setSession(sessionFor('t6')));
    expect(await screen.findByDisplayValue('T6 Person')).toBeInTheDocument();

    releaseT5Save();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByDisplayValue('T6 Person')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('T6 Person')).toBeInTheDocument();
    expect(screen.queryByText('T5 Documents')).not.toBeInTheDocument();
  });

  it("never sends one user's form under another user's token when the switch lands mid-save", async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    auth.getSession.mockImplementationOnce(async () => {
      const session = sessionFor('t5');
      setStoredSession(sessionFor('t6'));
      return { data: { session }, error: null };
    });
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual(
      expect.objectContaining({
        token: 'Bearer jwt-t5',
        body: expect.objectContaining({ displayNameEn: 'T5 Documents' }),
      }),
    );
  });

  it('still saves when the same user is signed in', async () => {
    setStoredSession(sessionFor('t5'));
    renderPortal('/profile/edit');
    expect(await screen.findByDisplayValue('T5 Documents')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(patches).toEqual([
        expect.objectContaining({ token: 'Bearer jwt-t5' }),
      ]),
    );
  });
});
