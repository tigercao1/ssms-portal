import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { fakeAdminList, fakeClass, listAdminClasses, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ClassesPage } from './ClassesPage';
import type { AdminClass, AdminInstructorRecord } from '@/lib/types';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const API = 'http://localhost:3000';
const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

function serve(classes: AdminClass[] = [], total?: number) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/classes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const statuses = params.get('status')?.split(',');
      const { rows, total: count } = listAdminClasses(
        statuses ? classes.filter((c) => statuses.includes(c.status)) : classes,
        params,
      );
      return HttpResponse.json(rows, {
        headers: { 'X-Total-Count': String(total ?? count) },
      });
    }),
  );
  return queries;
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function renderPage(route = '/?view=calendar') {
  return renderWithProviders(
    <>
      <ClassesPage />
      <LocationProbe />
    </>,
    { route },
  );
}

const location = () => screen.getByTestId('location').textContent;
const last = (queries: URLSearchParams[]) => queries.at(-1) as URLSearchParams;

function lesson(id: string, startsAt: string, extra: Partial<AdminClass> = {}) {
  const end = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
  return fakeClass({ id, startsAt, endsAt: end, ...extra });
}

describe('ClassesPage calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T17:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('switches between list and calendar in the URL and loads the month unpaged', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage('/?tab=upcoming');
    await screen.findByText('No classes yet');

    await user.click(screen.getByRole('button', { name: 'Calendar' }));
    await waitFor(() => expect(location()).toBe('?tab=upcoming&view=calendar'));
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export CSV' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(last(queries).get('to')).toBe('2026-12-06T05:00:00.000Z'),
    );
    const q = last(queries);
    expect([...q.keys()].sort()).toEqual(['from', 'status', 'to']);
    expect(q.get('from')).toBe('2026-11-01T04:00:00.000Z');
    expect(q.get('status')).toBe('scheduled,completed,no_show');

    await user.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(location()).toBe('?tab=upcoming'));
    expect(
      await screen.findByRole('tab', { name: 'Upcoming' }),
    ).toBeInTheDocument();
  });

  it('steps months and weeks with previous, next and today', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('November 2026');

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await waitFor(() =>
      expect(location()).toBe('?view=calendar&date=2026-10-01'),
    );
    expect(await screen.findByText('October 2026')).toBeInTheDocument();
    await waitFor(() =>
      expect(last(queries).get('from')).toBe('2026-09-27T04:00:00.000Z'),
    );

    await user.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(location()).toBe('?view=calendar'));

    await user.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(location()).toBe('?view=calendar&cal=week'));
    await waitFor(() =>
      expect(last(queries).get('from')).toBe('2026-11-08T05:00:00.000Z'),
    );
    expect(last(queries).get('to')).toBe('2026-11-15T05:00:00.000Z');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(location()).toBe('?view=calendar&cal=week&date=2026-11-15'),
    );
    await waitFor(() =>
      expect(last(queries).get('from')).toBe('2026-11-15T05:00:00.000Z'),
    );
    expect(screen.getByText(/Nov 15.*21, 2026/)).toBeInTheDocument();
  });

  it('applies the shared filters and shows cancelled through the status filter', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage('/?view=calendar&cal=week&q=lily');
    await screen.findByText('Sunday, Nov 8');
    expect(last(queries).get('q')).toBe('lily');
    expect(
      screen.getByText(
        'Cancelled bookings are hidden. Pick Cancelled to see them.',
      ),
    ).toBeInTheDocument();

    await user.selectOptions(
      screen.getByLabelText('Instructor'),
      await screen.findByRole('option', { name: 'Eddie Lee' }),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'cancelled');
    await waitFor(() => expect(last(queries).get('status')).toBe('cancelled'));
    expect(last(queries).get('instructorId')).toBe('inst-2');
    expect(location()).toBe(
      '?view=calendar&cal=week&q=lily&instructor=inst-2&status=cancelled',
    );

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location()).toBe('?view=calendar&cal=week'));
  });

  it('shows three bookings per month day, then +N more, and opens the day list on tap', async () => {
    const queries = serve([
      lesson('a', '2026-11-12T14:00:00Z'),
      lesson('b', '2026-11-12T15:00:00Z'),
      lesson('c', '2026-11-12T16:00:00Z'),
      lesson('d', '2026-11-12T17:00:00Z'),
      lesson('e', '2026-11-12T18:00:00Z'),
      lesson('f', '2026-11-13T02:30:00Z', { lessonTypeNameEn: 'Group 1h' }),
    ]);
    const user = userEvent.setup();
    renderPage('/?view=calendar&instructor=inst-1');

    const day = await screen.findByRole('button', {
      name: 'Thursday, November 12: 6 bookings',
    });
    expect(within(day).getByText('+3 more')).toBeInTheDocument();
    expect(
      within(day).getByText(/09:00 Private 2h · Jane Snow/),
    ).toBeInTheDocument();
    expect(within(day).queryByText(/12:00/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Friday, November 13: 0 bookings' }),
    ).toBeInTheDocument();

    await user.click(day);
    await waitFor(() =>
      expect(location()).toBe(
        '?instructor=inst-1&day=2026-11-12&status=scheduled%2Ccompleted%2Cno_show',
      ),
    );
    expect(await screen.findByLabelText('Day')).toHaveValue('2026-11-12');
    await waitFor(() => expect(last(queries).get('limit')).toBe('50'));
  });

  it('opens the day list with the same bookings the cell counted', async () => {
    const queries = serve([
      lesson('a', '2026-11-25T14:00:00Z', { lessonTypeNameEn: 'Row A' }),
      lesson('b', '2026-11-25T15:00:00Z', {
        status: 'completed',
        lessonTypeNameEn: 'Row B',
      }),
      lesson('c', '2026-11-25T22:00:00Z', {
        status: 'cancelled',
        lessonTypeNameEn: 'Row C',
      }),
    ]);
    const rows = () => screen.queryAllByText(/Row [ABC]/);
    const user = userEvent.setup();
    renderPage();

    const day = await screen.findByRole('button', {
      name: 'Wednesday, November 25: 2 bookings',
    });
    const cellStatus = last(queries).get('status');
    await user.click(day);
    await waitFor(() => expect(last(queries).get('limit')).toBe('50'));
    expect(last(queries).get('status')).toBe(cellStatus);
    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(screen.getByLabelText('Status')).toHaveDisplayValue(
      'Any status except cancelled',
    );

    await user.selectOptions(screen.getByLabelText('Status'), '');
    await waitFor(() => expect(location()).toBe('?day=2026-11-25'));
    await waitFor(() => expect(rows()).toHaveLength(3));
  });

  it('carries an explicit calendar status into the day list', async () => {
    const queries = serve([
      lesson('a', '2026-11-25T14:00:00Z'),
      lesson('c', '2026-11-25T22:00:00Z', { status: 'cancelled' }),
    ]);
    const user = userEvent.setup();
    renderPage('/?view=calendar&status=cancelled');

    await user.click(
      await screen.findByRole('button', {
        name: 'Wednesday, November 25: 1 bookings',
      }),
    );
    await waitFor(() =>
      expect(location()).toBe('?status=cancelled&day=2026-11-25'),
    );
    await waitFor(() => expect(last(queries).get('limit')).toBe('50'));
    expect(last(queries).get('status')).toBe('cancelled');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location()).toBe(''));
  });

  it('gives the previous and next buttons a 44px minimum width on phones', async () => {
    serve();
    renderPage();
    await screen.findByText('November 2026');
    for (const name of ['Previous', 'Next']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass('min-w-11', 'sm:min-w-0');
    }
  });

  it('lists the week in time order with status, customers and actions', async () => {
    serve([
      lesson('late', '2026-11-10T20:00:00Z', {
        lessonTypeNameEn: 'Group 1h',
        status: 'completed',
        participants: [
          {
            customerId: 'cu1',
            firstName: 'Lily',
            lastName: 'Chen',
            email: null,
            phone: null,
            attendance: 'attended',
          },
          {
            customerId: 'cu2',
            firstName: 'Max',
            lastName: 'Chen',
            email: null,
            phone: null,
            attendance: 'attended',
          },
        ],
      }),
      lesson('early', '2026-11-10T14:00:00Z', { googleSyncStatus: 'failed' }),
    ]);
    renderPage('/?view=calendar&cal=week');

    const tuesday = await screen.findByRole('region', {
      name: 'Tuesday, Nov 10',
    });
    await within(tuesday).findByText('Group 1h');
    const text = tuesday.textContent ?? '';
    expect(text.indexOf('09:00 – 10:00')).toBeLessThan(
      text.indexOf('15:00 – 16:00'),
    );
    expect(within(tuesday).getByText('Completed')).toBeInTheDocument();
    expect(
      within(tuesday).getByText('Jane Snow · Customers: 2'),
    ).toBeInTheDocument();
    expect(
      within(tuesday).getByText('Calendar sync failed'),
    ).toBeInTheDocument();
    expect(
      within(tuesday).getAllByRole('button', { name: /More actions for/ }),
    ).toHaveLength(2);
    expect(
      within(screen.getByRole('region', { name: 'Monday, Nov 9' })).getByText(
        'No bookings',
      ),
    ).toBeInTheDocument();
  });

  it('warns when the API holds more bookings than it returned', async () => {
    serve([lesson('a', '2026-11-12T14:00:00Z')], 1500);
    renderPage();
    expect(
      await screen.findByText(
        'Showing the first 1 of 1500 bookings. Narrow the filters to see the rest.',
      ),
    ).toBeInTheDocument();
  });

  it('renders in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve([lesson('a', '2026-11-12T14:00:00Z')], 1200);
    renderPage();
    expect(await screen.findByRole('button', { name: '日历' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      await screen.findByText(/仅显示前 1 节课（共 1200 节）/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '月' })).toBeInTheDocument();
  });
});
