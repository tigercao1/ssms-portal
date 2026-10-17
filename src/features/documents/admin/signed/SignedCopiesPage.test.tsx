import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../../api/handlers';
import { fakeDocumentExport, fakeRoster } from '../../api/fixtures';
import { SignedCopiesPage } from './SignedCopiesPage';

const API = 'http://localhost:3000';

let state: DocumentsMockState;
let listUrls: URL[];
let exportPolls: string[];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderPage(id = 'tpl-conduct', search = '') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/admin/documents/:id/signed"
        element={
          <>
            <SignedCopiesPage />
            <LocationProbe />
          </>
        }
      />
    </Routes>,
    { route: `/admin/documents/${id}/signed${search}` },
  );
}

function search() {
  return new URLSearchParams(screen.getByTestId('location').textContent ?? '');
}

function tableRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

function tableRow(name: string) {
  const row = tableRows().find((r) => within(r).queryAllByText(name).length);
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

function pageRequests() {
  return listUrls.filter((u) => u.searchParams.get('limit') === '50');
}

beforeEach(() => {
  state = createDocumentsState();
  const roster = fakeRoster('tpl-conduct', 60, { completeEvery: 2 });
  Object.assign(state.instructors, roster.instructors);
  state.assignments.push(...roster.assignments);
  listUrls = [];
  exportPolls = [];
  server.use(
    http.get(
      `${API}/admin/documents/templates/:id/assignments`,
      ({ request }) => {
        listUrls.push(new URL(request.url));
        return undefined;
      },
    ),
    http.get(`${API}/admin/documents/exports/:exportId`, ({ params }) => {
      exportPolls.push(String(params.exportId));
      return undefined;
    }),
    ...documentsHandlers(state),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SignedCopiesPage', () => {
  it('shows the template header, a back link and a page of assignments', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Code of conduct' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /All documents/ })).toHaveAttribute(
      'href',
      '/admin/documents',
    );
    await screen.findByRole('table');
    expect(tableRows()).toHaveLength(50);
    const first = tableRow('Jane Snow');
    expect(within(first).getByText('jane@example.com')).toBeInTheDocument();
    expect(within(first).getByText('Completed')).toBeInTheDocument();
    expect(within(first).getByText('b7e4d2a1b7e4…')).toBeInTheDocument();
    expect(screen.getByText('Showing 1–50 of 61')).toBeInTheDocument();
    const request = pageRequests()[0]!;
    expect(request.pathname).toBe(
      '/admin/documents/templates/tpl-conduct/assignments',
    );
    expect(Object.fromEntries(request.searchParams)).toEqual({
      page: '1',
      limit: '50',
    });
  });

  it('pages with the URL and keeps the previous page while loading', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(search().get('page')).toBe('2'));
    await waitFor(() => expect(tableRows()).toHaveLength(11));
    expect(pageRequests().at(-1)!.searchParams.get('page')).toBe('2');
    expect(screen.getByText('Showing 51–61 of 61')).toBeInTheDocument();
  });

  it('filters by season, status and search, and keeps them in the URL', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Season'), '2026/27');
    await waitFor(() => expect(search().get('season')).toBe('2026/27'));
    await user.selectOptions(screen.getByLabelText('Status'), 'open');
    await waitFor(() => expect(search().get('status')).toBe('open'));
    await user.type(screen.getByLabelText('Name or email'), 'farah');
    await waitFor(() => expect(search().get('q')).toBe('farah'));

    await waitFor(() =>
      expect(Object.fromEntries(pageRequests().at(-1)!.searchParams)).toEqual({
        page: '1',
        limit: '50',
        season: '2026/27',
        status: 'open',
        q: 'farah',
      }),
    );
    await waitFor(() =>
      expect(tableRows().every((r) => within(r).queryByText(/^Farah /))).toBe(
        true,
      ),
    );
    expect(
      within(tableRows()[0]!).queryByRole('button', { name: /Download/ }),
    ).toBeNull();

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    await waitFor(() => expect(search().has('status')).toBe(false));
  });

  it('reads filters from the URL', async () => {
    renderPage(
      'tpl-conduct',
      '?season=2025%2F26&status=completed&q=zzz&page=1',
    );
    await screen.findByText('Nobody matches these filters.');
    expect(Object.fromEntries(pageRequests()[0]!.searchParams)).toEqual({
      page: '1',
      limit: '50',
      season: '2025/26',
      status: 'completed',
      q: 'zzz',
    });
    expect(screen.getByLabelText('Season')).toHaveValue('2025/26');
    expect(screen.getByLabelText('Status')).toHaveValue('completed');
  });

  it('downloads one signed copy through the admin signed-url request', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    await user.click(
      within(tableRow('Jane Snow')).getByRole('button', {
        name: 'Download the signed copy for Jane Snow',
      }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://storage.mock/signed/asg-conduct.pdf?sig=mock',
      ),
    );
  });

  it('reports a failed single download', async () => {
    server.use(
      http.get(`${API}/admin/documents/assignments/:id/signed-url`, () =>
        HttpResponse.json({ message: 'Signed copy missing' }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    const row = tableRow('Jane Snow');
    await user.click(within(row).getByRole('button', { name: /Download/ }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(
      'Could not download the signed copy: Signed copy missing',
    );
  });

  it('only lets completed signed copies be selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table');
    const open = tableRows().find((r) => within(r).queryByText('Assigned'))!;
    expect(within(open).getByRole('checkbox')).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Select every signed copy on this page',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Export selected (31)' }),
    ).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(
      screen.getByRole('button', { name: 'Export selected (0)' }),
    ).toBeDisabled();
  });

  it('shows a 404 for an unknown template', async () => {
    renderPage('tpl-missing');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  });

  it('hides selection, downloads and export for a read template', async () => {
    renderPage('tpl-handbook');
    expect(
      await screen.findByRole('heading', { name: 'Instructor handbook' }),
    ).toBeInTheDocument();
    await screen.findByRole('table');
    expect(screen.getByText('Acknowledgements')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
    expect(screen.queryByText('Export signed copies')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Export/ })).toBeNull();
    expect(
      within(screen.getByRole('table')).getByText('Acknowledged by'),
    ).toBeInTheDocument();
  });

  it('shows the empty state when nobody is assigned', async () => {
    state.assignments = [];
    renderPage();
    expect(
      await screen.findByText('This document is not assigned to anyone yet.'),
    ).toBeInTheDocument();
  });
});

describe('Export panel', () => {
  it('counts every signed copy for the season filter', async () => {
    renderPage('tpl-conduct', '?season=2026%2F27');
    expect(
      await screen.findByRole('button', { name: 'Export all signed (31)' }),
    ).toBeEnabled();
    const count = listUrls.find((u) => u.searchParams.get('limit') === '1')!;
    expect(Object.fromEntries(count.searchParams)).toEqual({
      page: '1',
      limit: '1',
      season: '2026/27',
      status: 'completed',
      hasSignedCopy: 'true',
    });
    expect(screen.getByText('For season 2026/27.')).toBeInTheDocument();
  });

  it('exports the selection, polls every 2 s until ready, then downloads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    });
    state.exportSteps = ['queued', 'running', 'ready'];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage('tpl-conduct', '?season=2026%2F27');
    await screen.findByRole('table');
    await user.click(
      within(tableRow('Jane Snow')).getByRole('checkbox', {
        name: 'Select Jane Snow',
      }),
    );
    const second = tableRows()[1]!;
    await user.click(within(second).getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Export selected (2)' }),
    );

    await waitFor(() =>
      expect(state.exportBodies).toEqual([
        {
          season: '2026/27',
          assignmentIds: ['asg-conduct', 'asg-tpl-conduct-53'],
        },
      ]),
    );
    const item = await screen.findByRole('listitem', { name: /^Requested/ });
    expect(within(item).getByText('2 selected · 2026/27')).toBeInTheDocument();
    expect(
      await within(item).findByText('Waiting for another export to finish…'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export selected (0)' }),
    ).toBeDisabled();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(await within(item).findByText('Building the ZIP…')).toBeVisible();
    expect(within(item).getByText('Building')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(await within(item).findByText('Ready')).toBeInTheDocument();
    expect(within(item).getByText(/^2 files · 352 KB/)).toBeInTheDocument();
    const polls = exportPolls.length;
    expect(polls).toBe(3);

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(exportPolls).toHaveLength(polls);

    await user.click(within(item).getByRole('button', { name: /Download/ }));
    const id = state.exports[0]!.id;
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        `https://storage.mock/exports/${id}.zip?sig=mock`,
      ),
    );
  });

  it('exports all signed copies for the season and stops polling on failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    state.exportSteps = ['running', 'failed'];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage('tpl-conduct', '?season=2026%2F27');
    await user.click(
      await screen.findByRole('button', { name: 'Export all signed (31)' }),
    );
    await waitFor(() =>
      expect(state.exportBodies).toEqual([{ season: '2026/27' }]),
    );
    const item = await screen.findByRole('listitem', { name: /^Requested/ });
    expect(within(item).getByText('All signed · 2026/27')).toBeInTheDocument();
    expect(await within(item).findByText('Building the ZIP…')).toBeVisible();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(
      await within(item).findByText('Export failed: Storage upload failed'),
    ).toBeInTheDocument();
    expect(within(item).queryByRole('button')).toBeNull();
    const polls = exportPolls.length;
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(exportPolls).toHaveLength(polls);
  });

  it('sends no season when exporting across all seasons', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Export all signed (31)' }),
    );
    await waitFor(() => expect(state.exportBodies).toEqual([{}]));
    expect(screen.getByText('For all seasons.')).toBeInTheDocument();
  });

  it('lists recent exports and does not poll finished ones', async () => {
    state.exports = [
      fakeDocumentExport({
        id: 'exp-ready',
        status: 'ready',
        fileCount: 12,
        skippedCount: 2,
        sizeBytes: 3 * 1024 * 1024,
        requestedAt: '2026-10-17T15:00:00Z',
        finishedAt: '2026-10-17T15:01:00Z',
        expiresAt: '2026-10-18T15:01:00Z',
      }),
      fakeDocumentExport({
        id: 'exp-expired',
        status: 'expired',
        selectedCount: 3,
        requestedAt: '2026-10-15T15:00:00Z',
      }),
      fakeDocumentExport({
        id: 'exp-failed',
        status: 'failed',
        error: null,
        season: null,
        requestedAt: '2026-10-14T15:00:00Z',
      }),
    ];
    renderPage();
    const items = await screen.findAllByRole('listitem', {
      name: /^Requested/,
    });
    expect(items).toHaveLength(3);
    expect(
      within(items[0]!).getByText(
        /^12 files · 3 MB · 2 skipped, listed in manifest.csv · Available until/,
      ),
    ).toBeInTheDocument();
    expect(within(items[1]!).getByText('3 selected · 2026/27')).toBeVisible();
    expect(
      within(items[1]!).getByText(
        'The ZIP was deleted after 24 hours. Export again for a new one.',
      ),
    ).toBeInTheDocument();
    expect(within(items[2]!).getByText('All signed')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Export failed.')).toBeInTheDocument();
    expect(exportPolls).toEqual([]);
  });

  it('reports an expired ZIP on download', async () => {
    state.exports = [fakeDocumentExport({ id: 'exp-ready', status: 'ready' })];
    server.use(
      http.get(`${API}/admin/documents/exports/:exportId/url`, () =>
        HttpResponse.json(
          { message: 'This export has expired' },
          { status: 410 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    const item = await screen.findByRole('listitem', { name: /^Requested/ });
    await user.click(within(item).getByRole('button', { name: /Download/ }));
    expect(await within(item).findByRole('alert')).toHaveTextContent(
      'Could not download the ZIP: This export has expired',
    );
  });

  it('shows the API reason when an export is rejected', async () => {
    server.use(
      http.post(`${API}/admin/documents/templates/:id/exports`, () =>
        HttpResponse.json(
          { message: 'Nothing signed matches' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Export all signed (31)' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the export: Nothing signed matches',
    );
  });

  it('blocks exporting more than 1,000 files', async () => {
    const big = fakeRoster('tpl-conduct', 2001, { completeEvery: 2 });
    state.assignments = big.assignments;
    state.instructors = big.instructors;
    renderPage();
    const all = await screen.findByRole('button', {
      name: 'Export all signed (1001)',
    });
    expect(all).toBeDisabled();
    expect(
      screen.getByText(
        'An export holds at most 1000 files. Pick a season or select fewer.',
      ),
    ).toBeInTheDocument();
  });

  it('counts only completed assignments that have a signed copy', async () => {
    for (const a of state.assignments) a.hasSignedCopy = false;
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Export all signed (0)' }),
    ).toBeDisabled();
    expect(
      await screen.findByText('Nothing signed to export yet.'),
    ).toBeVisible();
  });

  it('allows export all when only a few of many completed rows are signed', async () => {
    const big = fakeRoster('tpl-conduct', 2001, { completeEvery: 2 });
    state.assignments = big.assignments;
    state.instructors = big.instructors;
    for (const a of state.assignments.slice(1)) a.hasSignedCopy = false;
    renderPage();
    const all = await screen.findByRole('button', {
      name: 'Export all signed (1)',
    });
    expect(all).toBeEnabled();
    expect(
      screen.queryByText(
        'An export holds at most 1000 files. Pick a season or select fewer.',
      ),
    ).not.toBeInTheDocument();
    await userEvent.click(all);
    await waitFor(() => expect(state.exports).toHaveLength(1));
  });

  it('disables export all when nothing is signed', async () => {
    state.assignments = state.assignments.filter(
      (a) => a.status !== 'completed',
    );
    renderPage();
    expect(
      await screen.findByRole('button', { name: 'Export all signed (0)' }),
    ).toBeDisabled();
    expect(
      await screen.findByText('Nothing signed to export yet.'),
    ).toBeVisible();
  });
});
