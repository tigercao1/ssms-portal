import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminInstructorRecord } from '@/lib/types';
import { PayrollPage } from './PayrollPage';
import type {
  PayrollAdjustment,
  PayrollPeriod,
  PayrollPeriodDetail,
  PayrollSettings,
} from './types';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;

function period(
  startsOn: string,
  endsOn: string,
  overrides: Partial<PayrollPeriod> = {},
): PayrollPeriod {
  return {
    id: `p-${startsOn}`,
    startsOn,
    endsOn,
    status: 'open',
    finalizedAt: null,
    finalizedBy: null,
    isCurrent: false,
    ...overrides,
  };
}

const periods = [
  period('2025-12-15', '2025-12-28'),
  period('2025-12-29', '2026-01-11', { isCurrent: true }),
  period('2026-01-12', '2026-01-25'),
];

function detailFor(p: PayrollPeriod): PayrollPeriodDetail {
  return {
    period: p,
    instructors: [
      {
        instructorId: jane.id,
        instructorName: 'Jane Snow',
        instructorNameZh: '简雪',
        email: jane.email,
        currency: 'CAD',
        lessons: 2,
        minutes: 150,
        lessonAmount: 56,
        adjustmentAmount: -12.5,
        total: 43.5,
        needsRate: 1,
      },
    ],
    lines: [
      {
        classId: 'c1',
        instructorId: jane.id,
        instructorName: 'Jane Snow',
        lessonTypeId: 'lt1',
        description: 'Private 90',
        lessonTypeNameZh: '私教90分钟',
        classStatus: 'no_show',
        startsAt: '2026-01-02T15:00:00Z',
        endsAt: '2026-01-02T16:30:00Z',
        date: '2026-01-02',
        time: '10:00',
        customerNames: ['Kai Wong'],
        minutes: 90,
        hourlyRate: 37.33,
        currency: 'CAD',
        amount: 56,
        flags: [],
      },
      {
        classId: 'c2',
        instructorId: jane.id,
        instructorName: 'Jane Snow',
        lessonTypeId: null,
        description: null,
        lessonTypeNameZh: null,
        classStatus: 'scheduled',
        startsAt: '2026-01-09T15:00:00Z',
        endsAt: '2026-01-09T16:00:00Z',
        date: '2026-01-09',
        time: '10:00',
        customerNames: [],
        minutes: 60,
        hourlyRate: null,
        currency: 'CAD',
        amount: 0,
        flags: ['needs_rate'],
      },
      {
        classId: 'c3',
        instructorId: jane.id,
        instructorName: 'Jane Snow',
        lessonTypeId: 'lt1',
        description: 'Private 90',
        lessonTypeNameZh: '私教90分钟',
        classStatus: 'completed',
        startsAt: '2026-01-10T15:00:00Z',
        endsAt: '2026-01-10T16:30:00Z',
        date: '2026-01-10',
        time: '10:00',
        customerNames: ['Ava Sun'],
        minutes: 90,
        hourlyRate: 37.33,
        currency: 'CAD',
        amount: 0,
        flags: ['already_paid'],
      },
    ],
    adjustments: [
      {
        id: 'a1',
        instructorId: jane.id,
        instructorName: 'Jane Snow',
        description: 'Advance',
        amount: -12.5,
        currency: 'CAD',
        createdAt: '2026-01-05T12:00:00Z',
      },
    ],
    totals: [{ currency: 'CAD', lessons: 2, minutes: 150, amount: 43.5 }],
    needsRateCount: 1,
  };
}

interface Calls {
  around: (string | null)[];
  finalize: unknown[];
  reopen: number;
  adjustments: unknown[];
  deleted: string[];
  settings: unknown[];
  exports: string[];
}

function serve({
  settings = { anchorDate: '2025-12-15', periodDays: 14, locked: false },
}: { settings?: PayrollSettings } = {}) {
  const calls: Calls = {
    around: [],
    finalize: [],
    reopen: 0,
    adjustments: [],
    deleted: [],
    settings: [],
    exports: [],
  };
  const state = new Map(periods.map((p) => [p.id, detailFor(p)]));
  server.use(
    http.get(`${API}/admin/instructors`, () => HttpResponse.json([jane])),
    http.get(`${API}/admin/payroll/settings`, () =>
      HttpResponse.json(settings),
    ),
    http.put(`${API}/admin/payroll/settings`, async ({ request }) => {
      const body = (await request.json()) as { anchorDate: string };
      calls.settings.push(body);
      return HttpResponse.json({ ...settings, ...body });
    }),
    http.get(`${API}/admin/payroll/periods`, ({ request }) => {
      calls.around.push(new URL(request.url).searchParams.get('around'));
      return HttpResponse.json([...state.values()].map((d) => d.period));
    }),
    http.get(`${API}/admin/payroll/periods/:id/export.csv`, ({ request }) => {
      calls.exports.push(new URL(request.url).search);
      return new HttpResponse('Instructor\r\n简雪\r\n', {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }),
    http.get(`${API}/admin/payroll/periods/:id`, ({ params }) =>
      HttpResponse.json(state.get(params.id as string)),
    ),
    http.post(
      `${API}/admin/payroll/periods/:id/finalize`,
      async ({ params, request }) => {
        const body = await request.json();
        calls.finalize.push(body);
        const current = state.get(params.id as string) as PayrollPeriodDetail;
        const next = {
          ...current,
          period: {
            ...current.period,
            status: 'finalized' as const,
            finalizedAt: '2026-01-12T15:00:00Z',
          },
        };
        state.set(current.period.id, next);
        return HttpResponse.json(next);
      },
    ),
    http.post(`${API}/admin/payroll/periods/:id/reopen`, ({ params }) => {
      calls.reopen += 1;
      const current = state.get(params.id as string) as PayrollPeriodDetail;
      const next = {
        ...current,
        period: {
          ...current.period,
          status: 'open' as const,
          finalizedAt: null,
        },
      };
      state.set(current.period.id, next);
      return HttpResponse.json(next);
    }),
    http.post(
      `${API}/admin/payroll/periods/:id/adjustments`,
      async ({ params, request }) => {
        const body = (await request.json()) as PayrollAdjustment;
        calls.adjustments.push(body);
        const current = state.get(params.id as string) as PayrollPeriodDetail;
        const created = {
          ...body,
          id: 'a2',
          instructorName: 'Jane Snow',
          currency: 'CAD',
          createdAt: '2026-01-06T00:00:00Z',
        };
        state.set(current.period.id, {
          ...current,
          adjustments: [...current.adjustments, created],
        });
        return HttpResponse.json(created, { status: 201 });
      },
    ),
    http.delete(
      `${API}/admin/payroll/periods/:id/adjustments/:adjustmentId`,
      ({ params }) => {
        calls.deleted.push(params.adjustmentId as string);
        const current = state.get(params.id as string) as PayrollPeriodDetail;
        state.set(current.period.id, {
          ...current,
          adjustments: current.adjustments.filter(
            (a) => a.id !== params.adjustmentId,
          ),
        });
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
  return calls;
}

describe('PayrollPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-07T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on the current period with totals, flags and the instructor’s lessons', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);

    expect(await screen.findByTestId('payroll-period')).toHaveTextContent(
      'Dec 29, 2025 – Jan 11, 2026',
    );
    expect(screen.getByText('Current period')).toBeInTheDocument();
    expect(screen.getByTestId('payroll-status')).toHaveTextContent('Open');
    expect(await screen.findByTestId('payroll-total')).toHaveTextContent(
      '$43.50',
    );
    expect(
      screen.getByText('Lessons without a pay rate: 1'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Classes' })).toHaveAttribute(
      'href',
      '/admin/classes',
    );

    await user.click(
      screen.getByRole('button', { name: 'Show lessons for Jane Snow' }),
    );
    const lessons = screen.getAllByRole('table')[1] as HTMLElement;
    const rows = within(lessons).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Private 90');
    expect(rows[1]).toHaveTextContent('Kai Wong');
    expect(rows[1]).toHaveTextContent('No-show');
    expect(rows[1]).toHaveTextContent('$56.00');
    expect(rows[2]).toHaveTextContent('No lesson type');
    expect(rows[2]).toHaveTextContent('Scheduled');
    expect(
      within(rows[2] as HTMLElement).getByText('Needs rate'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Fix in Classes' }),
    ).toHaveAttribute('href', '/admin/classes');
    await user.click(
      screen.getByRole('button', { name: 'Hide lessons for Jane Snow' }),
    );
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('moves between periods and back to the current one', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');

    await user.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() =>
      expect(screen.getByTestId('payroll-period')).toHaveTextContent(
        'Dec 15, 2025 – Dec 28, 2025',
      ),
    );
    expect(calls.around).toContain('2025-12-28');
    expect(screen.queryByText('Current period')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next period' }));
    await user.click(screen.getByRole('button', { name: 'Next period' }));
    await waitFor(() =>
      expect(screen.getByTestId('payroll-period')).toHaveTextContent(
        'Jan 12, 2026 – Jan 25, 2026',
      ),
    );
    expect(calls.around).toContain('2026-01-12');

    await user.click(
      screen.getByRole('button', { name: 'Go to current period' }),
    );
    expect(await screen.findByText('Current period')).toBeInTheDocument();
  });

  it('needs explicit consent to finalize with zero-rate lessons, then reopens', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');

    await user.click(screen.getByRole('button', { name: 'Finalize period' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'Lessons without a pay rate: 1. They will be paid 0.',
    );
    const confirm = within(dialog).getByRole('button', { name: 'Finalize' });
    expect(confirm).toBeDisabled();
    await user.click(
      within(dialog).getByLabelText('Finalize with these lessons at 0'),
    );
    await user.click(confirm);

    expect(await screen.findByText('Period finalized.')).toBeInTheDocument();
    expect(calls.finalize).toEqual([{ acceptZeroRate: true }]);
    expect(screen.getByTestId('payroll-status')).toHaveTextContent('Finalized');
    expect(
      screen.getByText('Reopen the period to change adjustments.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Delete adjustment/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reopen period' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Reopen',
      }),
    );
    expect(await screen.findByText('Period reopened.')).toBeInTheDocument();
    expect(calls.reopen).toBe(1);
    expect(screen.getByTestId('payroll-status')).toHaveTextContent('Open');
  });

  it('shows the API message when finalize is refused and can be cancelled', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/payroll/periods/:id/finalize`, () =>
        HttpResponse.json(
          { message: 'Some lessons have no pay rate' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');
    await user.click(screen.getByRole('button', { name: 'Finalize period' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(
      within(dialog).getByLabelText('Finalize with these lessons at 0'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Finalize' }));
    expect(
      await within(dialog).findByText('Some lessons have no pay rate'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('adds and deletes adjustments with validation', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByText('Advance');

    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));
    expect(screen.getAllByText('This field is required.')).toHaveLength(2);
    expect(
      screen.getByText('Enter a non-zero amount with at most 2 decimals.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Instructor'), jane.id);
    await user.type(screen.getByLabelText('Description'), ' Training day ');
    await user.type(screen.getByLabelText('Amount'), '80.5');
    await user.click(screen.getByRole('button', { name: 'Add adjustment' }));

    expect(await screen.findByText('Adjustment added.')).toBeInTheDocument();
    expect(calls.adjustments).toEqual([
      { instructorId: jane.id, description: 'Training day', amount: 80.5 },
    ]);
    expect(await screen.findByText('Training day')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Delete adjustment: Advance' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Advance')).not.toBeInTheDocument(),
    );
    expect(calls.deleted).toEqual(['a1']);
  });

  it('downloads both CSV files with a BOM', async () => {
    const calls = serve();
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:payroll';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');

    await user.click(screen.getByRole('button', { name: 'Payroll sheet' }));
    await user.click(screen.getByRole('button', { name: 'Detailed lines' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(2));
    expect(calls.exports).toEqual(['', '?detail=1']);
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blobs[0] as Blob);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('简雪');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:payroll');
    click.mockRestore();
  });

  it('reports a failed download', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/payroll/periods/:id/export.csv`, () =>
        HttpResponse.json(
          { message: 'Payroll period not found' },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');
    await user.click(screen.getByRole('button', { name: 'Payroll sheet' }));
    expect(
      await screen.findByText(
        'Could not download the file: Payroll period not found',
      ),
    ).toBeInTheDocument();
  });

  it('changes the anchor date in the settings panel', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await screen.findByTestId('payroll-total');

    await user.click(screen.getByRole('button', { name: 'Period settings' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('First day of a pay period');
    await waitFor(() => expect(input).toHaveValue('2025-12-15'));
    const save = within(dialog).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await user.clear(input);
    await user.type(input, '2025-12-22');
    await user.click(save);
    expect(await within(dialog).findByText('Settings saved.')).toBeVisible();
    expect(calls.settings).toEqual([{ anchorDate: '2025-12-22' }]);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('locks the anchor once a period is finalized', async () => {
    serve({
      settings: { anchorDate: '2025-12-15', periodDays: 14, locked: true },
    });
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Period settings' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        'The anchor date cannot change once a period has been finalized.',
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText('First day of a pay period'),
    ).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('renders Chinese names and labels in zh-CN', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    const user = userEvent.setup();
    renderWithProviders(<PayrollPage />);
    expect(
      await screen.findByRole('heading', { name: '工资结算' }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: '显示 简雪 的课程' }),
    );
    expect(screen.getAllByText('私教90分钟')).toHaveLength(2);
    expect(screen.getAllByText('缺少课时费').length).toBeGreaterThan(0);
  });

  it('shows an error when periods cannot load', async () => {
    server.use(
      http.get(`${API}/admin/payroll/periods`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<PayrollPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });
});
