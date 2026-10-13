import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeClass, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ClassesPage } from './ClassesPage';
import type { AdminClass, AdminInstructorRecord } from '@/lib/types';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

function serve(classes: AdminClass[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/classes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const id = params.get('instructorId');
      return HttpResponse.json(
        id ? classes.filter((c) => c.instructorId === id) : classes,
      );
    }),
  );
  return queries;
}

describe('ClassesPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
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
