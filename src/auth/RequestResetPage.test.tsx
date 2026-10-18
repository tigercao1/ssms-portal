import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestResetPage } from './RequestResetPage';
import { renderWithProviders } from '@/test/render';
import { auth, resetAuth } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

async function requestReset(email: string) {
  renderWithProviders(<RequestResetPage />);
  await userEvent.type(screen.getByLabelText(/Email/), email);
  await userEvent.click(
    screen.getByRole('button', { name: 'Send reset link' }),
  );
}

describe('RequestResetPage', () => {
  beforeEach(() => resetAuth());

  it('sends a reset email without starting a countdown of its own', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await requestReset('jane@example.com');

    expect(
      await screen.findByText(
        'If that email exists, a reset link is on its way.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Send reset link' }),
    ).toBeEnabled();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it('counts down from the wait Supabase reports on a tap inside its window, for that address only', async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message:
          'For security purposes, you can only request this after 53 seconds.',
      },
    });

    await requestReset('jane@example.com');
    await screen.findByText(
      'If that email exists, a reset link is on its way.',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );
    expect(
      await screen.findByRole('button', { name: /^Resend in (53|52)s$/ }),
    ).toBeDisabled();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);

    cleanup();
    renderWithProviders(<RequestResetPage />);
    await userEvent.type(screen.getByLabelText(/Email/), 'Jane@Example.com');
    expect(
      screen.getByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.type(screen.getByLabelText(/Email/), 'sam@example.com');
    expect(
      screen.getByRole('button', { name: 'Send reset link' }),
    ).toBeEnabled();
  });

  it('counts down from the wait Supabase reports when it rate-limits', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message:
          'For security purposes, you can only request this after 42 seconds.',
      },
    });

    await requestReset('jane@example.com');

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
    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: {
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      },
    });

    await requestReset('jane@example.com');

    expect(
      await screen.findByText(
        'Too many emails were requested. Please wait a minute and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Send reset link' }),
    ).toBeEnabled();
  });

  it.each([
    ['a server error', { status: 500, name: 'AuthApiError' }],
    ['a network error', { status: 0, name: 'AuthRetryableFetchError' }],
  ])(
    'shows an error and lets the user retry straight away after %s',
    async (_label, error) => {
      auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error });
      auth.resetPasswordForEmail.mockResolvedValueOnce({
        data: {},
        error: null,
      });

      await requestReset('jane@example.com');

      expect(await screen.findByText(/Something went wrong/)).toBeVisible();
      expect(
        screen.queryByText('If that email exists, a reset link is on its way.'),
      ).not.toBeInTheDocument();

      cleanup();
      await requestReset('jane@example.com');

      expect(
        await screen.findByText(
          'If that email exists, a reset link is on its way.',
        ),
      ).toBeVisible();
      expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(2);
    },
  );
});
