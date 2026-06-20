import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AdminListPage } from './AdminListPage';
import { renderWithProviders } from '@/test/render';

describe('AdminListPage (W2.7)', () => {
  it('renders instructor rows from the API', async () => {
    renderWithProviders(<AdminListPage />);
    // Both responsive variants (desktop table + mobile cards) render in jsdom
    // since CSS isn't applied, so the name/email appear twice.
    expect((await screen.findAllByText('Jane Snow')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    // both filter dropdowns render
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});
