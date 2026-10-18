import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerifyEmailPage } from './VerifyEmailPage';
import { SessionProvider } from './SessionProvider';
import { renderWithProviders } from '@/test/render';
import { auth, fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

function renderPage() {
  renderWithProviders(
    <SessionProvider>
      <VerifyEmailPage />
    </SessionProvider>,
  );
  return screen.findByRole('button', { name: 'Resend verification email' });
}

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    resetAuth();
    setSession(fakeSession('jane@example.com'));
  });

  it('resends once, then counts down even after a reload', async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });

    await userEvent.click(await renderPage());

    expect(await screen.findByText('Sent — check your inbox.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();
    expect(auth.resend).toHaveBeenCalledTimes(1);
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'jane@example.com',
    });

    cleanup();
    renderWithProviders(
      <SessionProvider>
        <VerifyEmailPage />
      </SessionProvider>,
    );
    expect(
      await screen.findByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();
  });

  it('asks the user to wait and counts down when Supabase rate-limits', async () => {
    auth.resend.mockResolvedValue({
      data: {},
      error: { status: 429, code: 'over_email_send_rate_limit' },
    });

    await userEvent.click(await renderPage());

    expect(
      await screen.findByText(
        'Too many emails were requested. Please wait a minute and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();
  });

  it('shows an error and allows a retry when the resend fails', async () => {
    auth.resend.mockResolvedValue({
      data: {},
      error: { status: 500, name: 'AuthApiError' },
    });

    await userEvent.click(await renderPage());

    expect(await screen.findByText(/Something went wrong/)).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend verification email' }),
    ).toBeEnabled();
  });
});
