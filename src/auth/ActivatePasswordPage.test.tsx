import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { ActivatePasswordPage } from './ActivatePasswordPage';
import { SessionProvider } from './SessionProvider';
import { RequireAuth } from '@/app/router/guards';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import { auth, fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const API = 'http://localhost:3000';

function renderPage() {
  renderWithProviders(
    <SessionProvider>
      <Routes>
        <Route
          path="/activate/password"
          element={
            <RequireAuth>
              <ActivatePasswordPage />
            </RequireAuth>
          }
        />
        <Route path="/profile/edit" element={<p>Edit profile page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </SessionProvider>,
    { route: '/activate/password' },
  );
}

function captureComplete(status = 204) {
  const auths: (string | null)[] = [];
  server.use(
    http.post(`${API}/me/activation/complete`, ({ request }) => {
      auths.push(request.headers.get('Authorization'));
      return new HttpResponse(null, { status });
    }),
  );
  return auths;
}

async function submitPassword(password: string) {
  const input = await screen.findByLabelText(/New password/);
  await userEvent.clear(input);
  await userEvent.type(input, password);
  await userEvent.click(
    screen.getByRole('button', { name: 'Activate my account' }),
  );
}

describe('ActivatePasswordPage', () => {
  beforeEach(() => {
    resetAuth();
    setSession(fakeSession('jane@example.com'));
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  it('shows the signed-in email read-only', async () => {
    renderPage();
    const email = await screen.findByLabelText(/Email/);
    expect(email).toHaveValue('jane@example.com');
    expect(email).toHaveAttribute('readonly');
    expect(
      screen.getByRole('heading', { name: 'Welcome to Serendipity Snow Club' }),
    ).toBeInTheDocument();
  });

  it('rejects a password shorter than 6 characters', async () => {
    renderPage();
    await submitPassword('abc');
    expect(
      await screen.findByText('Use at least 6 characters.'),
    ).toBeInTheDocument();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('sets the password, completes activation, then opens the profile editor', async () => {
    const completeAuth = captureComplete();
    renderPage();
    await submitPassword('secret123');

    expect(await screen.findByText('Edit profile page')).toBeInTheDocument();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'secret123' });
    expect(completeAuth).toEqual(['Bearer test-jwt']);
  });

  it('keeps the user on the page when the password update fails', async () => {
    const completeAuth = captureComplete();
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { status: 422, message: 'weak' },
    });
    renderPage();
    await submitPassword('secret123');

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
    expect(completeAuth).toEqual([]);
  });

  it('retries only the activation call once the password is already set', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/me/activation/complete`, () => {
        calls += 1;
        return new HttpResponse(null, { status: calls === 1 ? 500 : 204 });
      }),
    );
    renderPage();
    await submitPassword('secret123');
    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Activate my account' }),
    );

    expect(await screen.findByText('Edit profile page')).toBeInTheDocument();
    await waitFor(() => expect(calls).toBe(2));
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it('sends visitors without a session to sign in', async () => {
    resetAuth();
    renderPage();
    expect(await screen.findByText('Login page')).toBeInTheDocument();
  });
});
