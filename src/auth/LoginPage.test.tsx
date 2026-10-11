import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from './LoginPage';
import { renderWithProviders } from '@/test/render';
import { auth, resetAuth } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

async function requestLink(email: string) {
  if (email) await userEvent.type(screen.getByLabelText(/Email/), email);
  await userEvent.click(
    screen.getByRole('button', { name: 'Email me a sign-in link' }),
  );
}

describe('LoginPage magic link', () => {
  beforeEach(() => resetAuth());

  it('requests a link without creating users and confirms generically', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    renderWithProviders(<LoginPage />, { route: '/login' });

    await requestLink(' jane@example.com ');

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/If an account exists for this address/),
    ).toBeInTheDocument();
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'jane@example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  });

  it('shows the same confirmation when the account does not exist', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        name: 'AuthApiError',
        status: 422,
        code: 'otp_disabled',
        message: 'Signups not allowed for otp',
      },
    });
    renderWithProviders(<LoginPage />, { route: '/login' });

    await requestLink('nobody@example.com');

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument();
  });

  it('explains rate limiting in friendly terms', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: {
        name: 'AuthApiError',
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'email rate limit exceeded',
      },
    });
    renderWithProviders(<LoginPage />, { route: '/login' });

    await requestLink('jane@example.com');

    expect(
      await screen.findByText(/Too many emails were requested/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Check your email' }),
    ).not.toBeInTheDocument();
  });

  it('reports when Supabase cannot be reached', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch' },
    });
    renderWithProviders(<LoginPage />, { route: '/login' });

    await requestLink('jane@example.com');

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
  });

  it('asks for an email before sending a link', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' });

    await requestLink('');

    expect(
      screen.getByText('Enter your email above, then we can send you a link.'),
    ).toBeInTheDocument();
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('returns to the sign-in form from the confirmation', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    renderWithProviders(<LoginPage />, { route: '/login' });
    await requestLink('jane@example.com');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Back to sign in' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });
});
