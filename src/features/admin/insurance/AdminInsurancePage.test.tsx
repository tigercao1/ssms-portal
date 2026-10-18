import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  adminRecord,
  adminRecords,
  adminRequestHandlers,
  adminSummary,
  createAdminRequestsState,
  type AdminRequestsState,
} from '@/features/insurance/fixtures';
import type {
  AdminInsuranceRecord,
  AdminInsuranceSummary,
} from '@/features/insurance/types';
import { AdminInsurancePage, INSURANCE_PAGE_SIZE } from './AdminInsurancePage';

const API = 'http://localhost:3000';

let records: AdminInsuranceRecord[];
let total: number | null;
let summaryQueries: string[];
let recordQueries: URLSearchParams[];
let actions: { id: string; action: string; body: unknown }[];
let summary: AdminInsuranceSummary[];
let grants: { instructorId: string; body: unknown }[];
let requestsState: AdminRequestsState;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-20T17:00:00Z'));
  records = adminRecords.map((r) => ({ ...r }));
  total = null;
  summaryQueries = [];
  recordQueries = [];
  actions = [];
  summary = adminSummary.map((row) => ({ ...row }));
  grants = [];
  requestsState = createAdminRequestsState();
  server.use(
    ...adminRequestHandlers(requestsState),
    http.get(`${API}/admin/insurance/summary`, ({ request }) => {
      summaryQueries.push(new URL(request.url).search);
      return HttpResponse.json(summary);
    }),
    http.post(
      `${API}/admin/insurance/instructors/:instructorId/season-pass`,
      async ({ request, params }) => {
        const instructorId = String(params.instructorId);
        const body = (await request.json()) as { paidOn?: string };
        grants.push({ instructorId, body });
        const row = summary.find((r) => r.instructorId === instructorId)!;
        const record = adminRecord({
          id: 'pass-new',
          recordNo: 'INS-20261220-0001',
          instructorId,
          kind: 'season_pass',
          lessonDate: null,
          durationHours: null,
          students: [],
          studentCount: null,
          listCents: 40000 - row.owedCents,
          amountCents: 40000 - row.owedCents,
          coverage: null,
          paymentStatus: body.paidOn ? 'paid' : 'unpaid',
          paidOn: body.paidOn ?? null,
        });
        Object.assign(row, {
          owedCents: 40000,
          coverage: 'season_pass',
          seasonPassRecordId: record.id,
          seasonPassPaymentStatus: record.paymentStatus,
        });
        return HttpResponse.json(record, { status: 201 });
      },
    ),
    http.get(`${API}/admin/insurance/records`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      recordQueries.push(params);
      const filtered = records.filter(
        (r) =>
          (!params.get('instructorId') ||
            r.instructorId === params.get('instructorId')) &&
          (!params.get('paymentStatus') ||
            r.paymentStatus === params.get('paymentStatus')),
      );
      return HttpResponse.json({
        records: filtered,
        total: total ?? filtered.length,
      });
    }),
    http.post(
      `${API}/admin/insurance/records/:id/:action`,
      async ({ request, params }) => {
        const id = String(params.id);
        const action = String(params.action);
        const body = await request.json();
        actions.push({ id, action, body });
        records = records.map((r) => {
          if (r.id !== id) return r;
          if (action === 'mark-paid')
            return {
              ...r,
              paymentStatus: 'paid',
              paidOn: (body as { paidOn: string }).paidOn,
            };
          if (action === 'mark-unpaid')
            return { ...r, paymentStatus: 'unpaid', paidOn: null };
          return {
            ...r,
            paymentStatus: 'voided',
            voidedReason: (body as { reason: string }).reason,
          };
        });
        return HttpResponse.json(records.find((r) => r.id === id));
      },
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderPage(locale: 'en' | 'zh-CN' = 'en') {
  if (locale === 'zh-CN') localStorage.setItem('ssms.locale', 'zh-CN');
  const user = userEvent.setup();
  renderWithProviders(<AdminInsurancePage />, { route: '/admin/insurance' });
  await screen.findByRole('table', {
    name: locale === 'en' ? 'Records' : '登记记录',
  });
  return user;
}

function summaryRow(name: string) {
  return within(screen.getByRole('table', { name: /By instructor|按教练汇总/ }))
    .getByRole('button', { name })
    .closest('tr') as HTMLElement;
}

function recordRow(recordNo: string) {
  return screen.getByText(recordNo).closest('tr') as HTMLElement;
}

type User = Awaited<ReturnType<typeof renderPage>>;

async function recordAction(
  user: User,
  recordNo: string,
  name: string,
  trigger = `Actions for ${recordNo}`,
) {
  await user.click(
    within(recordRow(recordNo)).getByRole('button', { name: trigger }),
  );
  await user.click(screen.getByRole('menuitem', { name }));
}

async function recordActionNames(user: User, recordNo: string) {
  await user.click(
    within(recordRow(recordNo)).getByRole('button', {
      name: `Actions for ${recordNo}`,
    }),
  );
  const names = screen.getAllByRole('menuitem').map((item) => item.textContent);
  await user.keyboard('{Escape}');
  return names;
}

describe('AdminInsurancePage', () => {
  it('defaults to the current season and shows the per-instructor summary', async () => {
    await renderPage();
    expect(
      screen.getByRole('heading', { name: 'Lesson insurance' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Season')).toHaveValue('2026/27');
    expect(summaryQueries).toContain('?season=2026%2F27');
    expect(recordQueries[0]!.get('season')).toBe('2026/27');
    expect(recordQueries[0]!.get('limit')).toBe(String(INSURANCE_PAGE_SIZE));
    const summary = screen.getByRole('table', { name: 'By instructor' });
    expect(
      within(summary)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Instructor',
      'Owed',
      'Paid',
      'Unpaid',
      'Progress to $400',
      'Coverage',
      'Records',
    ]);
    const rows = within(summary).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(
      'Jane Snowjane@example.com$380$300$80$380 / $400Per lessonGrant season pass14',
    );
    expect(rows[1]).toHaveTextContent('Li Wei');
    expect(rows[1]).toHaveTextContent(
      '$400 / $400Season passPaidRemove season pass3',
    );
    expect(
      within(rows[0] as HTMLElement).getByRole('progressbar'),
    ).toHaveAttribute('aria-valuenow', '380');
  });

  it('grants a season pass for the remainder and marks it paid now', async () => {
    const user = await renderPage();
    await user.click(
      within(summaryRow('Jane Snow')).getByRole('button', {
        name: 'Grant season pass',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Grant Jane Snow a season pass',
    });
    expect(dialog).toHaveTextContent('Season pass ($400 − $380)');
    expect(within(dialog).getByTestId('grant-amount')).toHaveTextContent('$20');
    expect(dialog).toHaveTextContent(
      '$380 is already registered for 2026/27. Every later registration this season is free.',
    );
    expect(within(dialog).queryByLabelText(/Payment date/)).toBeNull();
    await user.click(within(dialog).getByLabelText('Mark paid now'));
    const paidOn = within(dialog).getByLabelText(/Payment date/);
    expect(paidOn).toHaveValue('2026-12-20');
    await user.clear(paidOn);
    const confirm = within(dialog).getByRole('button', { name: 'Grant · $20' });
    expect(confirm).toBeDisabled();
    await user.type(paidOn, '2026-12-18');
    await user.type(within(dialog).getByLabelText('Note'), ' paid up front ');
    await user.click(confirm);
    expect(
      await screen.findByText(
        'Season pass INS-20261220-0001 granted to Jane Snow.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(grants).toEqual([
      {
        instructorId: 'inst-1',
        body: {
          season: '2026/27',
          note: 'paid up front',
          paidOn: '2026-12-18',
        },
      },
    ]);
    await waitFor(() =>
      expect(summaryRow('Jane Snow')).toHaveTextContent(
        'Season passPaidRemove season pass14',
      ),
    );
    expect(
      within(summaryRow('Jane Snow')).queryByRole('button', {
        name: 'Grant season pass',
      }),
    ).toBeNull();
  });

  it('grants an unpaid season pass with no note', async () => {
    const user = await renderPage();
    await user.click(
      within(summaryRow('Jane Snow')).getByRole('button', {
        name: 'Grant season pass',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Mark paid now'));
    await user.click(within(dialog).getByLabelText('Mark paid now'));
    await user.click(
      within(dialog).getByRole('button', { name: 'Grant · $20' }),
    );
    await screen.findByText(
      'Season pass INS-20261220-0001 granted to Jane Snow.',
    );
    expect(grants).toEqual([
      { instructorId: 'inst-1', body: { season: '2026/27' } },
    ]);
    await waitFor(() =>
      expect(summaryRow('Jane Snow')).toHaveTextContent('Season passUnpaid'),
    );
  });

  it.each([
    [
      'already_covered',
      'This instructor already reached the $400 cap this season.',
    ],
    [
      'already_has_pass',
      'This instructor already has a season pass this season.',
    ],
    ['not_approved', 'Only approved instructors can get a season pass.'],
    ['other', 'Grant failed'],
  ])('explains a %s grant error', async (code, message) => {
    server.use(
      http.post(
        `${API}/admin/insurance/instructors/:instructorId/season-pass`,
        () =>
          HttpResponse.json(
            { statusCode: 409, code, message: 'Grant failed' },
            { status: 409 },
          ),
      ),
    );
    const user = await renderPage();
    await user.click(
      within(summaryRow('Jane Snow')).getByRole('button', {
        name: 'Grant season pass',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Grant · $20' }),
    );
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('hides the grant action once a coach is capped without a pass', async () => {
    summary = [
      {
        ...adminSummary[0]!,
        owedCents: 40000,
        coverage: 'capped',
      },
    ];
    await renderPage();
    const row = summaryRow('Jane Snow');
    expect(row).toHaveTextContent('Capped');
    expect(
      within(row).queryAllByRole('button', { name: /season pass/ }),
    ).toEqual([]);
  });

  it('removes a season pass by voiding its record with a reason', async () => {
    const user = await renderPage();
    await user.click(
      within(summaryRow('Li Wei')).getByRole('button', {
        name: 'Remove season pass',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: "Remove Li Wei's season pass?",
    });
    expect(dialog).toHaveTextContent('Li Wei · 2026/27');
    expect(dialog).toHaveTextContent(
      'The season pass record is voided and no longer counts toward the $400 cap, so later registrations are charged again.',
    );
    const confirm = within(dialog).getByRole('button', {
      name: 'Remove season pass',
    });
    await user.click(confirm);
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(actions).toEqual([]);
    await user.type(within(dialog).getByLabelText(/Reason/), 'Paid by mistake');
    await user.click(confirm);
    expect(
      await screen.findByText("Li Wei's season pass was removed."),
    ).toBeInTheDocument();
    expect(actions).toEqual([
      { id: 'a-3', action: 'void', body: { reason: 'Paid by mistake' } },
    ]);
  });

  it('lists records with the right actions per status', async () => {
    const user = await renderPage();
    const unpaid = recordRow('INS-20261219-0002');
    expect(unpaid).toHaveTextContent('Dec 19, 2026Jane SnowWei Zhang, Amy Li');
    expect(within(unpaid).getByText('Unpaid')).toBeInTheDocument();
    expect(await recordActionNames(user, 'INS-20261219-0002')).toEqual([
      'Mark paid',
      'Void',
    ]);

    const paid = recordRow('INS-20261212-0001');
    expect(paid).toHaveTextContent('Paid Dec 13, 2026');
    expect(paid).toHaveTextContent('e-transfer #8812');
    expect(await recordActionNames(user, 'INS-20261212-0001')).toEqual([
      'Mark unpaid',
      'Void',
    ]);

    const pass = recordRow('INS-20261101-0001');
    expect(pass).toHaveTextContent('Season passLi Wei');
    expect(pass).toHaveTextContent('$400');

    const voided = recordRow('INS-20261120-0003');
    expect(voided).toHaveTextContent('Voided: Duplicate registration');
    expect(within(voided).queryAllByRole('button')).toHaveLength(0);
  });

  it('marks a record paid with today as the default date and a note', async () => {
    const user = await renderPage();
    await recordAction(user, 'INS-20261219-0002', 'Mark paid');
    const dialog = screen.getByRole('dialog', {
      name: 'Mark INS-20261219-0002 paid',
    });
    expect(dialog).toHaveTextContent('Jane Snow · $40');
    expect(within(dialog).getByLabelText(/Payment date/)).toHaveValue(
      '2026-12-20',
    );
    await user.type(within(dialog).getByLabelText('Note'), ' ref 99 ');
    await user.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    expect(
      await screen.findByText('INS-20261219-0002 marked paid.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(actions).toEqual([
      {
        id: 'a-1',
        action: 'mark-paid',
        body: { paidOn: '2026-12-20', note: 'ref 99' },
      },
    ]);
    await waitFor(() =>
      expect(
        within(recordRow('INS-20261219-0002')).getByText('Paid'),
      ).toBeInTheDocument(),
    );
    expect(await recordActionNames(user, 'INS-20261219-0002')).toEqual([
      'Mark unpaid',
      'Void',
    ]);
  });

  it('marks a paid record unpaid after confirming', async () => {
    const user = await renderPage();
    await recordAction(user, 'INS-20261212-0001', 'Mark unpaid');
    const dialog = screen.getByRole('dialog', {
      name: 'Mark INS-20261212-0001 unpaid?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Mark unpaid' }),
    );
    expect(
      await screen.findByText('INS-20261212-0001 marked unpaid.'),
    ).toBeInTheDocument();
    expect(actions).toEqual([{ id: 'a-2', action: 'mark-unpaid', body: {} }]);
  });

  it('requires a reason to void a record', async () => {
    const user = await renderPage();
    await recordAction(user, 'INS-20261219-0002', 'Void');
    const dialog = screen.getByRole('dialog', {
      name: 'Void INS-20261219-0002?',
    });
    expect(dialog).toHaveTextContent(
      "A voided record no longer counts toward the instructor's $400 cap.",
    );
    const confirm = within(dialog).getByRole('button', { name: 'Void record' });
    await user.click(confirm);
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(actions).toEqual([]);
    await user.type(within(dialog).getByLabelText(/Reason/), '   ');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reason/), 'Duplicate');
    await user.click(confirm);
    expect(
      await screen.findByText('INS-20261219-0002 voided.'),
    ).toBeInTheDocument();
    expect(actions).toEqual([
      { id: 'a-1', action: 'void', body: { reason: 'Duplicate' } },
    ]);
  });

  it('shows an action error in the dialog', async () => {
    server.use(
      http.post(`${API}/admin/insurance/records/:id/:action`, () =>
        HttpResponse.json(
          { message: 'Only unpaid records can be marked paid' },
          { status: 409 },
        ),
      ),
    );
    const user = await renderPage();
    await recordAction(user, 'INS-20261219-0002', 'Mark paid');
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    expect(
      await within(dialog).findByText('Only unpaid records can be marked paid'),
    ).toBeInTheDocument();
  });

  it('filters by instructor and status, and pages', async () => {
    total = 60;
    const user = await renderPage();
    await user.selectOptions(screen.getByLabelText('Instructor'), 'inst-2');
    await waitFor(() =>
      expect(recordQueries.at(-1)!.get('instructorId')).toBe('inst-2'),
    );
    expect(screen.queryByText('INS-20261219-0002')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Status'), 'Paid');
    await waitFor(() =>
      expect(recordQueries.at(-1)!.get('paymentStatus')).toBe('paid'),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'All statuses');
    await user.selectOptions(
      screen.getByLabelText('Instructor'),
      'All instructors',
    );
    await waitFor(() =>
      expect(recordQueries.at(-1)!.has('instructorId')).toBe(false),
    );
    await user.click(
      within(
        screen.getByRole('navigation', { name: 'Records pages' }),
      ).getByRole('button', { name: 'Next' }),
    );
    await waitFor(() => expect(recordQueries.at(-1)!.get('page')).toBe('2'));
    await user.click(screen.getByRole('button', { name: 'Jane Snow' }));
    await waitFor(() => {
      expect(recordQueries.at(-1)!.get('instructorId')).toBe('inst-1');
      expect(recordQueries.at(-1)!.get('page')).toBe('1');
    });
  });

  it('switches seasons', async () => {
    const user = await renderPage();
    await user.selectOptions(screen.getByLabelText('Season'), '2025/26');
    await waitFor(() =>
      expect(summaryQueries.at(-1)).toBe('?season=2025%2F26'),
    );
    expect(recordQueries.at(-1)!.get('season')).toBe('2025/26');
  });

  it('shows empty states', async () => {
    server.use(
      http.get(`${API}/admin/insurance/summary`, () => HttpResponse.json([])),
      http.get(`${API}/admin/insurance/records`, () =>
        HttpResponse.json({ records: [], total: 0 }),
      ),
    );
    renderWithProviders(<AdminInsurancePage />);
    expect(
      await screen.findByText('No one has registered a lesson this season.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('No records match these filters.'),
    ).toBeInTheDocument();
  });

  it('shows load errors', async () => {
    server.use(
      http.get(`${API}/admin/insurance/summary`, () =>
        HttpResponse.json({ message: 'Summary down' }, { status: 500 }),
      ),
      http.get(`${API}/admin/insurance/records`, () =>
        HttpResponse.json({ message: 'Records down' }, { status: 500 }),
      ),
    );
    renderWithProviders(<AdminInsurancePage />);
    expect(await screen.findByText('Summary down')).toBeInTheDocument();
    expect(await screen.findByText('Records down')).toBeInTheDocument();
  });

  it('shows the page and dialogs in Chinese', async () => {
    records = [
      adminRecord({ id: 'a-1', paymentStatus: 'unpaid', paidOn: null }),
    ];
    const user = await renderPage('zh-CN');
    expect(
      screen.getByRole('heading', { name: '私课保险' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('雪季')).toHaveValue('2026/27');
    const summary = screen.getByRole('table', { name: '按教练汇总' });
    expect(within(summary).getByText('简雪')).toBeInTheDocument();
    expect(within(summary).getByText('整季保险')).toBeInTheDocument();
    expect(within(summary).getByText('按次')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '登记记录' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      '上课日期',
      '教练',
      '学生',
      '时长',
      '金额',
      '记录编号',
      '状态',
      '创建时间',
      '操作',
    ]);
    expect(within(table).getByText('待付款')).toBeInTheDocument();
    await recordAction(
      user,
      'INS-20261212-0001',
      '标记已付',
      'INS-20261212-0001 的操作',
    );
    const paid = screen.getByRole('dialog', {
      name: '将 INS-20261212-0001 标记为已付',
    });
    expect(within(paid).getByLabelText(/付款日期/)).toHaveValue('2026-12-20');
    await user.click(within(paid).getByRole('button', { name: '取消' }));
    await recordAction(
      user,
      'INS-20261212-0001',
      '作废',
      'INS-20261212-0001 的操作',
    );
    const voidDialog = screen.getByRole('dialog', {
      name: '作废 INS-20261212-0001？',
    });
    await user.click(
      within(voidDialog).getByRole('button', { name: '作废记录' }),
    );
    expect(within(voidDialog).getByText('请填写原因。')).toBeInTheDocument();
    await user.type(within(voidDialog).getByLabelText(/原因/), '重复登记');
    await user.click(
      within(voidDialog).getByRole('button', { name: '作废记录' }),
    );
    expect(
      await screen.findByText('INS-20261212-0001 已作废。'),
    ).toBeInTheDocument();
  });

  it('grants and removes a season pass in Chinese', async () => {
    const user = await renderPage('zh-CN');
    const summaryTable = screen.getByRole('table', { name: '按教练汇总' });
    expect(within(summaryTable).getByText('已支付')).toBeInTheDocument();
    await user.click(
      within(summaryRow('简雪')).getByRole('button', { name: '设为整季保险' }),
    );
    const grant = screen.getByRole('dialog', { name: '为 简雪 设为整季保险' });
    expect(grant).toHaveTextContent('整季保险金额（$400 − $380）$20');
    expect(grant).toHaveTextContent(
      '2026/27 雪季已累计 $380。设为整季保险后，本季之后的登记全部免费。',
    );
    await user.click(within(grant).getByLabelText('现在标记为已付'));
    expect(within(grant).getByLabelText(/付款日期/)).toHaveValue('2026-12-20');
    await user.click(
      within(grant).getByRole('button', { name: '设为整季保险 · $20' }),
    );
    expect(
      await screen.findByText('已为 简雪 设为整季保险 INS-20261220-0001。'),
    ).toBeInTheDocument();

    await user.click(
      within(summaryRow('Li Wei')).getByRole('button', { name: '取消整季' }),
    );
    const remove = screen.getByRole('dialog', {
      name: '取消 Li Wei 的整季保险？',
    });
    expect(remove).toHaveTextContent(
      '整季保险记录将被作废，不再计入 $400 封顶，之后的登记会重新按次收费。此操作无法撤销。',
    );
    await user.type(within(remove).getByLabelText(/原因/), '误操作');
    await user.click(within(remove).getByRole('button', { name: '取消整季' }));
    expect(
      await screen.findByText('已取消 Li Wei 的整季保险。'),
    ).toBeInTheDocument();
  });

  it('lists requests and expands one into its lessons and students', async () => {
    const user = await renderPage();
    const table = await screen.findByRole('table', {
      name: 'Insurance requests',
    });
    expect(requestsState.queries[0]!.get('season')).toBe('2026/27');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Request no.',
      'Instructor',
      'Lessons',
      'Students',
      'Amount',
      'Status',
      'Submitted',
      'Actions',
    ]);
    expect(requestRow('INS-20261014-0011')).toHaveTextContent(
      'INS-20261014-0011Jane Snow311$190Unpaid',
    );
    expect(requestRow('INS-20261006-0004')).toHaveTextContent(
      'Paid Oct 6, 2026e-transfer #8812',
    );
    const toggle = within(table).getByRole('button', {
      name: 'Show the lessons in INS-20261014-0011',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const lessons = within(table).getAllByTestId('tree-lesson');
    expect(lessons).toHaveLength(3);
    expect(lessons[2]).toHaveTextContent('Horseshoe Resort · 3 students');
    expect(within(table).getAllByTestId('tree-student')).toHaveLength(11);
    await user.click(toggle);
    expect(within(table).queryByTestId('tree-lesson')).not.toBeInTheDocument();
  });

  it('marks a request paid for all its lessons', async () => {
    const user = await renderPage();
    await screen.findByRole('table', { name: 'Insurance requests' });
    expect(await requestActionNames(user, 'INS-20261014-0011')).toEqual([
      'Mark paid',
      'Void',
    ]);
    await requestAction(user, 'INS-20261014-0011', 'Mark paid');
    const dialog = screen.getByRole('dialog', {
      name: 'Mark INS-20261014-0011 paid',
    });
    expect(dialog).toHaveTextContent('Jane Snow · $190');
    await user.type(within(dialog).getByLabelText(/Note/), 'e-transfer #9');
    await user.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    expect(
      await screen.findByText('INS-20261014-0011 marked paid.'),
    ).toBeInTheDocument();
    expect(requestsState.actions).toEqual([
      {
        id: 'req-2',
        action: 'mark-paid',
        body: { paidOn: '2026-12-20', note: 'e-transfer #9' },
      },
    ]);
    expect(actions).toEqual([]);
    await waitFor(() =>
      expect(requestRow('INS-20261014-0011')).toHaveTextContent('Paid'),
    );
  });

  it('marks a paid request unpaid after confirming', async () => {
    const user = await renderPage();
    await screen.findByRole('table', { name: 'Insurance requests' });
    expect(await requestActionNames(user, 'INS-20261006-0004')).toEqual([
      'Mark unpaid',
      'Void',
    ]);
    await requestAction(user, 'INS-20261006-0004', 'Mark unpaid');
    const dialog = screen.getByRole('dialog', {
      name: 'Mark INS-20261006-0004 unpaid?',
    });
    expect(dialog).toHaveTextContent(
      'Every lesson in the request goes back to unpaid',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Mark unpaid' }),
    );
    expect(
      await screen.findByText('INS-20261006-0004 marked unpaid.'),
    ).toBeInTheDocument();
    expect(requestsState.actions).toEqual([
      { id: 'req-1', action: 'mark-unpaid', body: {} },
    ]);
  });

  it('voids a whole request with a reason', async () => {
    const user = await renderPage();
    await screen.findByRole('table', { name: 'Insurance requests' });
    await requestAction(user, 'INS-20261014-0011', 'Void');
    const dialog = screen.getByRole('dialog', {
      name: 'Void INS-20261014-0011?',
    });
    expect(dialog).toHaveTextContent(
      "Every lesson in this request is voided and no longer counts toward the instructor's $400 cap.",
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Void request' }),
    );
    expect(within(dialog).getByText('Enter a reason.')).toBeInTheDocument();
    expect(requestsState.actions).toEqual([]);
    await user.type(
      within(dialog).getByLabelText(/Reason/),
      'Lessons cancelled',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Void request' }),
    );
    expect(
      await screen.findByText('INS-20261014-0011 voided.'),
    ).toBeInTheDocument();
    expect(requestsState.actions).toEqual([
      { id: 'req-2', action: 'void', body: { reason: 'Lessons cancelled' } },
    ]);
    await waitFor(() =>
      expect(requestRow('INS-20261014-0011')).toHaveTextContent(
        'Voided: Lessons cancelled',
      ),
    );
    expect(
      within(requestRow('INS-20261014-0011')).queryByRole('button', {
        name: 'Actions for INS-20261014-0011',
      }),
    ).not.toBeInTheDocument();
  });

  it('labels lessons that belong to a request and warns that their actions update the whole request', async () => {
    records = [
      adminRecord({
        id: 'req-2-l1',
        recordNo: 'INS-20261014-0021',
        requestId: 'req-2',
        requestNo: 'INS-20261014-0011',
        paymentStatus: 'unpaid',
        paidOn: null,
      }),
      ...records,
    ];
    const user = await renderPage();
    const row = await screen.findByRole('row', {
      name: /INS-20261014-0021/,
    });
    expect(within(row).getByTestId('part-of-request')).toHaveTextContent(
      'Part of INS-20261014-0011',
    );
    expect(
      within(recordRow('INS-20261219-0002')).queryByTestId('part-of-request'),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(requestsState.queries.length).toBeGreaterThan(0),
    );

    await recordAction(user, 'INS-20261014-0021', 'Mark paid');
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('whole-request')).toHaveTextContent(
      'This updates the whole request INS-20261014-0011 (3 lessons).',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Mark paid' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(actions.at(-1)).toMatchObject({
      id: 'req-2-l1',
      action: 'mark-paid',
    });

    await recordAction(user, 'INS-20261014-0021', 'Void');
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('whole-request')).toHaveTextContent(
      'This updates the whole request INS-20261014-0011 (3 lessons).',
    );
    expect(dialog).toHaveTextContent('Every lesson in this request is voided');
    expect(
      within(dialog).getByRole('button', { name: 'Void request' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await recordAction(user, 'INS-20261219-0002', 'Void');
    expect(
      within(screen.getByRole('dialog')).queryByTestId('whole-request'),
    ).not.toBeInTheDocument();
  });

  it('labels request lessons and the whole-request warning in Chinese', async () => {
    records = [
      adminRecord({
        id: 'req-2-l1',
        recordNo: 'INS-20261014-0021',
        requestId: 'req-2',
        requestNo: 'INS-20261014-0011',
        paymentStatus: 'paid',
      }),
    ];
    const user = await renderPage('zh-CN');
    const row = await screen.findByRole('row', {
      name: /INS-20261014-0021/,
    });
    expect(within(row).getByTestId('part-of-request')).toHaveTextContent(
      '属于 INS-20261014-0011',
    );
    await waitFor(() =>
      expect(requestsState.queries.length).toBeGreaterThan(0),
    );
    await recordAction(
      user,
      'INS-20261014-0021',
      '标记未付',
      'INS-20261014-0021 的操作',
    );
    expect(
      within(screen.getByRole('dialog')).getByTestId('whole-request'),
    ).toHaveTextContent('这会更新整份投保 INS-20261014-0011（3 节课）');
  });

  it('applies the instructor and status filters to requests', async () => {
    const user = await renderPage();
    await screen.findByRole('table', { name: 'Insurance requests' });
    await user.selectOptions(screen.getByLabelText('Status'), 'paid');
    await waitFor(() =>
      expect(requestsState.queries.at(-1)!.get('paymentStatus')).toBe('paid'),
    );
    expect(recordQueries.at(-1)!.get('paymentStatus')).toBe('paid');
    await screen.findByText('INS-20261006-0004');
    expect(screen.queryByText('INS-20261014-0011')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Instructor'), 'inst-2');
    expect(
      await screen.findByText('No requests match these filters.'),
    ).toBeInTheDocument();
    expect(requestsState.queries.at(-1)!.get('instructorId')).toBe('inst-2');
  });

  it('labels the requests table in Chinese', async () => {
    const user = await renderPage('zh-CN');
    const table = await screen.findByRole('table', { name: '投保记录' });
    expect(requestRow('INS-20261014-0011')).toHaveTextContent('待付款');
    await user.click(
      within(table).getByRole('button', {
        name: '展开 INS-20261014-0011 的课程',
      }),
    );
    expect(within(table).getAllByTestId('tree-lesson')[0]).toHaveTextContent(
      '第 1 节',
    );
    await requestAction(
      user,
      'INS-20261014-0011',
      '作废',
      'INS-20261014-0011 的操作',
    );
    expect(
      screen.getByRole('dialog', { name: '作废 INS-20261014-0011？' }),
    ).toHaveTextContent('这条投保记录的每一节课都会作废');
  });
});

function requestRow(requestNo: string) {
  return within(
    screen.getByRole('table', { name: /Insurance requests|投保记录/ }),
  )
    .getByText(requestNo)
    .closest('tr') as HTMLElement;
}

async function requestAction(
  user: User,
  requestNo: string,
  name: string,
  trigger = `Actions for ${requestNo}`,
) {
  await user.click(
    within(requestRow(requestNo)).getByRole('button', { name: trigger }),
  );
  await user.click(screen.getByRole('menuitem', { name }));
}

async function requestActionNames(user: User, requestNo: string) {
  await user.click(
    within(requestRow(requestNo)).getByRole('button', {
      name: `Actions for ${requestNo}`,
    }),
  );
  const names = screen.getAllByRole('menuitem').map((item) => item.textContent);
  await user.keyboard('{Escape}');
  return names;
}
