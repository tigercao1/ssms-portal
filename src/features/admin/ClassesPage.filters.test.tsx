import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { fakeAdminList, fakeClass, listAdminClasses, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';
import { ClassesPage } from './ClassesPage';
import type {
  AdminClass,
  AdminInstructorRecord,
  LessonType,
  RefItem,
} from '@/lib/types';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

const privateLesson: LessonType = {
  id: 'lt-1',
  nameEn: 'Private 2h',
  nameZh: null,
  groupSize: 1,
  durationMin: 120,
  isPromo: false,
  active: true,
  sortOrder: 1,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const locations: RefItem[] = [
  { id: 'loc-1', key: 'loc.whistler', name: 'Whistler' },
  { id: 'loc-2', key: 'loc.blue', name: 'Blue Mountain', nameZh: '蓝山' },
];

function serve(classes: AdminClass[] = []) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/lesson-types`, () =>
      HttpResponse.json([privateLesson]),
    ),
    http.get(`${API}/reference/teaching-locations`, () =>
      HttpResponse.json(locations),
    ),
    http.get(`${API}/admin/classes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const { rows, total } = listAdminClasses(classes, params);
      return HttpResponse.json(rows, {
        headers: { 'X-Total-Count': String(total) },
      });
    }),
  );
  return queries;
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function renderPage(route = '/') {
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
const keys = (q: URLSearchParams) => [...q.keys()].sort();

describe('ClassesPage tabs, search and filters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns each tab into its own request and keeps it in the URL', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No classes yet');

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual([
      'Upcoming',
      'Recently booked',
      'Cancelled',
      'All bookings',
    ]);
    expect(screen.getByRole('tab', { name: 'All bookings' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.click(screen.getByRole('tab', { name: 'Upcoming' }));
    await waitFor(() => expect(location()).toBe('?tab=upcoming'));
    await waitFor(() => expect(last(queries).get('status')).toBe('scheduled'));
    expect(keys(last(queries))).toEqual(['from', 'limit', 'page', 'status']);
    expect(new Date(last(queries).get('from') as string)).toEqual(
      new Date('2026-12-01T12:00:00'),
    );
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Recently booked' }));
    await waitFor(() => expect(last(queries).get('sort')).toBe('createdAt'));
    expect(location()).toBe('?tab=recent');
    expect(keys(last(queries))).toEqual([
      'createdFrom',
      'limit',
      'page',
      'sort',
    ]);
    expect(new Date(last(queries).get('createdFrom') as string)).toEqual(
      new Date('2026-11-24T12:00:00'),
    );

    await user.click(screen.getByRole('tab', { name: 'Cancelled' }));
    await waitFor(() => expect(last(queries).get('status')).toBe('cancelled'));
    expect(location()).toBe('?tab=cancelled');
    expect(keys(last(queries))).toEqual(['limit', 'page', 'status']);

    await user.click(screen.getByRole('tab', { name: 'All bookings' }));
    await waitFor(() => expect(location()).toBe(''));
    await waitFor(() => expect(last(queries).has('status')).toBe(false));
    expect(keys(last(queries))).toEqual(['from', 'limit', 'page', 'to']);
    expect(screen.getByLabelText('From')).toHaveValue('2026-12-01');
  });

  it('lists recent bookings newest first with when they were booked', async () => {
    serve([
      fakeClass({
        id: 'new',
        notes: 'Booked today',
        startsAt: '2026-12-20T09:00:00',
        endsAt: '2026-12-20T10:00:00',
        createdAt: '2026-12-01T10:30:00',
      }),
      fakeClass({
        id: 'old',
        notes: 'Booked last week',
        startsAt: '2026-12-03T09:00:00',
        endsAt: '2026-12-03T10:00:00',
        createdAt: '2026-11-26T08:00:00',
      }),
    ]);
    renderPage('/?tab=recent');

    const first = await screen.findByText('Booked today');
    const second = screen.getByText('Booked last week');
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryAllByRole('region')).toHaveLength(0);
    expect(screen.getByText(/Booked Tue, Dec 1/)).toBeInTheDocument();
    expect(screen.getByText(/Booked Thu, Nov 26/)).toBeInTheDocument();
  });

  it('debounces the search box into one q request and clears it', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No classes yet');
    const before = queries.length;

    await user.type(screen.getByLabelText('Search'), ' Lily ');
    await waitFor(() => expect(location()).toBe('?q=Lily'));
    await waitFor(() => expect(last(queries).get('q')).toBe('Lily'));
    expect(queries.slice(before).map((q) => q.get('q'))).toEqual(['Lily']);
    expect(screen.getByLabelText('Search')).toHaveAttribute('maxlength', '100');

    await user.clear(screen.getByLabelText('Search'));
    await waitFor(() => expect(location()).toBe(''));
    await waitFor(() => expect(last(queries).has('q')).toBe(false));
  });

  it('keeps a space typed before the debounce fires', async () => {
    serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No classes yet');

    await user.type(screen.getByLabelText('Search'), 'john ');
    await waitFor(() => expect(location()).toBe('?q=john'));
    await user.type(screen.getByLabelText('Search'), 'smith');
    expect(screen.getByLabelText('Search')).toHaveValue('john smith');
  });

  it('filters by lesson type, location and status, and clears them all', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage('/?q=lily&instructor=inst-2');
    await screen.findByText('No classes match this search and these filters.');
    expect(screen.getByLabelText('Search')).toHaveValue('lily');

    await user.selectOptions(
      await screen.findByLabelText('Lesson type'),
      await screen.findByRole('option', { name: 'Private 2h' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Location'),
      await screen.findByRole('option', { name: 'Blue Mountain' }),
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'no_show');

    await waitFor(() => expect(last(queries).get('status')).toBe('no_show'));
    const q = last(queries);
    expect(q.get('q')).toBe('lily');
    expect(q.get('instructorId')).toBe('inst-2');
    expect(q.get('lessonTypeId')).toBe('lt-1');
    expect(q.get('locationId')).toBe('loc-2');
    expect(location()).toBe(
      '?q=lily&instructor=inst-2&lessonType=lt-1&location=loc-2&status=no_show',
    );

    const [clear] = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clear as HTMLElement);
    await waitFor(() => expect(location()).toBe(''));
    await waitFor(() =>
      expect(keys(last(queries))).toEqual(['from', 'limit', 'page', 'to']),
    );
    expect(screen.getByLabelText('Search')).toHaveValue('');
    expect(screen.getByLabelText('Lesson type')).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('keeps search and filters but drops the status when the tab changes', async () => {
    const queries = serve();
    const user = userEvent.setup();
    renderPage('/?instructor=inst-2&status=completed');
    await screen.findByText('No classes match this search and these filters.');
    expect(last(queries).get('status')).toBe('completed');

    await user.click(screen.getByRole('tab', { name: 'Cancelled' }));
    await waitFor(() =>
      expect(location()).toBe('?instructor=inst-2&tab=cancelled'),
    );
    await waitFor(() => expect(last(queries).get('status')).toBe('cancelled'));
    expect(last(queries).get('instructorId')).toBe('inst-2');

    const [, emptyStateClear] = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    await user.click(emptyStateClear as HTMLElement);
    await waitFor(() => expect(location()).toBe('?tab=cancelled'));
  });

  it('shows one instructor’s day in time order', async () => {
    const queries = serve([
      fakeClass({
        id: 'late',
        instructorId: 'inst-2',
        instructorName: 'Eddie Lee',
        notes: 'Afternoon',
        startsAt: '2026-12-05T14:00:00-05:00',
        endsAt: '2026-12-05T15:00:00-05:00',
      }),
      fakeClass({
        id: 'early',
        instructorId: 'inst-2',
        instructorName: 'Eddie Lee',
        notes: 'Morning',
        startsAt: '2026-12-05T09:00:00-05:00',
        endsAt: '2026-12-05T10:00:00-05:00',
      }),
    ]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Morning');

    await user.click(screen.getByRole('button', { name: 'One day' }));
    expect(location()).toBe('?day=2026-12-01');
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(
      screen.getByText('Pick an instructor to see their day in time order.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Day'), {
      target: { value: '2026-12-05' },
    });
    await user.selectOptions(screen.getByLabelText('Instructor'), 'inst-2');
    await waitFor(() =>
      expect(location()).toBe('?day=2026-12-05&instructor=inst-2'),
    );
    await waitFor(() =>
      expect(last(queries).get('instructorId')).toBe('inst-2'),
    );
    const q = last(queries);
    expect(q.get('from')).toBe('2026-12-05T05:00:00.000Z');
    expect(q.get('to')).toBe('2026-12-06T05:00:00.000Z');
    expect(
      screen.queryByText('Pick an instructor to see their day in time order.'),
    ).not.toBeInTheDocument();
    const [day] = screen.getAllByRole('region');
    expect(
      within(day as HTMLElement)
        .getAllByText(/Morning|Afternoon/)
        .map((n) => n.textContent),
    ).toEqual(['Morning', 'Afternoon']);

    await user.click(screen.getByRole('button', { name: 'Date range' }));
    expect(location()).toBe('?instructor=inst-2');
    expect(screen.getByLabelText('From')).toHaveValue('2026-12-01');
  });
});

describe('Export CSV on the classes list', () => {
  let click: ReturnType<typeof vi.spyOn>;
  let blobs: Blob[];

  beforeEach(() => {
    resetAuth();
    setSession(fakeSession('admin@example.com'));
    blobs = [];
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:classes';
      }),
      revokeObjectURL: vi.fn(),
    });
    click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
  });
  afterEach(() => {
    click.mockRestore();
    resetAuth();
  });

  it('downloads the current tab, search and filters with the admin token', async () => {
    serve();
    const exports: { params: URLSearchParams; auth: string | null }[] = [];
    server.use(
      http.get(`${API}/admin/classes/export`, ({ request }) => {
        exports.push({
          params: new URL(request.url).searchParams,
          auth: request.headers.get('Authorization'),
        });
        return new HttpResponse('id,startsAt\nc1,2026-12-05\n', {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition':
              'attachment; filename="classes-cancelled.csv"',
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderPage('/?tab=cancelled&q=lily&location=loc-1');
    await screen.findByText('No classes match this search and these filters.');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const [sent] = exports;
    expect(sent?.auth).toBe('Bearer test-jwt');
    expect(Object.fromEntries(sent?.params ?? [])).toEqual({
      q: 'lily',
      locationId: 'loc-1',
      status: 'cancelled',
    });
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('classes-cancelled.csv');
    expect(await (blobs[0] as Blob).text()).toBe(
      'id,startsAt\nc1,2026-12-05\n',
    );
  });

  it('shows the API message when the export is too large', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/classes/export`, () =>
        HttpResponse.json(
          { message: 'Export is limited to 10000 rows; narrow the filters.' },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No classes yet');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(
      await screen.findByText(
        'Could not export the CSV: Export is limited to 10000 rows; narrow the filters.',
      ),
    ).toBeInTheDocument();
    expect(click).not.toHaveBeenCalled();
  });
});
