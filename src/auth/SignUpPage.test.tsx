import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignUpPage } from './SignUpPage';
import { renderWithProviders } from '@/test/render';
import { auth, resetAuth } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

async function fillAndSubmit({
  firstName = '',
  lastName = '',
  nickname = '',
}: {
  firstName?: string;
  lastName?: string;
  nickname?: string;
}) {
  if (firstName)
    await userEvent.type(screen.getByLabelText(/First name/), firstName);
  if (lastName)
    await userEvent.type(screen.getByLabelText(/Last name/), lastName);
  if (nickname)
    await userEvent.type(screen.getByLabelText(/Nickname/), nickname);
  await userEvent.type(screen.getByLabelText(/Email/), 'jane@example.com');
  await userEvent.type(screen.getByLabelText(/Password/), 'secret123');
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUpPage', () => {
  beforeEach(() => {
    resetAuth();
    auth.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: 'i-1' }] } },
      error: null,
    });
  });

  it('renders name fields before email and password', () => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    expect(
      screen.getByRole('heading', { name: 'Apply as an instructor' }),
    ).toBeInTheDocument();
    const inputs = [
      screen.getByLabelText(/First name/),
      screen.getByLabelText(/Last name/),
      screen.getByLabelText(/Nickname/),
      screen.getByLabelText(/Email/),
      screen.getByLabelText(/Password/),
    ];
    const domOrder = Array.from(document.querySelectorAll('input'));
    expect(domOrder).toEqual(inputs);
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument();
  });

  it('requires first and last name and leaves nickname optional', () => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    expect(screen.getByLabelText(/First name/)).toBeRequired();
    expect(screen.getByLabelText(/Last name/)).toBeRequired();
    expect(screen.getByLabelText(/Nickname/)).not.toBeRequired();
    expect(
      screen.getByText(
        'The name shown on your profile. Leave blank to use your first and last name.',
      ),
    ).toBeInTheDocument();
  });

  it('sends trimmed names and nickname as sign-up metadata', async () => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    await fillAndSubmit({
      firstName: '  Jane ',
      lastName: ' Doe  ',
      nickname: ' JJ ',
    });

    expect(
      await screen.findByRole('heading', { name: 'Check your email' }),
    ).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'jane@example.com',
      password: 'secret123',
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { first_name: 'Jane', last_name: 'Doe', nickname: 'JJ' },
      },
    });
  });

  it('sends a null nickname when it is left blank or whitespace', async () => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    await fillAndSubmit({ firstName: 'Jane', lastName: 'Doe', nickname: '   ' });

    await screen.findByRole('heading', { name: 'Check your email' });
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: { first_name: 'Jane', last_name: 'Doe', nickname: null },
        }),
      }),
    );
  });

  it.each([
    ['first name is blank', { lastName: 'Doe' }],
    ['last name is blank', { firstName: 'Jane' }],
    ['names are whitespace', { firstName: '   ', lastName: '  ' }],
  ])('blocks submission when the %s', async (_label, names) => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    await fillAndSubmit(names);

    expect(
      screen.getByText('Enter your first and last name.'),
    ).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('renders the name labels in Chinese', () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    expect(screen.getByLabelText(/^名/)).toBeRequired();
    expect(screen.getByLabelText(/^姓/)).toBeRequired();
    expect(screen.getByLabelText(/^昵称/)).not.toBeRequired();
    expect(
      screen.getByText('显示在你资料上的名字。留空则使用你的名和姓。'),
    ).toBeInTheDocument();
  });
});
