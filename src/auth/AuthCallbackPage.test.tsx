import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AuthCallbackPage } from './AuthCallbackPage';
import { SessionProvider } from './SessionProvider';
import { renderWithProviders } from '@/test/render';
import { fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

function renderCallback() {
  renderWithProviders(
    <SessionProvider>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/profile" element={<p>Profile page</p>} />
        <Route path="/admin" element={<p>Admin page</p>} />
      </Routes>
    </SessionProvider>,
    { route: '/auth/callback' },
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => resetAuth());
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('sends an instructor with a session to their profile', async () => {
    setSession(fakeSession());
    renderCallback();
    expect(await screen.findByText('Profile page')).toBeInTheDocument();
  });

  it('sends an admin with a session to the admin console', async () => {
    const session = fakeSession('admin@example.com');
    session.user.app_metadata = { role: 'admin' };
    setSession(session);
    renderCallback();
    expect(await screen.findByText('Admin page')).toBeInTheDocument();
  });

  it('explains the failure when no session arrives', async () => {
    renderCallback();
    expect(
      await screen.findByRole('heading', {
        name: 'This sign-in link didn’t work',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to sign in' }),
    ).toHaveAttribute('href', '/login');
  });

  it('shows the error when Supabase reports one in the URL hash', async () => {
    window.history.replaceState(
      null,
      '',
      '/auth/callback#error=access_denied&error_code=otp_expired',
    );
    setSession(fakeSession());
    renderCallback();
    expect(
      screen.getByRole('heading', { name: 'This sign-in link didn’t work' }),
    ).toBeInTheDocument();
  });
});
