import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    // all three filter dropdowns render
    expect(screen.getAllByRole('combobox')).toHaveLength(3);
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});

interface ListRequest {
  q: string | null;
  status: string | null;
  active: string | null;
  calendarConnected: string | null;
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
        calendarConnected: params.get('calendarConnected'),
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
  screen.getAllByRole('combobox') as [HTMLElement, HTMLElement, HTMLElement];
const request = (overrides: Partial<ListRequest> = {}): ListRequest => ({
  q: null,
  status: null,
  active: null,
  calendarConnected: null,
  page: '1',
  limit: '50',
  ...overrides,
});

describe('AdminListPage calendar status', () => {
  const connected: AdminInstructorRecord = {
    ...lee,
    isActive: true,
    calendarConnected: true,
  };

  it('shows whether each instructor has a calendar in the table and the cards', async () => {
    serveInstructors([jane, connected]);
    renderPage();

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'Calendar' }),
    ).toBeInTheDocument();
    const janeRow = within(table).getByRole('row', { name: /Jane Snow/ });
    const leeRow = within(table).getByRole('row', { name: /Lee Ridge/ });
    expect(within(janeRow).getByText('Not connected')).toBeInTheDocument();
    expect(within(leeRow).getByText('Connected')).toBeInTheDocument();

    const [janeCard, leeCard] = screen
      .getAllByRole('link')
      .filter((link) => !table.contains(link));
    expect(janeCard).toHaveTextContent('Jane Snow');
    expect(within(janeCard!).getByText('Not connected')).toBeInTheDocument();
    expect(leeCard).toHaveTextContent('Lee Ridge');
    expect(within(leeCard!).getByText('Connected')).toBeInTheDocument();
  });

  it('shows the calendar status as a coloured pill like the Status column', async () => {
    serveInstructors([jane, connected]);
    renderPage();

    const table = await screen.findByRole('table');
    const notConnected = within(table).getByText('Not connected', {
      selector: '.text-status-pending',
    });
    const yes = within(table).getByText('Connected', {
      selector: '.text-status-approved',
    });
    expect(notConnected.parentElement).toHaveAttribute(
      'style',
      'border-color: var(--status-pending);',
    );
    expect(yes.parentElement).toHaveAttribute(
      'style',
      'border-color: var(--status-approved);',
    );
    expect(
      yes.parentElement!.querySelector('.rounded-full[aria-hidden]'),
    ).toHaveAttribute('style', 'background: var(--status-approved);');
    expect(
      screen.getAllByText('Connected', { selector: '.text-status-approved' }),
    ).toHaveLength(2);
    expect(
      screen.getAllByText('Not connected', {
        selector: '.text-status-pending',
      }),
    ).toHaveLength(2);
  });

  it('shows the calendar status in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveInstructors([jane, connected]);
    renderPage();

    const table = await screen.findByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: '日历' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('未连接', { ignore: 'option' })).toHaveLength(2);
    expect(screen.getAllByText('已连接', { ignore: 'option' })).toHaveLength(2);
  });

  it('filters by calendar connection and keeps it in the URL', async () => {
    serveInstructors([jane, connected]);
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('Showing 1–2 of 2')).toBeInTheDocument();

    const calendar = screen.getByRole('combobox', { name: 'Calendar' });
    expect(
      within(calendar)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['All', 'Connected', 'Not connected']);

    await user.selectOptions(calendar, 'true');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getAllByText('Lee Ridge').length).toBeGreaterThan(0);
    expect(screen.queryByText('Jane Snow')).not.toBeInTheDocument();
    expect(location()).toBe('?calendar=true');
    expect(requests.at(-1)).toEqual(request({ calendarConnected: 'true' }));

    await user.selectOptions(calendar, 'false');
    await waitFor(() => expect(location()).toBe('?calendar=false'));
    expect(requests.at(-1)).toEqual(request({ calendarConnected: 'false' }));
    expect(screen.getAllByText('Jane Snow').length).toBeGreaterThan(0);

    await user.selectOptions(calendar, '');
    expect(await screen.findByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(location()).toBe('');
    expect(requests.at(-1)).toEqual(request());
  });

  it('preselects the calendar filter from the URL', async () => {
    serveInstructors([jane, connected]);
    renderPage('/?calendar=false&page=1');

    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Calendar' })).toHaveValue(
      'false',
    );
    expect(requests).toEqual([request({ calendarConnected: 'false' })]);
  });

  it('shows the calendar filter in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveInstructors([jane, connected]);
    renderPage();

    const calendar = await screen.findByRole('combobox', { name: '日历' });
    expect(
      within(calendar)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['全部', '已连接', '未连接']);
  });
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
