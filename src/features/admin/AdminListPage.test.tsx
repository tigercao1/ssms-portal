import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { AdminListPage } from './AdminListPage';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, listAdminInstructors, server } from '@/test/msw';
import type { AdminInstructorRecord } from '@/lib/types';

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

interface ListRequest {
  q: string | null;
  status: string | null;
  active: string | null;
  page: string | null;
  limit: string | null;
}

let requests: ListRequest[] = [];

const jane = fakeAdminList[0] as AdminInstructorRecord;

function serveInstructors(
  instructors: AdminInstructorRecord[],
  { slowPages = [] as number[] } = {},
) {
  requests = [];
  server.use(
    http.get(`${API}/admin/instructors`, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push({
        q: params.get('q'),
        status: params.get('status'),
        active: params.get('active'),
        page: params.get('page'),
        limit: params.get('limit'),
      });
      if (slowPages.includes(Number(params.get('page')))) await delay(150);
      const { rows, total } = listAdminInstructors(instructors, params);
      return HttpResponse.json(rows, {
        headers: { 'X-Total-Count': String(total) },
      });
    }),
  );
}

function manyInstructors(
  count: number,
  overrides: Partial<AdminInstructorRecord> = {},
): AdminInstructorRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    ...jane,
    id: `inst-${i + 1}`,
    authUserId: `auth-${i + 1}`,
    email: `coach${i + 1}@example.com`,
    displayNameEn: `Coach ${i + 1}`,
    ...overrides,
  }));
}

const lee: AdminInstructorRecord = {
  ...jane,
  id: 'inst-lee',
  authUserId: 'auth-lee',
  email: 'lee@example.com',
  displayNameEn: 'Lee Ridge',
  approvalStatus: 'approved',
  isActive: false,
};

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function renderPage(route = '/') {
  return renderWithProviders(
    <>
      <AdminListPage />
      <LocationProbe />
    </>,
    { route },
  );
}

const location = () => screen.getByTestId('location').textContent;
const filters = () =>
  screen.getAllByRole('combobox') as [HTMLElement, HTMLElement];
const request = (overrides: Partial<ListRequest> = {}): ListRequest => ({
  q: null,
  status: null,
  active: null,
  page: '1',
  limit: '50',
  ...overrides,
});

describe('AdminListPage paging, search and URL state', () => {
  it('pages 50 at a time, keeping the previous page while the next loads', async () => {
    serveInstructors(manyInstructors(120), { slowPages: [2] });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Showing 1–50 of 120')).toBeInTheDocument();
    expect(screen.getAllByText('Coach 1')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(requests).toEqual([request()]);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('Coach 1').length).toBeGreaterThan(0);
    expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    expect(
      await screen.findByText('Showing 51–100 of 120'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Coach 1')).not.toBeInTheDocument();
    expect(screen.getAllByText('Coach 51').length).toBeGreaterThan(0);
    expect(location()).toBe('?page=2');
    expect(requests.at(-1)).toEqual(request({ page: '2' }));

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Showing 1–50 of 120')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('disables Next on the last page', async () => {
    serveInstructors(manyInstructors(120));
    renderPage('/?page=3');
    expect(
      await screen.findByText('Showing 101–120 of 120'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('restores the search, filters and page from the URL', async () => {
    serveInstructors([
      ...manyInstructors(60, { approvalStatus: 'approved', isActive: false }),
      lee,
    ]);
    renderPage('/?q=coach&status=approved&active=false&page=2');

    expect(await screen.findByText('Showing 51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('coach');
    const [status, active] = filters();
    expect(status).toHaveValue('approved');
    expect(active).toHaveValue('false');
    expect(requests).toEqual([
      request({ q: 'coach', status: 'approved', active: 'false', page: '2' }),
    ]);
  });

  it('puts filters in the URL and goes back to page 1 when one changes', async () => {
    serveInstructors([...manyInstructors(80), lee]);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(await screen.findByText('Showing 51–81 of 81')).toBeInTheDocument();

    const [status, active] = filters();
    await user.selectOptions(status, 'approved');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getAllByText('Lee Ridge').length).toBeGreaterThan(0);
    expect(location()).toBe('?status=approved');
    expect(requests.at(-1)).toEqual(request({ status: 'approved' }));

    await user.selectOptions(active, 'false');
    await waitFor(() =>
      expect(location()).toBe('?status=approved&active=false'),
    );
    expect(requests.at(-1)).toEqual(
      request({ status: 'approved', active: 'false' }),
    );

    await user.selectOptions(status, '');
    await user.selectOptions(active, '');
    expect(await screen.findByText('Showing 1–50 of 81')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('searches as you type after a short pause and goes back to page 1', async () => {
    serveInstructors([...manyInstructors(80), lee]);
    const user = userEvent.setup();
    renderPage('/?page=2&status=approved');
    expect(
      await screen.findAllByText('No instructors match these filters.'),
    ).toHaveLength(2);

    await user.type(screen.getByRole('searchbox'), 'ridge');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(location()).toBe('?status=approved&q=ridge');
    expect(requests.at(-1)).toEqual(
      request({ q: 'ridge', status: 'approved' }),
    );
  });

  it('searches on Enter without waiting for the pause', async () => {
    serveInstructors([...manyInstructors(80), lee]);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(await screen.findByText('Showing 51–81 of 81')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), '  lee@example {Enter}');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(location()).toBe('?q=lee%40example');
    expect(requests.filter((r) => r.q !== null)).toEqual([
      request({ q: 'lee@example' }),
    ]);
  });

  it('offers Previous when a page past the end comes back empty', async () => {
    serveInstructors(manyInstructors(3));
    const user = userEvent.setup();
    renderPage('/?page=4');
    expect(
      (await screen.findAllByText('No instructors match these filters.'))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('shows the empty state when nothing matches on the first page', async () => {
    serveInstructors([]);
    renderPage();
    expect(
      await screen.findByText('No instructors match these filters.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('falls back to the rows it has when the total header is missing', async () => {
    server.use(
      http.get(`${API}/admin/instructors`, () =>
        HttpResponse.json(fakeAdminList),
      ),
    );
    renderPage();
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
  });

  it('shows the API error when the list fails', async () => {
    server.use(
      http.get(`${API}/admin/instructors`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('shows the search and paging in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveInstructors(manyInstructors(1204));
    renderPage();
    expect(
      await screen.findByText('第 1–50 位，共 1,204 位'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: '按姓名或邮箱搜索' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '教练分页' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });
});
