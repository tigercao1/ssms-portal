import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { AdminListPage } from './AdminListPage';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, listAdminInstructors, server } from '@/test/msw';
import type { AdminInstructorRecord, InstructorStage } from '@/lib/types';

const API = 'http://localhost:3000';

describe('AdminListPage (W2.7)', () => {
  it('renders instructor rows from the API', async () => {
    renderWithProviders(<AdminListPage />);
    // Both responsive variants (desktop table + mobile cards) render in jsdom
    // since CSS isn't applied, so the name/email appear twice.
    expect((await screen.findAllByText('Jane Snow')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

interface ListRequest {
  q: string | null;
  status: string | null;
  stage: string[];
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
        stage: params.getAll('stage'),
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
  isActive: true,
  stage: 'going_live',
};

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function setPopoverViewport(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => setPopoverViewport(true));
afterEach(() => vi.unstubAllGlobals());

async function openFilters(
  user: ReturnType<typeof userEvent.setup>,
  group: string,
  trigger = 'Filters',
) {
  await user.click(screen.getByRole('button', { name: trigger }));
  return within(await screen.findByRole('dialog')).getByRole('group', {
    name: group,
  });
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
const request = (overrides: Partial<ListRequest> = {}): ListRequest => ({
  q: null,
  status: null,
  stage: [],
  active: null,
  calendarConnected: null,
  page: '1',
  limit: '50',
  ...overrides,
});

describe('AdminListPage calendar status', () => {
  const connected: AdminInstructorRecord = {
    ...lee,
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

    const calendar = await openFilters(user, 'Calendar');
    expect(
      within(calendar)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(['Connected', 'Not connected']);

    await user.click(within(calendar).getByLabelText('Connected'));
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getAllByText('Lee Ridge').length).toBeGreaterThan(0);
    expect(screen.queryByText('Jane Snow')).not.toBeInTheDocument();
    expect(location()).toBe('?calendar=true');
    expect(requests.at(-1)).toEqual(request({ calendarConnected: 'true' }));

    await user.click(within(calendar).getByLabelText('Not connected'));
    await waitFor(() => expect(location()).toBe('?calendar=false'));
    expect(within(calendar).getByLabelText('Connected')).not.toBeChecked();
    expect(requests.at(-1)).toEqual(request({ calendarConnected: 'false' }));

    await user.click(within(calendar).getByLabelText('Not connected'));
    expect(await screen.findByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(location()).toBe('');
    expect(requests.at(-1)).toEqual(request());
  });

  it('preselects the calendar filter from the URL', async () => {
    serveInstructors([jane, connected]);
    const user = userEvent.setup();
    renderPage('/?calendar=false&page=1');

    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(requests).toEqual([request({ calendarConnected: 'false' })]);
    expect(
      screen.getByRole('button', {
        name: 'Remove filter: Calendar: Not connected',
      }),
    ).toBeInTheDocument();
    const calendar = await openFilters(user, 'Calendar', 'Filters, 1 applied');
    expect(within(calendar).getByLabelText('Not connected')).toBeChecked();
  });

  it('shows the calendar filter in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveInstructors([jane, connected]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('第 1–2 位，共 2 位');

    const calendar = await openFilters(user, '日历', '筛选');
    expect(
      within(calendar)
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual(['已连接', '未连接']);
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
      ...manyInstructors(60, {
        approvalStatus: 'approved',
        isActive: false,
        stage: 'deactivated',
      }),
      lee,
    ]);
    const user = userEvent.setup();
    renderPage('/?q=coach&stage=deactivated&calendar=false&page=2');

    expect(await screen.findByText('Showing 51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('coach');
    expect(
      screen.getByRole('button', { name: 'Filters, 2 applied' }),
    ).toBeInTheDocument();
    expect(requests).toEqual([
      request({
        q: 'coach',
        stage: ['deactivated'],
        calendarConnected: 'false',
        page: '2',
      }),
    ]);
    const status = await openFilters(user, 'Status', 'Filters, 2 applied');
    expect(within(status).getByLabelText('Inactive')).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'Calendar' })).getByLabelText(
        'Not connected',
      ),
    ).toBeChecked();
  });

  it('ignores the old account filter in a bookmarked URL and drops it on the next change', async () => {
    serveInstructors([
      ...manyInstructors(3, { isActive: false, stage: 'deactivated' }),
      lee,
    ]);
    const user = userEvent.setup();
    renderPage('/?active=false&stage=going_live');

    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(requests).toEqual([request({ stage: ['going_live'] })]);
    expect(
      within(screen.getByRole('list', { name: 'Applied filters' }))
        .getAllByRole('button', { name: /^Remove filter/ })
        .map((chip) => chip.getAttribute('aria-label')),
    ).toEqual(['Remove filter: Status: Going live']);

    const status = await openFilters(user, 'Status', 'Filters, 1 applied');
    await user.click(within(status).getByLabelText('Inactive'));
    expect(await screen.findByText('Showing 1–4 of 4')).toBeInTheDocument();
    expect(location()).toBe('?stage=deactivated&stage=going_live');
    expect(requests.at(-1)).toEqual(
      request({ stage: ['deactivated', 'going_live'] }),
    );
  });

  it('puts filters in the URL and goes back to page 1 when one changes', async () => {
    serveInstructors([...manyInstructors(80), lee]);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(await screen.findByText('Showing 51–81 of 81')).toBeInTheDocument();

    const status = await openFilters(user, 'Status');
    await user.click(within(status).getByLabelText('Going live'));
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getAllByText('Lee Ridge').length).toBeGreaterThan(0);
    expect(location()).toBe('?stage=going_live');
    expect(requests.at(-1)).toEqual(request({ stage: ['going_live'] }));

    const calendar = screen.getByRole('group', { name: 'Calendar' });
    await user.click(within(calendar).getByLabelText('Not connected'));
    await waitFor(() =>
      expect(location()).toBe('?stage=going_live&calendar=false'),
    );
    expect(requests.at(-1)).toEqual(
      request({ stage: ['going_live'], calendarConnected: 'false' }),
    );

    await user.click(within(status).getByLabelText('Going live'));
    await user.click(within(calendar).getByLabelText('Not connected'));
    expect(await screen.findByText('Showing 1–50 of 81')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('searches as you type after a short pause and goes back to page 1', async () => {
    serveInstructors([...manyInstructors(80), lee]);
    const user = userEvent.setup();
    renderPage('/?page=2&stage=going_live');
    expect(
      await screen.findAllByText('No instructors match these filters.'),
    ).toHaveLength(2);

    await user.type(screen.getByRole('searchbox'), 'ridge');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(location()).toBe('?stage=going_live&q=ridge');
    expect(requests.at(-1)).toEqual(
      request({ q: 'ridge', stage: ['going_live'] }),
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

describe('AdminListPage stages and the Filters popover', () => {
  const stageRow = (
    n: number,
    stage: InstructorStage,
    overrides: Partial<AdminInstructorRecord> = {},
  ): AdminInstructorRecord => ({
    ...jane,
    id: `inst-${stage}-${n}`,
    authUserId: `auth-${stage}-${n}`,
    email: `${stage}${n}@example.com`,
    displayNameEn: `${stage} ${n}`,
    stage,
    ...overrides,
  });
  const roster = [
    stageRow(1, 'pending'),
    stageRow(1, 'rejected', { approvalStatus: 'rejected' }),
    stageRow(1, 'deactivated', { isActive: false }),
    stageRow(1, 'onboarding', { approvalStatus: 'approved' }),
    stageRow(1, 'in_review', { approvalStatus: 'approved' }),
    stageRow(2, 'in_review', { approvalStatus: 'approved' }),
    stageRow(1, 'going_live', { approvalStatus: 'approved' }),
    stageRow(1, 'live', {
      approvalStatus: 'approved',
      calendarConnected: true,
    }),
  ];

  it('shows each row with its stage pill in the stage colour', async () => {
    serveInstructors(roster);
    renderPage();
    const table = await screen.findByRole('table');
    const pill = (name: string) =>
      within(within(table).getByRole('row', { name: new RegExp(`^${name} `) }))
        .getAllByText(/./)
        .find((el) => el.className.startsWith('text-'));

    expect(pill('pending 1')).toHaveTextContent('Pending');
    expect(pill('pending 1')).toHaveClass('text-status-pending');
    expect(pill('deactivated 1')).toHaveTextContent('Inactive');
    expect(pill('deactivated 1')).toHaveClass('text-status-inactive');
    expect(pill('onboarding 1')).toHaveTextContent('Onboarding');
    expect(pill('in_review 1')).toHaveTextContent('In review');
    expect(pill('going_live 1')).toHaveTextContent('Going live');
    expect(pill('going_live 1')).toHaveClass('text-navy');
    expect(pill('live 1')).toHaveTextContent('Live');
    expect(pill('live 1')).toHaveClass('text-status-live-ink');
  });

  it('shows a deactivated pending instructor as Inactive without a stage', async () => {
    serveInstructors([{ ...jane, isActive: false, stage: null }]);
    renderPage();
    const table = await screen.findByRole('table');
    expect(
      within(table).getByText('Inactive', {
        selector: '.text-status-inactive',
      }),
    ).toBeInTheDocument();
    expect(within(table).queryByText('Pending')).not.toBeInTheDocument();
  });

  it('groups every stage and calendar option in one popover', async () => {
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Showing 1–8 of 8');

    const trigger = screen.getByRole('button', { name: 'Filters' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', dialog.id);
    const labels = (group: string) =>
      within(within(dialog).getByRole('group', { name: group }))
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent);
    expect(labels('Status')).toEqual([
      'Pending',
      'Rejected',
      'Inactive',
      'Onboarding',
      'In review',
      'Going live',
      'Live',
    ]);
    expect(labels('Calendar')).toEqual(['Connected', 'Not connected']);
    expect(
      within(dialog)
        .getAllByRole('group')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual(['Status', 'Calendar']);
    await waitFor(() =>
      expect(within(dialog).getAllByRole('checkbox')[0]).toHaveFocus(),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Clear all' }),
    ).toBeDisabled();
  });

  it('filters by several stages, echoes them as chips and counts them on the button', async () => {
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Showing 1–8 of 8');

    const status = await openFilters(user, 'Status');
    await user.click(within(status).getByLabelText('In review'));
    await user.click(within(status).getByLabelText('Pending'));

    expect(await screen.findByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(location()).toBe('?stage=pending&stage=in_review');
    expect(requests.at(-1)).toEqual(
      request({ stage: ['pending', 'in_review'] }),
    );
    expect(
      screen.getByRole('button', { name: 'Filters, 2 applied' }),
    ).toHaveTextContent('2');
    const chips = screen.getByRole('list', { name: 'Applied filters' });
    expect(
      within(chips)
        .getAllByRole('button', { name: /^Remove filter/ })
        .map((chip) => chip.getAttribute('aria-label')),
    ).toEqual([
      'Remove filter: Status: Pending',
      'Remove filter: Status: In review',
    ]);
  });

  it('removes one filter from its chip and clears the rest with Clear all', async () => {
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage('/?stage=in_review&stage=live&calendar=true&page=1');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(requests.at(-1)).toEqual(
      request({ stage: ['in_review', 'live'], calendarConnected: 'true' }),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'Remove filter: Calendar: Connected',
      }),
    );
    expect(await screen.findByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(location()).toBe('?stage=in_review&stage=live');

    const chips = screen.getByRole('list', { name: 'Applied filters' });
    await user.click(within(chips).getByRole('button', { name: 'Clear all' }));
    expect(await screen.findByText('Showing 1–8 of 8')).toBeInTheDocument();
    expect(location()).toBe('');
    expect(
      screen.queryByRole('list', { name: 'Applied filters' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument();
  });

  it('clears every filter from inside the popover', async () => {
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage('/?stage=live&calendar=true');
    await screen.findByText('Showing 1–1 of 1');

    await user.click(
      screen.getByRole('button', { name: 'Filters, 2 applied' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    await user.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    expect(await screen.findByText('Showing 1–8 of 8')).toBeInTheDocument();
    expect(location()).toBe('');
    for (const box of within(dialog).getAllByRole('checkbox'))
      expect(box).not.toBeChecked();
  });

  it('closes on Escape back to the button, and on a click outside', async () => {
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Showing 1–8 of 8');
    const trigger = screen.getByRole('button', { name: 'Filters' });

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('heading', { name: 'Instructors' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ignores unknown stages in the URL', async () => {
    serveInstructors(roster);
    renderPage('/?stage=published&stage=live,held');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(requests).toEqual([request({ stage: ['live'] })]);
  });

  it('opens the filters as a full-screen sheet on phones', async () => {
    setPopoverViewport(false);
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Showing 1–8 of 8');

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const sheet = screen.getByRole('dialog', { name: 'Filters' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveClass('w-full');
    expect(sheet).not.toHaveClass('w-[min(580px,100vw)]');
    expect(screen.getByTestId('drawer-scrim')).toBeInTheDocument();
    await user.click(
      within(
        within(sheet).getByRole('group', { name: 'Status' }),
      ).getByLabelText('Live'),
    );
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(location()).toBe('?stage=live');

    await user.click(
      within(sheet).getByRole('button', { name: 'Show results' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Filters, 1 applied' }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Filters, 1 applied' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Clear all',
      }),
    );
    expect(await screen.findByText('Showing 1–8 of 8')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the filters, stages and chips in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveInstructors(roster);
    const user = userEvent.setup();
    renderPage('/?stage=in_review&calendar=false');
    await screen.findByText('第 1–2 位，共 2 位');

    expect(
      screen.getByRole('button', { name: '移除筛选：状态：审核中' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '移除筛选：日历：未连接' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '筛选，已选 2 项' }));
    const dialog = screen.getByRole('dialog', { name: '筛选' });
    expect(
      within(within(dialog).getByRole('group', { name: '状态' }))
        .getAllByRole('checkbox')
        .map((box) => box.closest('label')?.textContent),
    ).toEqual([
      '待审核',
      '已拒绝',
      '已停用',
      '入职中',
      '审核中',
      '上线中',
      '已上线',
    ]);
    expect(
      within(dialog)
        .getAllByRole('group')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual(['状态', '日历']);
    expect(
      within(dialog).getByRole('button', { name: '全部清除' }),
    ).toBeEnabled();
  });
});
