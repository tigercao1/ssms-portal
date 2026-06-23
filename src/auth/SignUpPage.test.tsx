import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { SignUpPage } from './SignUpPage';
import { renderWithProviders } from '@/test/render';

describe('SignUpPage', () => {
  it('renders the application form with email + password', () => {
    renderWithProviders(<SignUpPage />, { route: '/signup' });
    expect(
      screen.getByRole('heading', { name: 'Apply as an instructor' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument();
  });
});
