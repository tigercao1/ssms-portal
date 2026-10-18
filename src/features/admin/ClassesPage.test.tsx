import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { fakeAdminList, fakeClass, listAdminClasses, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ClassesPage } from './ClassesPage';
import { hideSyncToast } from './booking/syncToast';
import type { AdminClass, AdminInstructorRecord } from '@/lib/types';
import { expectMaskedInReplay } from '@/test/replayPrivacy';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

function serve(classes: AdminClass[], { slowPages = [] as number[] } = {}) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/classes`, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      if (slowPages.includes(Number(params.get('page')))) await delay(150);
      const { rows, total } = listAdminClasses(classes, params);
      return HttpResponse.json(rows, {
        headers: { 'X-Total-Count': String(total) },
      });
    }),
  );
  return queries;
}

function manyClasses(
  count: number,
  overrides: Partial<AdminClass> = {},
): AdminClass[] {
  return Array.from({ length: count }, (_, i) => {
    const day = String(2 + Math.floor(i / 5)).padStart(2, '0');
    const hour = String(8 + (i % 5)).padStart(2, '0');
    return fakeClass({
      id: `c${i + 1}`,
      startsAt: `2026-12-${day}T${hour}:00:00`,
      endsAt: `2026-12-${day}T${hour}:45:00`,
      notes: `Lesson ${i + 1}`,
      ...overrides,
    });
  });
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

describe('ClassesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
    hideSyncToast();
  });

  it('flags lessons whose calendar sync failed and retries them', async () => {
    const failed = fakeClass({
      id: 'c1',
      startsAt: '2026-12-05T09:00:00',
      endsAt: '2026-12-05T11:00:00',
      googleCalendarId: 'jane@group.calendar.google.com',
      googleSyncStatus: 'failed',
      googleSyncError: '503:backendError',
      googleSyncAttempts: 2,
    });
    serve([failed, fakeClass({ id: 'c2', startsAt: '2026-12-05T13:00:00' })]);
    const retries: string[] = [];
    server.use(
      http.get(`${API}/admin/booking/sync-issues`, () =>
        HttpResponse.json({
          classes: [
            {
              ...failed,
              calendarSync: 'failed',
              calendarSyncError: '503:backendError',
            },
          ],
          deletions: [
            {
              id: 'd1',
              googleCalendarId: 'jane@group.calendar.google.com',
              googleEventId: 'old',
              classId: null,
              attempts: 3,
              lastError: '500',
              lastAttemptAt: null,
              createdAt: '2026-12-01T00:00:00Z',
            },
          ],
        }),
      ),
      http.post(`${API}/admin/booking/classes/:id/sync`, ({ params }) => {
        retries.push(params.id as string);
        return HttpResponse.json({
          ...failed,
          googleSyncAttempts: 3,
          calendarSync: 'failed',
          calendarSyncError: '503:backendError',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassesPage />);

    const banner = await screen.findByText(
      /Lessons not yet updated in Google Calendar: 1\./,
    );
    expect(banner).toHaveTextContent('Old Google events still to delete: 1.');
    await user.click(screen.getByRole('button', { name: 'Show list' }));
    const list = document.getElementById('calendar-sync-issues') as HTMLElement;
    expect(
      within(list).getByText('Google said: 503:backendError'),
    ).toBeInTheDocument();
    expectMaskedInReplay(within(list).getByText(/Jane Snow/));
    await user.click(screen.getByRole('button', { name: 'Hide list' }));
    expect(document.getElementById('calendar-sync-issues')).toBeNull();

    const [day] = await screen.findAllByRole('region');
    const badges = within(day as HTMLElement).getAllByText(
      'Calendar sync failed',
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveAttribute('title', 'Google said: 503:backendError');
    await user.click(
      within(day as HTMLElement).getByRole('button', { name: 'Retry' }),
    );
    await waitFor(() => expect(retries).toEqual(['c1']));
    expect(
      await screen.findByText(
        'Saved. Google Calendar not updated yet; it will retry.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty state and asks for the next four weeks', async () => {
    const queries = serve([]);
    renderWithProviders(<ClassesPage />);

    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
    expect(
      screen.getByText('Lessons you book appear here.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveValue('2026-12-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-12-29');
    const q = queries.at(-1) as URLSearchParams;
    expect(new Date(q.get('from') as string)).toEqual(
      new Date('2026-12-01T00:00:00'),
    );
    expect(new Date(q.get('to') as string)).toEqual(
      new Date('2026-12-30T00:00:00'),
    );
    expect(q.has('instructorId')).toBe(false);
    expect(q.get('page')).toBe('1');
    expect(q.get('limit')).toBe('50');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('groups classes by day in time order with instructor, status and students', async () => {
    serve([
      fakeClass({
        id: 'c2',
        instructorId: 'inst-2',
        instructorName: 'Eddie Lee',
        lessonTypeNameEn: 'Promo 1-on-2 1h',
        lessonTypeNameZh: '特价课 一对二',
        durationMin: 60,
        groupSize: 2,
        isPromo: true,
        locationName: 'Blue Mountain',
        startsAt: '2026-12-05T13:00:00',
        endsAt: '2026-12-05T15:00:00',
        status: 'completed',
        notes: 'Bring rental skis',
        participants: [
          {
            customerId: 'cu1',
            firstName: 'Lily',
            lastName: 'Chen',
            email: 'lily@example.com',
            phone: null,
            attendance: 'attended',
          },
          {
            customerId: 'cu2',
            firstName: null,
            lastName: null,
            email: 'max@example.com',
            phone: null,
            attendance: 'no_show',
          },
        ],
      }),
      fakeClass({
        id: 'c1',
        startsAt: '2026-12-05T09:00:00',
        endsAt: '2026-12-05T11:00:00',
      }),
      fakeClass({
        id: 'c3',
        startsAt: '2026-12-07T09:00:00',
        endsAt: '2026-12-07T10:00:00',
        status: 'cancelled',
      }),
    ]);
    renderWithProviders(<ClassesPage />);

    const days = await screen.findAllByRole('region');
    const [dayOne, dayTwo] = days as [HTMLElement, HTMLElement];
    expect(days).toHaveLength(2);
    expect(dayOne).toHaveAccessibleName(/Dec 5, 2026/);
    expect(dayTwo).toHaveAccessibleName(/Dec 7, 2026/);

    const first = within(dayOne);
    const names = first
      .getAllByText(/Jane Snow|Eddie Lee/)
      .map((n) => n.textContent);
    expect(names).toEqual(['Jane Snow', 'Eddie Lee']);
    expect(first.getByText('Scheduled')).toBeInTheDocument();
    expect(first.getByText('No students yet')).toBeInTheDocument();
    expect(first.getByText('Completed')).toBeInTheDocument();
    expect(first.getByText('Lily Chen')).toHaveTextContent(
      'Lily Chen · Attended',
    );
    expect(first.getByText(/max@example\.com/)).toHaveTextContent(
      'max@example.com · No-show',
    );
    expect(first.getByText('Bring rental skis')).toBeInTheDocument();
    for (const personal of [
      ...first.getAllByText(/Jane Snow|Eddie Lee/),
      first.getByText('Lily Chen'),
      first.getByText(/max@example\.com/),
      first.getByText('Bring rental skis'),
    ])
      expectMaskedInReplay(personal);
    expect(first.getByText('Private 2h')).toBeInTheDocument();
    expect(first.getByText('Promo 1-on-2 1h')).toBeInTheDocument();
    expect(first.getByText('· 60 min')).toBeInTheDocument();
    expect(first.getByText('· 2 per lesson')).toBeInTheDocument();
    expect(first.getByText('· Blue Mountain')).toBeInTheDocument();
    expect(first.getAllByText('Promo')).toHaveLength(1);
    expect(within(dayTwo).getByText('Cancelled')).toBeInTheDocument();
  });

  it('uses Chinese lesson type and instructor names, and flags a class without a type', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve([
      fakeClass({ id: 'c1', instructorNameZh: '简·斯诺' }),
      fakeClass({
        id: 'c2',
        startsAt: '2026-12-05T20:00:00',
        endsAt: '2026-12-05T21:00:00',
        lessonTypeId: null,
        lessonTypeNameEn: null,
        lessonTypeNameZh: null,
        durationMin: null,
        groupSize: null,
        isPromo: null,
      }),
    ]);
    renderWithProviders(<ClassesPage />);

    expect(await screen.findByText('1对1滑雪课 - 2小时')).toBeInTheDocument();
    expect(screen.getByText('简·斯诺')).toBeInTheDocument();
    expect(screen.getByText('未设置课程类型')).toBeInTheDocument();
  });

  it('filters by instructor', async () => {
    const queries = serve([
      fakeClass({ id: 'c1' }),
      fakeClass({
        id: 'c2',
        instructorId: 'inst-2',
        instructorName: 'Eddie Lee',
      }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<ClassesPage />);
    await screen.findByText('Eddie Lee', { selector: 'span' });

    await user.selectOptions(screen.getByLabelText('Instructor'), 'inst-2');

    await waitFor(() =>
      expect(
        screen.queryByText('Jane Snow', { selector: 'span' }),
      ).not.toBeInTheDocument(),
    );
    expect(queries.at(-1)?.get('instructorId')).toBe('inst-2');
  });

  it('flags a reversed date range and does not query it', async () => {
    const queries = serve([]);
    renderWithProviders(<ClassesPage />);
    await screen.findByText('No classes yet');
    const before = queries.length;

    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-11-20' },
    });

    expect(
      screen.getByText('The end date must be on or after the start date.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No classes yet')).not.toBeInTheDocument();
    expect(queries.length).toBe(before);
  });

  it('pages 50 classes at a time, keeping the previous page while the next loads', async () => {
    serve(manyClasses(120), { slowPages: [2] });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Showing 1–50 of 120')).toBeInTheDocument();
    expect(screen.getByText('Lesson 1')).toBeInTheDocument();
    expect(screen.getByText('Lesson 50')).toBeInTheDocument();
    expect(screen.queryByText('Lesson 51')).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Lesson 1')).toBeInTheDocument();
    expect(screen.getByText('Lesson 1').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    expect(
      await screen.findByText('Showing 51–100 of 120'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lesson 1')).not.toBeInTheDocument();
    expect(screen.getByText('Lesson 51')).toBeInTheDocument();
    expect(location()).toBe('?page=2');

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Showing 1–50 of 120')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('disables Next on the last page', async () => {
    serve(manyClasses(120));
    renderPage('/?page=3');
    expect(
      await screen.findByText('Showing 101–120 of 120'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('restores the instructor, dates and page from the URL', async () => {
    const queries = serve(
      manyClasses(60, { instructorId: 'inst-2', instructorName: 'Eddie Lee' }),
    );
    renderPage('/?instructor=inst-2&from=2026-12-02&to=2026-12-20&page=2');

    expect(await screen.findByText('Showing 51–60 of 60')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveValue('2026-12-02');
    expect(screen.getByLabelText('To')).toHaveValue('2026-12-20');
    await waitFor(() =>
      expect(screen.getByLabelText('Instructor')).toHaveValue('inst-2'),
    );
    const q = queries.at(-1) as URLSearchParams;
    expect(q.get('instructorId')).toBe('inst-2');
    expect(q.get('page')).toBe('2');
    expect(q.get('limit')).toBe('50');
    expect(new Date(q.get('from') as string)).toEqual(
      new Date('2026-12-02T00:00:00'),
    );
  });

  it('goes back to page 1 when the instructor or dates change', async () => {
    const queries = serve([
      ...manyClasses(80),
      fakeClass({
        id: 'e1',
        instructorId: 'inst-2',
        instructorName: 'Eddie Lee',
        startsAt: '2026-12-03T15:00:00',
        endsAt: '2026-12-03T16:00:00',
      }),
    ]);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(await screen.findByText('Showing 51–81 of 81')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Instructor'), 'inst-2');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(location()).toBe('?instructor=inst-2');
    expect(queries.at(-1)?.get('page')).toBe('1');

    await user.selectOptions(screen.getByLabelText('Instructor'), '');
    expect(await screen.findByText('Showing 1–50 of 81')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Showing 51–81 of 81')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-12-02' },
    });
    await waitFor(() => expect(location()).toBe('?from=2026-12-02'));
    expect(await screen.findByText('Showing 1–50 of 81')).toBeInTheDocument();
    expect(queries.at(-1)?.get('page')).toBe('1');
  });

  it('offers Previous when a page past the end comes back empty', async () => {
    serve(manyClasses(3));
    const user = userEvent.setup();
    renderPage('/?page=4');
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Showing 1–3 of 3')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('falls back to the rows it has when the total header is missing', async () => {
    server.use(
      http.get(`${API}/admin/classes`, () => HttpResponse.json(manyClasses(2))),
    );
    renderPage();
    expect(await screen.findByText('Showing 1–2 of 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('labels the pager in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve(manyClasses(60));
    renderPage();
    expect(await screen.findByText('第 1–50 节，共 60 节')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '课程分页' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
  });

  it('shows the API error', async () => {
    serve([]);
    server.use(
      http.get(`${API}/admin/classes`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<ClassesPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });
});
