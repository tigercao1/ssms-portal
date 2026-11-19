import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  createMemoryRouter,
  matchRoutes,
  RouterProvider,
} from 'react-router-dom';
import { server } from '@/test/msw';
import { I18nProvider } from '@/i18n/core/I18nProvider';
import { router as appRouter } from '@/app/router';
import { RequireAdmin } from '@/app/router/guards';
import { BugReportsPage } from './BugReportsPage';
import {
  adminBugReportHandlers,
  createBugReportsState,
  fakeBugReports,
  type BugReportsMockState,
} from './fixtures';
import type { BugReportDetail, UpdateBugReportBody } from './types';

const session = vi.hoisted(() => ({ isAdmin: true, userId: 'auth-1' }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: session.isAdmin,
    loading: false,
    user: { id: session.userId },
  }),
}));

let state: BugReportsMockState;
let router: ReturnType<typeof createMemoryRouter>;

beforeEach(() => {
  session.isAdmin = true;
  session.userId = 'auth-1';
  state = createBugReportsState();
  server.use(...adminBugReportHandlers(state));
});

afterEach(() => {
  focusManager.setFocused(undefined);
});

function renderPage(route = '/admin/bug-reports') {
  const user = userEvent.setup();
  const page = (
    <RequireAdmin>
      <BugReportsPage />
    </RequireAdmin>
  );
  router = createMemoryRouter(
    [
      { path: '/admin/bug-reports', element: page },
      { path: '/admin/bug-reports/:id', element: page },
      { path: '/', element: <p>Home page</p> },
      { path: '/profile/edit', element: <p>Edit profile page</p> },
    ],
    { initialEntries: [route] },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return user;
}

function address() {
  return `${router.state.location.pathname}${router.state.location.search}`;
}

async function rows(name = 'Bug reports') {
  const list = await screen.findByRole('list', { name });
  return within(list).getAllByRole('link');
}

async function refetchOnFocus() {
  const before = state.detailRequests.length;
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
  await waitFor(() =>
    expect(state.detailRequests.length).toBeGreaterThan(before),
  );
}

function pausePatches() {
  const releases: (() => void)[] = [];
  server.use(
    http.patch(
      'http://localhost:3000/admin/bug-reports/:id',
      async ({ params, request }) => {
        const body = (await request.json()) as UpdateBugReportBody;
        state.patches.push({ id: String(params.id), body });
        await new Promise<void>((resolve) => releases.push(resolve));
        const report = state.reports.find((r) => r.id === params.id)!;
        Object.assign(report, body);
        return HttpResponse.json(report);
      },
    ),
  );
  return releases;
}

async function openReport(
  user: ReturnType<typeof userEvent.setup>,
  text: RegExp,
) {
  await user.click(await screen.findByRole('link', { name: text }));
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
    expect(link).toHaveAttribute(
      'href',
      'http://localhost:3000/profile/edit?tab',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
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

describe('triage form when the report changes elsewhere', () => {
  function changeOnServer(changes: Partial<BugReportDetail>) {
    Object.assign(state.reports[0]!, changes);
  }

  it('follows a status another admin changed and sends only the note this admin typed', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    const status = await within(panel).findByRole('combobox', {
      name: 'Status',
    });
    changeOnServer({ status: 'resolved' });
    await refetchOnFocus();
    await waitFor(() => expect(status).toHaveValue('resolved'));
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.type(
      within(panel).getByRole('textbox', { name: 'Admin note' }),
      'My note',
    );
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await within(panel).findByText('Saved');
    expect(state.patches).toEqual([
      { id: 'bug-1', body: { adminNote: 'My note' } },
    ]);
    expect(state.reports[0]!.status).toBe('resolved');
  });

  it('follows a note another admin wrote while this admin only changed the status', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    await user.selectOptions(
      await within(panel).findByRole('combobox', { name: 'Status' }),
      'In progress',
    );
    changeOnServer({ adminNote: 'Their note' });
    await refetchOnFocus();
    await waitFor(() =>
      expect(
        within(panel).getByRole('textbox', { name: 'Admin note' }),
      ).toHaveValue('Their note'),
    );
    expect(within(panel).queryByText(/Someone else changed/)).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await within(panel).findByText('Saved');
    expect(state.patches).toEqual([
      { id: 'bug-1', body: { status: 'in_progress' } },
    ]);
  });

  it('warns when the server changed a field with unsaved edits and keeps this admin’s edit on request', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    const note = await within(panel).findByRole('textbox', {
      name: 'Admin note',
    });
    await user.type(note, 'Mine');
    changeOnServer({ adminNote: 'Theirs' });
    await refetchOnFocus();

    expect(
      await within(panel).findByText(
        'Someone else changed this report while you were editing it.',
      ),
    ).toBeVisible();
    expect(note).toHaveValue('Mine');
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(
      within(panel).getByRole('button', { name: 'Keep my changes' }),
    );
    expect(within(panel).queryByText(/Someone else changed/)).toBeNull();
    await user.click(within(panel).getByRole('button', { name: 'Save' }));
    await within(panel).findByText('Saved');
    expect(state.patches).toEqual([
      { id: 'bug-1', body: { adminNote: 'Mine' } },
    ]);
  });

  it('discards this admin’s edit and shows the server value on request', async () => {
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    const status = await within(panel).findByRole('combobox', {
      name: 'Status',
    });
    await user.selectOptions(status, 'In progress');
    changeOnServer({ status: 'wont_fix' });
    await refetchOnFocus();

    await user.click(
      await within(panel).findByRole('button', { name: 'Discard my changes' }),
    );
    expect(status).toHaveValue('wont_fix');
    expect(within(panel).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(state.patches).toEqual([]);
  });
});

describe('triage form while a save is pending', () => {
  it('keeps one save in flight and Save disabled while the admin keeps editing', async () => {
    const releases = pausePatches();
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    const note = await within(panel).findByRole('textbox', {
      name: 'Admin note',
    });
    const save = within(panel).getByRole('button', { name: 'Save' });
    await user.type(note, 'first');
    await user.click(save);
    await waitFor(() => expect(state.patches).toHaveLength(1));

    await user.type(note, ' new edit');
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Status' }),
      'In progress',
    );
    expect(save).toBeDisabled();
    await user.click(save);
    expect(state.patches).toHaveLength(1);

    act(() => releases.shift()!());
    await waitFor(() => expect(save).toBeEnabled());
    expect(note).toHaveValue('first new edit');
    await user.click(save);
    await waitFor(() => expect(state.patches).toHaveLength(2));
    act(() => releases.shift()!());
    await within(panel).findByText('Saved');

    expect(state.patches.map((patch) => patch.body)).toEqual([
      { adminNote: 'first' },
      { status: 'in_progress', adminNote: 'first new edit' },
    ]);
    expect(note).toHaveValue('first new edit');
    expect(save).toBeDisabled();
  });
});

describe('reported page link', () => {
  async function pageLinks(pageUrl: string) {
    state.reports[0]!.pageUrl = pageUrl;
    const user = renderPage();
    const panel = await openReport(user, /spins forever/);
    await within(panel).findByText('390x844');
    return within(panel)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-label') === null);
  }

  it.each([
    [
      'a double slash after our origin',
      'http://localhost:3000//evil.example/phish',
    ],
    [
      'a backslash after our origin',
      'http://localhost:3000/\\evil.example/phish',
    ],
    [
      'backslashes in place of the path',
      'http://localhost:3000\\\\evil.example/phish',
    ],
    ['a protocol-relative URL', '//evil.example/phish'],
    ['a relative slash-backslash path', '/\\evil.example/phish'],
    [
      'a tab between the slashes',
      'http://localhost:3000/\t/evil.example/phish',
    ],
    ['a leading tab', '\t//evil.example/phish'],
    ['a javascript: URL', 'javascript:alert(document.cookie)'],
    ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
    ['our origin as userinfo', 'http://localhost:3000@evil.example/phish'],
    ['another origin', 'https://evil.example/phish'],
  ])('shows %s as text, not a link', async (_, pageUrl) => {
    expect(await pageLinks(pageUrl)).toEqual([]);
    expect(
      within(screen.getByRole('dialog')).getByText(pageUrl, {
        normalizer: (text) => text,
      }),
    ).toBeVisible();
  });

  it('keeps an encoded-slash path on our own origin', async () => {
    const [link] = await pageLinks(
      'http://localhost:3000/%2F%2Fevil.example/phish',
    );
    expect(new URL((link as HTMLAnchorElement).href).origin).toBe(
      window.location.origin,
    );
    expect(link).toHaveAttribute(
      'href',
      'http://localhost:3000/%2F%2Fevil.example/phish',
    );
  });
});

describe('bug report address', () => {
  it('is served by the app router, as the notification email links to it', () => {
    const matches = matchRoutes(appRouter.routes, '/admin/bug-reports/bug-1');
    expect(matches?.at(-1)?.route.path).toBe('/admin/bug-reports/:id');
  });

  it('opens the report from its own address over the list', async () => {
    renderPage('/admin/bug-reports/bug-2');
    const panel = await screen.findByRole('dialog', { name: 'Bug report' });
    expect(
      await within(panel).findByText(
        'The payroll total on the class list is off by one lesson.',
      ),
    ).toBeVisible();
    expect(state.detailRequests).toEqual(['bug-2']);
    expect(await rows()).toHaveLength(3);
  });

  it('links each row to its address and closes with the browser back button', async () => {
    const user = renderPage('/admin/bug-reports?status=new');
    const [row] = await rows();
    expect(row).toHaveAttribute('href', '/admin/bug-reports/bug-1?status=new');
    await user.click(row!);
    expect(address()).toBe('/admin/bug-reports/bug-1?status=new');
    expect(
      await screen.findByRole('dialog', { name: 'Bug report' }),
    ).toBeVisible();

    await act(() => router.navigate(-1));
    expect(address()).toBe('/admin/bug-reports?status=new');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await act(() => router.navigate(1));
    expect(
      await screen.findByRole('dialog', { name: 'Bug report' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(address()).toBe('/admin/bug-reports?status=new');
    expect(router.state.historyAction).toBe('POP');
  });

  it('closes a report opened from its address to the list', async () => {
    const user = renderPage('/admin/bug-reports/bug-1');
    await screen.findByRole('dialog', { name: 'Bug report' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(address()).toBe('/admin/bug-reports');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await rows()).toHaveLength(3);
  });

  it.each([
    ['an unknown', '/admin/bug-reports/bug-999'],
    ['a malformed', '/admin/bug-reports/not%20a%20report'],
  ])(
    'says %s report is missing and links back to the list',
    async (_, route) => {
      const user = renderPage(route);
      const panel = await screen.findByRole('dialog', { name: 'Bug report' });
      expect(await within(panel).findByRole('alert')).toHaveTextContent(
        "This report doesn't exist, or the link is broken.",
      );
      await user.click(
        within(panel).getByRole('link', { name: 'Back to bug reports' }),
      );
      expect(address()).toBe('/admin/bug-reports');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
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

  it('sends instructors home from a report address without asking the API', async () => {
    session.isAdmin = false;
    renderPage('/admin/bug-reports/bug-1');
    expect(await screen.findByText('Home page')).toBeVisible();
    expect(state.detailRequests).toEqual([]);
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
