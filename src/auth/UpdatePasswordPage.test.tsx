import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdatePasswordPage } from './UpdatePasswordPage';
import { renderWithProviders } from '@/test/render';
import { auth, resetAuth } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

describe('UpdatePasswordPage', () => {
  beforeEach(() => resetAuth());

  it('updates the password and confirms', async () => {
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    renderWithProviders(<UpdatePasswordPage />, { route: '/update-password' });

    await userEvent.type(screen.getByLabelText(/New password/), 'secret123');
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    );

    expect(
      await screen.findByText('Password updated. You can sign in now.'),
    ).toBeInTheDocument();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'secret123' });
  });

  it('shows an error when the update fails', async () => {
    auth.updateUser.mockResolvedValue({
      data: {},
      error: { status: 401, message: 'no session' },
    });
    renderWithProviders(<UpdatePasswordPage />, { route: '/update-password' });

    await userEvent.type(screen.getByLabelText(/New password/), 'secret123');
    await userEvent.click(
      screen.getByRole('button', { name: 'Update password' }),
    );

    expect(
      await screen.findByText('Something went wrong. Please try again.'),
    ).toBeInTheDocument();
  });
});
