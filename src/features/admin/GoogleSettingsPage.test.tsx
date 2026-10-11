import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { GoogleSettingsPage } from './GoogleSettingsPage';
import { renderWithProviders } from '@/test/render';
import { fakeGoogleCalendars, fakeGoogleStatus, server } from '@/test/msw';
import { navigateExternal } from '@/lib/navigation';
import type { GoogleCalendar, GoogleConnectionStatus } from '@/lib/types';

vi.mock('@/lib/navigation', () => ({ navigateExternal: vi.fn() }));

const API = 'http://localhost:3000';
const ROUTE = '/admin/settings/google';

const disconnectedStatus: GoogleConnectionStatus = {
  connected: false,
  accountEmail: null,
  scopes: [],
  connectedAt: null,
  lastError: null,
};

function serveGoogle({
  status = fakeGoogleStatus,
  calendars = fakeGoogleCalendars,
}: {
  status?: GoogleConnectionStatus;
  calendars?: GoogleCalendar[];
} = {}) {
  let current = status;
  const calls = { connect: 0, disconnect: 0, calendars: 0 };
  server.use(
    http.get(`${API}/admin/google/status`, () => HttpResponse.json(current)),
    http.get(`${API}/admin/google/calendars`, () => {
      calls.calendars += 1;
      return HttpResponse.json(calendars);
    }),
    http.get(`${API}/admin/google/connect`, () => {
      calls.connect += 1;
      return HttpResponse.json({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
      });
    }),
    http.post(`${API}/admin/google/disconnect`, () => {
      calls.disconnect += 1;
      current = disconnectedStatus;
      return HttpResponse.json({ disconnected: true });
    }),
  );
  return calls;
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderPage(route = ROUTE) {
  return renderWithProviders(
    <Routes>
      <Route
        path={ROUTE}
        element={
          <>
            <GoogleSettingsPage />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { route },
  );
}

beforeEach(() => {
  vi.mocked(navigateExternal).mockClear();
});

describe('GoogleSettingsPage when not connected', () => {
  it('shows the not-connected state and does not load calendars', async () => {
    const calls = serveGoogle({ status: disconnectedStatus });
    renderPage();

    expect(await screen.findByTestId('google-state')).toHaveTextContent(
      'Not connected',
    );
    expect(
      screen.getByText(/Google features stay off until an admin connects/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Disconnect' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(calls.calendars).toBe(0);
  });

  it('redirects the browser to the URL returned by connect', async () => {
    const calls = serveGoogle({ status: disconnectedStatus });
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Connect Google' }),
    );

    await waitFor(() =>
      expect(navigateExternal).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
      ),
    );
    expect(calls.connect).toBe(1);
  });

  it('shows an error and does not redirect when connect fails', async () => {
    serveGoogle({ status: disconnectedStatus });
    server.use(
      http.get(`${API}/admin/google/connect`, () =>
        HttpResponse.json(
          { message: 'Google is not configured' },
          { status: 503 },
        ),
      ),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Connect Google' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google is not configured',
    );
    expect(navigateExternal).not.toHaveBeenCalled();
  });
});

describe('GoogleSettingsPage when connected', () => {
  it('shows the account, permissions and connection time', async () => {
    serveGoogle();
    renderPage();

    expect(await screen.findByTestId('google-state')).toHaveTextContent(
      'Connected',
    );
    expect(
      screen.getAllByText('admin@ssnow.club', { selector: 'span' }),
    ).toHaveLength(1);
    for (const scope of fakeGoogleStatus.scopes) {
      expect(screen.getByText(scope)).toBeInTheDocument();
    }
    expect(screen.getByText('Connected at').nextSibling).toHaveTextContent(
      /2026/,
    );
    expect(
      screen.queryByRole('button', { name: 'Connect Google' }),
    ).not.toBeInTheDocument();
  });

  it('shows Unknown when the connection time is missing', async () => {
    serveGoogle({ status: { ...fakeGoogleStatus, connectedAt: null } });
    renderPage();

    expect(await screen.findByText('Unknown')).toBeInTheDocument();
  });

  it('shows the last error from the server', async () => {
    serveGoogle({
      status: { ...fakeGoogleStatus, lastError: 'invalid_grant' },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Last error');
    expect(alert).toHaveTextContent('invalid_grant');
  });

  it('lists calendars and flags the ones SSMS cannot write to', async () => {
    serveGoogle();
    renderPage();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);

    const rowFor = (name: string) =>
      rows.find((row) => within(row).queryByText(name))!;

    expect(
      within(rowFor('SSNOW Admin')).getByText('Owner'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('Jane Snow')).getByText('jane.snow@ssnow.club'),
    ).toBeInTheDocument();
    expect(within(rowFor('Jane Snow')).getByText('Writer')).toBeInTheDocument();
    expect(within(rowFor('Li Wei')).getByText('Reader')).toBeInTheDocument();
    expect(
      within(rowFor('Sam Ski')).getByText('Free/busy only'),
    ).toBeInTheDocument();

    for (const name of ['SSNOW Admin', 'Jane Snow']) {
      expect(
        within(rowFor(name)).queryByText('Can’t add events'),
      ).not.toBeInTheDocument();
    }
    for (const name of ['Li Wei', 'Sam Ski']) {
      expect(
        within(rowFor(name)).getByText('Can’t add events'),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(/2 calendars are shared without write access/),
    ).toBeInTheDocument();
  });

  it('omits the write-access summary when every calendar is writable', async () => {
    serveGoogle({
      calendars: fakeGoogleCalendars.filter((c) =>
        ['owner', 'writer'].includes(c.accessRole),
      ),
    });
    renderPage();

    await screen.findByRole('table');
    expect(screen.queryByText(/without write access/)).not.toBeInTheDocument();
    expect(screen.queryByText('Can’t add events')).not.toBeInTheDocument();
  });

  it('shows an empty message when no calendars are shared', async () => {
    serveGoogle({ calendars: [] });
    renderPage();

    expect(
      await screen.findByText('No calendars are shared with this account yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error when calendars cannot be loaded', async () => {
    serveGoogle();
    server.use(
      http.get(`${API}/admin/google/calendars`, () =>
        HttpResponse.json({ message: 'Google unavailable' }, { status: 502 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google unavailable',
    );
  });
});

describe('GoogleSettingsPage disconnect', () => {
  it('asks for confirmation and does nothing on cancel', async () => {
    const calls = serveGoogle();
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Disconnect' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Disconnect Google Calendar?',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.disconnect).toBe(0);
    expect(screen.getByTestId('google-state')).toHaveTextContent('Connected');
  });

  it('disconnects after confirming and returns to the not-connected state', async () => {
    const calls = serveGoogle();
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Disconnect' }),
    );
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Disconnect' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('google-state')).toHaveTextContent(
        'Not connected',
      ),
    );
    expect(calls.disconnect).toBe(1);
    expect(
      screen.getByText('Google Calendar disconnected.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Connect Google' }),
    ).toBeInTheDocument();
  });

  it('keeps the dialog open with the error when disconnect fails', async () => {
    serveGoogle();
    server.use(
      http.post(`${API}/admin/google/disconnect`, () =>
        HttpResponse.json({ message: 'Revoke failed' }, { status: 502 }),
      ),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Disconnect' }),
    );
    const dialog = screen.getByRole('alertdialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Disconnect' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Revoke failed',
    );
    expect(screen.getByTestId('google-state')).toHaveTextContent('Connected');
  });
});

describe('GoogleSettingsPage return from Google', () => {
  it('shows a success banner for ?connected=1 and clears it on dismiss', async () => {
    serveGoogle();
    renderPage(`${ROUTE}?connected=1`);

    expect(
      await screen.findByText('Google Calendar connected'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(
      screen.queryByText('Google Calendar connected'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('');
  });

  it.each([
    ['wrong_account', 'That Google account isn’t allowed'],
    ['missing_scopes', 'Not every permission was granted'],
    ['invalid_state', 'The connect link expired or was invalid'],
    ['access_denied', 'Access was declined'],
    ['exchange_failed', 'Google didn’t complete the sign-in'],
  ])('explains ?error=%s', async (code, text) => {
    serveGoogle({ status: disconnectedStatus });
    renderPage(`${ROUTE}?error=${code}`);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Google Calendar was not connected');
    expect(alert).toHaveTextContent(text);
  });

  it('shows the code for an unrecognised error', async () => {
    serveGoogle({ status: disconnectedStatus });
    renderPage(`${ROUTE}?error=server_exploded`);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google returned an error (server_exploded)',
    );
  });

  it('shows no banner without return params', async () => {
    serveGoogle();
    renderPage();

    await screen.findByTestId('google-state');
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument();
  });
});

describe('GoogleSettingsPage status errors', () => {
  it('shows an error when the status cannot be loaded', async () => {
    server.use(
      http.get(`${API}/admin/google/status`, () =>
        HttpResponse.json({ message: 'Status unavailable' }, { status: 503 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Status unavailable',
    );
  });
});
