import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  adminRecord,
  adminRecords,
  adminSummary,
} from '@/features/insurance/fixtures';
import type { AdminInsuranceRecord } from '@/features/insurance/types';
import { AdminInsurancePage, INSURANCE_PAGE_SIZE } from './AdminInsurancePage';

const API = 'http://localhost:3000';

let records: AdminInsuranceRecord[];
let total: number | null;
let summaryQueries: string[];
let recordQueries: URLSearchParams[];
let actions: { id: string; action: string; body: unknown }[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-20T17:00:00Z'));
  records = adminRecords.map((r) => ({ ...r }));
  total = null;
  summaryQueries = [];
  recordQueries = [];
  actions = [];
  server.use(
    http.get(`${API}/admin/insurance/summary`, ({ request }) => {
      summaryQueries.push(new URL(request.url).search);
      return HttpResponse.json(adminSummary);
    }),
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

function recordRow(recordNo: string) {
  return screen.getByText(recordNo).closest('tr') as HTMLElement;
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
      'Jane Snowjane@example.com$380$300$80$380 / $400Per lesson14',
    );
    expect(rows[1]).toHaveTextContent('Li Wei');
    expect(rows[1]).toHaveTextContent('$400 / $400Season pass3');
    expect(
      within(rows[0] as HTMLElement).getByRole('progressbar'),
    ).toHaveAttribute('aria-valuenow', '380');
  });

  it('lists records with the right actions per status', async () => {
    await renderPage();
    const unpaid = recordRow('INS-20261219-0002');
    expect(unpaid).toHaveTextContent('Dec 19, 2026Jane SnowWei Zhang, Amy Li');
    expect(within(unpaid).getByText('Unpaid')).toBeInTheDocument();
    expect(
      within(unpaid).getByRole('button', { name: 'Mark paid' }),
    ).toBeInTheDocument();
    expect(
      within(unpaid).queryByRole('button', { name: 'Mark unpaid' }),
    ).toBeNull();
    expect(
      within(unpaid).getByRole('button', { name: 'Void' }),
    ).toBeInTheDocument();

    const paid = recordRow('INS-20261212-0001');
    expect(paid).toHaveTextContent('Paid Dec 13, 2026');
    expect(paid).toHaveTextContent('e-transfer #8812');
    expect(
      within(paid).queryByRole('button', { name: 'Mark paid' }),
    ).toBeNull();
    expect(
      within(paid).getByRole('button', { name: 'Mark unpaid' }),
    ).toBeInTheDocument();

    const pass = recordRow('INS-20261101-0001');
    expect(pass).toHaveTextContent('Season passLi Wei');
    expect(pass).toHaveTextContent('$400');

    const voided = recordRow('INS-20261120-0003');
    expect(voided).toHaveTextContent('Voided: Duplicate registration');
    expect(within(voided).queryAllByRole('button')).toHaveLength(0);
  });

  it('marks a record paid with today as the default date and a note', async () => {
    const user = await renderPage();
    await user.click(
      within(recordRow('INS-20261219-0002')).getByRole('button', {
        name: 'Mark paid',
      }),
    );
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
        within(recordRow('INS-20261219-0002')).getByRole('button', {
          name: 'Mark unpaid',
        }),
      ).toBeInTheDocument(),
    );
  });

  it('marks a paid record unpaid after confirming', async () => {
    const user = await renderPage();
    await user.click(
      within(recordRow('INS-20261212-0001')).getByRole('button', {
        name: 'Mark unpaid',
      }),
    );
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
    await user.click(
      within(recordRow('INS-20261219-0002')).getByRole('button', {
        name: 'Void',
      }),
    );
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
    await user.click(
      within(recordRow('INS-20261219-0002')).getByRole('button', {
        name: 'Mark paid',
      }),
    );
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
    await user.click(screen.getByRole('button', { name: 'Next' }));
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
    await user.click(within(table).getByRole('button', { name: '标记已付' }));
    const paid = screen.getByRole('dialog', {
      name: '将 INS-20261212-0001 标记为已付',
    });
    expect(within(paid).getByLabelText(/付款日期/)).toHaveValue('2026-12-20');
    await user.click(within(paid).getByRole('button', { name: '取消' }));
    await user.click(within(table).getByRole('button', { name: '作废' }));
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
});
