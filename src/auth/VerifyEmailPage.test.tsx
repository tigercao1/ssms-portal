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

  it('resends without starting a countdown of its own', async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });

    await userEvent.click(await renderPage());

    expect(await screen.findByText('Sent — check your inbox.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend verification email' }),
    ).toBeEnabled();
    expect(auth.resend).toHaveBeenCalledTimes(1);
    expect(auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'jane@example.com',
    });
  });

  it('counts down from the wait Supabase reports on a tap inside its window, even after a reload', async () => {
    auth.resend.mockResolvedValueOnce({ data: {}, error: null });
    auth.resend.mockResolvedValueOnce({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message:
          'For security purposes, you can only request this after 53 seconds.',
      },
    });

    await userEvent.click(await renderPage());
    await screen.findByText('Sent — check your inbox.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Resend verification email' }),
    );

    expect(
      await screen.findByRole('button', { name: /^Resend in (53|52)s$/ }),
    ).toBeDisabled();
    expect(auth.resend).toHaveBeenCalledTimes(2);

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

  it('counts down from the wait Supabase reports when it rate-limits', async () => {
    auth.resend.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message:
          'For security purposes, you can only request this after 42 seconds.',
      },
    });

    await userEvent.click(await renderPage());

    expect(
      await screen.findByText(
        'Too many emails were requested. Please wait a minute and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Resend in (42|41)s$/ }),
    ).toBeDisabled();
  });

  it('asks the user to wait without a countdown when Supabase gives no wait', async () => {
    auth.resend.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      },
    });

    await userEvent.click(await renderPage());

    expect(
      await screen.findByText(
        'Too many emails were requested. Please wait a minute and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Resend verification email' }),
    ).toBeEnabled();
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
