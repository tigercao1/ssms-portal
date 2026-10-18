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

  it('sends one reset email, then counts down for that address after a reload', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await requestReset('jane@example.com');

    expect(
      await screen.findByText(
        'If that email exists, a reset link is on its way.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);

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

  it('asks the user to wait and counts down when Supabase rate-limits', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      data: {},
      error: { status: 429, code: 'over_email_send_rate_limit' },
    });

    await requestReset('jane@example.com');

    expect(
      await screen.findByText(
        'Too many emails were requested. Please wait a minute and try again.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Resend in \d+s$/ }),
    ).toBeDisabled();
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
