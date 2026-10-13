import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { AdminListPage } from './AdminListPage';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';

const API = 'http://localhost:3000';

describe('AdminListPage (W2.7)', () => {
  it('renders instructor rows from the API', async () => {
    renderWithProviders(<AdminListPage />);
    // Both responsive variants (desktop table + mobile cards) render in jsdom
    // since CSS isn't applied, so the name/email appear twice.
    expect((await screen.findAllByText('Jane Snow')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    // both filter dropdowns render
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('suggests calendar matches and shows how many were saved', async () => {
    let calls = 0;
    server.use(
      http.post(`${API}/admin/instructor-calendars/suggest`, () => {
        calls += 1;
        return HttpResponse.json({
          suggested: 2,
          overview: { google: { connected: true, error: null }, instructors: [] },
        });
      }),
    );
    renderWithProviders(<AdminListPage />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Suggest calendar matches' }),
    );

    expect(
      await screen.findByText(
        '2 calendar suggestions saved. Review them on each instructor.',
      ),
    ).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('explains when suggesting calendar matches fails', async () => {
    server.use(
      http.post(`${API}/admin/instructor-calendars/suggest`, () =>
        HttpResponse.json(
          { message: 'Google Calendar is not connected' },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<AdminListPage />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Suggest calendar matches' }),
    );

    expect(
      await screen.findByText('Could not suggest calendar matches'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Google Calendar is not connected'),
    ).toBeInTheDocument();
  });
});
