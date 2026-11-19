import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { RequireAdmin } from '@/app/router/guards';
import { BugReportsPage } from './BugReportsPage';
import {
  adminBugReportHandlers,
  createBugReportsState,
  fakeBugReports,
  type BugReportsMockState,
} from './fixtures';

const session = vi.hoisted(() => ({ isAdmin: true, userId: 'auth-1' }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: session.isAdmin,
    loading: false,
    user: { id: session.userId },
  }),
}));

let state: BugReportsMockState;

beforeEach(() => {
  session.isAdmin = true;
  session.userId = 'auth-1';
  state = createBugReportsState();
  server.use(...adminBugReportHandlers(state));
});

function renderPage(route = '/admin/bug-reports') {
  const user = userEvent.setup();
  renderWithProviders(
    <Routes>
      <Route
        path="/admin/bug-reports"
        element={
          <RequireAdmin>
            <BugReportsPage />
          </RequireAdmin>
        }
      />
      <Route path="/" element={<p>Home page</p>} />
      <Route path="/profile/edit" element={<p>Edit profile page</p>} />
    </Routes>,
    { route },
  );
  return user;
}

async function rows(name = 'Bug reports') {
  const list = await screen.findByRole('list', { name });
  return within(list).getAllByRole('button');
}

async function openReport(
  user: ReturnType<typeof userEvent.setup>,
  text: RegExp,
) {
  await user.click(await screen.findByRole('button', { name: text }));
  return screen.getByRole('dialog', { name: 'Bug report' });
}

describe('bug reports list', () => {
  it('lists reports newest first with severity, reporter, role, Toronto time, page and a screenshot marker', async () => {
    renderPage();
    const [first, second, third] = (await rows()) as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(first).toHaveTextContent(
      "Can't continue" +
        'New' +
        'The Save button on my profile spins forever after I change my bio.' +
        'Jane Snow · Instructor' +
        'Nov 18, 2026, 06:30 p.m.' +
        '/profile/edit?tab',
    );
    expect(
      within(first).getByRole('img', { name: 'Has a screenshot' }),
    ).toBeInTheDocument();
    expect(second).toHaveTextContent('Ada Admin · Admin');
    expect(second).toHaveTextContent('Something is wrong but I can work');
    expect(
      within(second).queryByRole('img', { name: 'Has a screenshot' }),
    ).not.toBeInTheDocument();
    expect(third).toHaveTextContent('No severity');
    expect(state.listQueries).toEqual(['page=1&limit=25']);
  });

  it('filters by status with the tabs', async () => {
    const user = renderPage();
    const tabs = screen.getByRole('tablist', { name: 'Filter by status' });
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['All', 'New', 'In progress', 'Resolved', "Won't fix"]);
    expect(within(tabs).getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(within(tabs).getByRole('tab', { name: 'In progress' }));
    await waitFor(async () => expect(await rows()).toHaveLength(1));
    expect((await rows())[0]).toHaveTextContent('payroll total');
    expect(state.listQueries.at(-1)).toBe('page=1&limit=25&status=in_progress');

    await user.click(within(tabs).getByRole('tab', { name: "Won't fix" }));
    expect(await screen.findByText('No bug reports here.')).toBeVisible();
  });

  it('pages through the reports', async () => {
    state.reports = fakeBugReports(30);
    const user = renderPage();
    expect(await rows()).toHaveLength(25);
    expect(screen.getByText('1–25 of 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(async () => expect(await rows()).toHaveLength(5));
    expect(screen.getByText('26–30 of 30')).toBeInTheDocument();
    expect(state.listQueries.at(-1)).toBe('page=2&limit=25');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('starts from the page and status in the address', async () => {
    state.reports = fakeBugReports(30);
    renderPage('/admin/bug-reports?status=new&page=2');
    await screen.findByText('No bug reports here.');
    expect(state.listQueries).toEqual(['page=2&limit=25&status=new']);
    expect(screen.getByRole('tab', { name: 'New' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows the API error when the list fails', async () => {
    server.use(
      http.get('http://localhost:3000/admin/bug-reports', () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Forbidden resource',
    );
  });
});

describe('bug report detail', () => {
  it('shows the full report, environment and the screenshot from the signed URL fetched on open', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    expect(state.detailRequests).toEqual(['bug-1']);
    expect(
      await within(panel).findByText(
        'The Save button on my profile spins forever after I change my bio.',
      ),
    ).toBeVisible();
    expect(
      within(panel).getByText('The bio saves and the page says Saved.'),
    ).toBeVisible();
    expect(within(panel).getByText('390x844')).toBeVisible();
    expect(within(panel).getByText(/iPhone OS 18_1/)).toBeVisible();
    expect(within(panel).getByText('Not recorded')).toBeVisible();
    expect(within(panel).getByText('jane@example.com')).toBeVisible();

    const open = within(panel).getByRole('link', {
      name: 'Open the screenshot in a new tab',
    });
    expect(open).toHaveAttribute(
      'href',
      'https://storage.mock/read/bug-reports/shot-1.jpg?sig=5min',
    );
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      within(open).getByRole('img', { name: 'Screenshot from the reporter' }),
    ).toHaveAttribute(
      'src',
      'https://storage.mock/read/bug-reports/shot-1.jpg?sig=5min',
    );

    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    await openReport(user, /spins forever/);
    await waitFor(() =>
      expect(state.detailRequests).toEqual(['bug-1', 'bug-1']),
    );
  });

  it('links the page only when it is on our own origin', async () => {
    const user = renderPage();
    let panel = await openReport(user, /spins forever/);
    const link = await within(panel).findByRole('link', {
      name: 'http://localhost:3000/profile/edit?tab',
    });
    expect(link).toHaveAttribute('href', '/profile/edit?tab');
    await user.click(within(panel).getByRole('button', { name: 'Close' }));

    panel = await openReport(user, /Typo on the insurance page/);
    expect(
      await within(panel).findByText('https://evil.example/phish'),
    ).toBeVisible();
    expect(
      within(panel).queryByRole('link', { name: /evil/ }),
    ).not.toBeInTheDocument();
    expect(within(panel).getByText('No screenshot')).toBeVisible();
    expect(within(panel).getByText('Not given')).toBeVisible();
  });

  it('changes the status and saves an admin note', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    const status = await within(panel).findByRole('combobox', {
      name: 'Status',
    });
    expect(status).toHaveValue('new');
    const save = within(panel).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.selectOptions(status, 'In progress');
    await user.type(
      within(panel).getByRole('textbox', { name: 'Admin note' }),
      '  Reproduced on iOS  ',
    );
    await user.click(save);

    expect(await within(panel).findByRole('status')).toHaveTextContent('Saved');
    expect(state.patches).toEqual([
      {
        id: 'bug-1',
        body: { status: 'in_progress', adminNote: 'Reproduced on iOS' },
      },
    ]);
    expect(save).toBeDisabled();
    await user.click(within(panel).getByRole('button', { name: 'Close' }));
    await waitFor(async () =>
      expect((await rows())[0]).toHaveTextContent('In progress'),
    );
  });

  it('sends only what changed and clears a note with null', async () => {
    const user = renderPage();
    const panel = await openReport(user, /payroll total/);
    const note = await within(panel).findByRole('textbox', {
      name: 'Admin note',
    });
    expect(note).toHaveValue('Looking at the period boundary.');
    await user.clear(note);
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await within(panel).findByRole('status');
    expect(state.patches).toEqual([{ id: 'bug-2', body: { adminNote: null } }]);
  });

  it('keeps the edits and shows the reason when saving fails', async () => {
    state.patchStatus = 400;
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    await user.type(
      await within(panel).findByRole('textbox', { name: 'Admin note' }),
      'Note',
    );
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      "Couldn't save: adminNote must be shorter than or equal to 2000 characters",
    );
    expect(
      within(panel).getByRole('textbox', { name: 'Admin note' }),
    ).toHaveValue('Note');
  });
});

describe('bug reports access', () => {
  it('sends instructors home without asking the API', async () => {
    session.isAdmin = false;
    renderPage();
    expect(await screen.findByText('Home page')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Bug reports' }),
    ).not.toBeInTheDocument();
    expect(state.listQueries).toEqual([]);
  });
});

describe('bug reports in Chinese', () => {
  it('shows the page, tabs and detail in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = renderPage();
    expect(
      await screen.findByRole('heading', { name: '问题报告' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('tablist', { name: '按状态筛选' }))
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['全部', '新报告', '处理中', '已解决', '不处理']);
    const [first] = await rows('问题报告');
    expect(first).toHaveTextContent('无法继续');
    expect(first).toHaveTextContent('Jane Snow · 教练');
    await user.click(first!);
    const panel = screen.getByRole('dialog', { name: '问题报告' });
    expect(
      await within(panel).findByRole('combobox', { name: '状态' }),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: '保存' })).toBeDisabled();
  });
});
