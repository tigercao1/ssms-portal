import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { EditProfilePage } from './EditProfilePage';
import { renderWithProviders } from '@/test/render';

describe('EditProfilePage (W2.2)', () => {
  it('hydrates the form from the fetched profile', async () => {
    renderWithProviders(<EditProfilePage />);
    // display name input seeded from the API profile
    expect(await screen.findByDisplayValue('Jane Snow')).toBeInTheDocument();
    // section headings render
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Teaching')).toBeInTheDocument();
    // a teaching location option from /reference is offered
    expect(
      screen.getAllByRole('button', { name: 'Whistler' }).length,
    ).toBeGreaterThan(0);
  });
});
