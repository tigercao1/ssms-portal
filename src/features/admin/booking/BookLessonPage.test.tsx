import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  fakeAdminList,
  fakeClass,
  fakeCustomer,
  fakeLessonType,
  server,
} from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { BookLessonPage } from './BookLessonPage';
import { hideSyncToast } from './syncToast';
import type {
  Availability,
  BookingSettings,
  CreateBookingInput,
  LastClass,
} from './types';

const API = 'http://localhost:3000';

const lily = fakeCustomer();
const max = fakeCustomer({
  id: 'cu2',
  firstName: 'Max',
  lastName: 'Wu',
  email: 'max@example.com',
  phone: null,
});
const private1h = fakeLessonType({
  id: 'lt1',
  nameEn: 'Private 1h',
  nameZh: '私教 1 小时',
  durationMin: 60,
});
const retired = fakeLessonType({ id: 'lt9', nameEn: 'Retired', active: false });

const settings: BookingSettings = {
  dayStartTime: '08:00',
  dayEndTime: '18:00',
  slotMinutes: 30,
  weekdayOverrides: {},
  updatedAt: '2026-10-01T00:00:00Z',
};

function availability(overrides: Partial<Availability> = {}): Availability {
  return {
    date: '2026-12-12',
    timeZone: 'America/Toronto',
    lessonTypeId: 'lt1',
    durationMin: 60,
    slotMinutes: 60,
    window: { start: '09:00', end: '12:00' },
    slots: [
      '2026-12-12T14:00:00.000Z',
      '2026-12-12T15:00:00.000Z',
      '2026-12-12T16:00:00.000Z',
    ],
    instructors: [
      {
        instructorId: 'inst-1',
        displayNameEn: 'Jane Snow',
        displayNameZh: '简雪',
        googleCalendarId: 'jane@group.calendar.google.com',
        busy: [
          {
            start: '2026-12-12T14:00:00Z',
            end: '2026-12-12T15:00:00Z',
            source: 'google',
          },
        ],
        freeSlots: ['2026-12-12T15:00:00.000Z', '2026-12-12T16:00:00.000Z'],
      },
    ],
    unavailable: [
      {
        instructorId: 'inst-2',
        displayNameEn: 'Eddie Lee',
        displayNameZh: null,
        reason: 'calendar_not_writable',
      },
    ],
    ...overrides,
  };
}

interface Recorded {
  bookings: CreateBookingInput[];
  availabilityQueries: URLSearchParams[];
  settingsPuts: unknown[];
}

function serve({
  avail = availability(),
  last = null,
  bookResponse,
}: {
  avail?: Availability;
  last?: LastClass | null;
  bookResponse?: () => Response;
} = {}): Recorded {
  const recorded: Recorded = {
    bookings: [],
    availabilityQueries: [],
    settingsPuts: [],
  };
  server.use(
    http.get(`${API}/admin/lesson-types`, () =>
      HttpResponse.json([private1h, retired]),
    ),
    http.get(`${API}/admin/customers`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      return HttpResponse.json(
        [lily, max].filter((c) =>
          `${c.firstName} ${c.lastName}`
            .toLowerCase()
            .includes(q.toLowerCase()),
        ),
      );
    }),
    http.post(`${API}/admin/customers`, async ({ request }) => {
      const body = (await request.json()) as {
        firstName: string;
        lastName: string;
      };
      return HttpResponse.json(
        fakeCustomer({ id: 'cu-new', ...body, email: null, phone: null }),
      );
    }),
    http.get(`${API}/admin/booking/settings`, () =>
      HttpResponse.json(settings),
    ),
    http.put(`${API}/admin/booking/settings`, async ({ request }) => {
      const body = await request.json();
      recorded.settingsPuts.push(body);
      return HttpResponse.json({
        ...settings,
        ...(body as object),
        updatedAt: 'now',
      });
    }),
    http.get(`${API}/admin/booking/availability`, ({ request }) => {
      recorded.availabilityQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json(avail);
    }),
    http.get(`${API}/admin/booking/customers/:id/last`, () =>
      HttpResponse.json({ last }),
    ),
    http.post(`${API}/admin/booking/classes`, async ({ request }) => {
      const body = (await request.json()) as CreateBookingInput;
      recorded.bookings.push(body);
      if (bookResponse) return bookResponse();
      return HttpResponse.json(
        [fakeClass({ id: 'new', startsAt: body.startsAt })],
        { status: 201 },
      );
    }),
  );
  return recorded;
}

async function pickLily(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Find a customer'), 'lil');
  const results = await screen.findByRole('listbox', {
    name: 'Matching customers',
  });
  await user.click(within(results).getByRole('option', { name: /Lily Chen/ }));
}

async function chooseLesson(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /Private 1h/ });
  await user.selectOptions(screen.getByLabelText('Lesson type'), 'lt1');
}

describe('BookLessonPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-10T17:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    hideSyncToast();
  });

  it('books a free slot from the availability grid', async () => {
    const recorded = serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);

    await pickLily(user);
    expect(
      within(
        screen.getByRole('list', { name: 'Selected customers' }),
      ).getByText('Lily Chen'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-12-10');
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-12-12' },
    });
    await chooseLesson(user);
    expect(
      screen.queryByRole('option', { name: /Retired/ }),
    ).not.toBeInTheDocument();

    const grid = await screen.findByRole('table');
    expect(
      within(grid).getByRole('columnheader', { name: '09:00' }),
    ).toBeInTheDocument();
    expect(within(grid).getAllByLabelText('Busy')).toHaveLength(1);
    expect(
      screen.getByRole('region', { name: 'Not bookable' }),
    ).toHaveTextContent('Eddie Lee · calendar is read-only');
    const query = recorded.availabilityQueries.at(-1);
    expect(query?.get('date')).toBe('2026-12-12');
    expect(query?.get('lessonTypeId')).toBe('lt1');

    await user.click(
      screen.getByRole('button', { name: 'Book Jane Snow at 10:00' }),
    );
    const form = screen.getByRole('form', { name: 'Confirm booking' });
    expect(within(form).getByText('Lily Chen')).toBeInTheDocument();
    expect(within(form).getByText(/Dec 12, 2026/)).toHaveTextContent('10:00');
    await user.selectOptions(within(form).getByLabelText('Repeat'), '3');
    await user.selectOptions(within(form).getByLabelText('Location'), 'l1');
    await user.type(within(form).getByLabelText('Notes'), ' first lesson ');
    await user.click(within(form).getByRole('button', { name: 'Book lesson' }));

    expect(await screen.findByText('Booked')).toBeInTheDocument();
    expect(recorded.bookings).toEqual([
      {
        instructorId: 'inst-1',
        lessonTypeId: 'lt1',
        startsAt: '2026-12-12T15:00:00.000Z',
        customerIds: ['cu1'],
        notes: 'first lesson',
        locationId: 'l1',
        repeat: { weekly: true, count: 3 },
      },
    ]);
    expect(
      screen.queryByRole('form', { name: 'Confirm booking' }),
    ).not.toBeInTheDocument();
  });

  it('needs a customer before booking', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    await user.click(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    );
    expect(
      screen.getByText('Add at least one customer first.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book lesson' })).toBeDisabled();
  });

  it('lists the clashing times when the slot was taken meanwhile', async () => {
    serve({
      bookResponse: () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message: 'The instructor is not free at that time',
            conflicts: [
              {
                occurrence: 1,
                startsAt: '2026-12-19T15:00:00.000Z',
                endsAt: '2026-12-19T16:00:00.000Z',
                busyStart: '2026-12-19T15:30:00.000Z',
                busyEnd: '2026-12-19T16:30:00.000Z',
                source: 'ssms',
              },
            ],
          },
          { status: 409 },
        ),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await chooseLesson(user);
    await user.click(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    );
    await user.click(screen.getByRole('button', { name: 'Book lesson' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That time is no longer free');
    expect(alert).toHaveTextContent(
      /Dec 19, 2026.*10:00: busy 10:30–11:30 \(another lesson\)/,
    );
  });

  it('explains a Google Calendar failure with its code', async () => {
    serve({
      bookResponse: () =>
        HttpResponse.json(
          {
            statusCode: 502,
            message: 'Google Calendar request failed',
            googleStatus: 403,
            googleReason: 'forbidden',
          },
          { status: 502 },
        ),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await chooseLesson(user);
    await user.click(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    );
    await user.click(screen.getByRole('button', { name: 'Book lesson' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Google Calendar could not be checked');
    expect(alert).toHaveTextContent(
      'Nothing was saved. Google said: 403 forbidden.',
    );
  });

  it('warns when the lesson was saved but Google Calendar was not updated', async () => {
    serve({
      bookResponse: () =>
        HttpResponse.json(
          [
            {
              ...fakeClass({ id: 'new' }),
              googleSyncStatus: 'failed',
              calendarSync: 'failed',
              calendarSyncError: '503:backendError',
            },
          ],
          { status: 201 },
        ),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await chooseLesson(user);
    await user.click(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    );
    await user.click(screen.getByRole('button', { name: 'Book lesson' }));

    expect(await screen.findByText('Booked')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Saved. Google Calendar not updated yet; it will retry.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(
      screen.queryByText(
        'Saved. Google Calendar not updated yet; it will retry.',
      ),
    ).not.toBeInTheDocument();
  });

  it('filters the grid by instructor name', async () => {
    const base = availability();
    serve({
      avail: availability({
        instructors: [
          ...base.instructors,
          {
            ...base.instructors[0]!,
            instructorId: 'inst-3',
            displayNameEn: 'Mia Park',
            displayNameZh: null,
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    const grid = await screen.findByRole('table');
    expect(within(grid).getAllByRole('rowheader')).toHaveLength(2);

    const search = screen.getByLabelText('Find instructor');
    await user.type(search, 'MIA');
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('rowheader')
        .map((r) => r.textContent),
    ).toEqual(['Mia Park']);
    expect(
      screen.queryByRole('region', { name: 'Not bookable' }),
    ).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, '简');
    expect(
      within(screen.getByRole('table'))
        .getAllByRole('rowheader')
        .map((r) => r.textContent),
    ).toEqual(['Jane Snow']);

    await user.clear(search);
    await user.type(search, 'eddie');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      screen.getByText('No instructor matches “eddie”.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Not bookable' }),
    ).toHaveTextContent('Eddie Lee');
  });

  it('labels each hour at its first slot and drops start times the lesson cannot fit', async () => {
    const half = (h: number, m: number) =>
      new Date(Date.UTC(2026, 11, 12, h + 5, m)).toISOString();
    const slots = [
      half(9, 0),
      half(9, 30),
      half(10, 0),
      half(10, 30),
      half(11, 0),
      half(11, 30),
    ];
    const base = availability();
    serve({
      avail: availability({
        slotMinutes: 30,
        slots,
        instructors: [
          { ...base.instructors[0]!, busy: [], freeSlots: slots.slice(0, 5) },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    const grid = await screen.findByRole('table');
    const headers = within(grid)
      .getAllByRole('columnheader')
      .slice(1)
      .map((th) => [th.textContent, th.getAttribute('colspan')]);
    expect(headers).toEqual([
      ['09:00', '2'],
      ['10:00', '2'],
      ['11:00', '1'],
    ]);
    expect(
      within(grid).getAllByRole('button', { name: /^Book Jane Snow/ }),
    ).toHaveLength(5);
    expect(
      within(grid).queryByRole('button', { name: 'Book Jane Snow at 11:30' }),
    ).not.toBeInTheDocument();
  });

  it('creates a new customer from the dialog and adds them', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'New customer' }));
    const dialog = screen.getByRole('dialog', { name: 'New customer' });
    await user.type(within(dialog).getByLabelText(/First name/), 'Ada');
    await user.type(within(dialog).getByLabelText(/Last name/), 'Ho');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create customer' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      within(
        screen.getByRole('list', { name: 'Selected customers' }),
      ).getByText('Ada Ho'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Ada Ho' }));
    expect(
      screen.queryByRole('list', { name: 'Selected customers' }),
    ).not.toBeInTheDocument();
  });

  it('closes the dialog with Escape', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'New customer' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('prefills the same lesson as last time and picks the slot when free', async () => {
    const recorded = serve({
      last: {
        classId: 'old',
        startsAt: '2026-12-05T15:00:00.000Z',
        weekday: 'sat',
        time: '10:00',
        lessonTypeId: 'lt1',
        lessonTypeNameEn: 'Private 1h',
        lessonTypeNameZh: null,
        instructorId: 'inst-1',
        instructorName: 'Jane Snow',
        instructorNameZh: null,
        locationId: null,
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await user.click(screen.getByRole('button', { name: 'Same as last time' }));

    expect(
      await screen.findByText(/Last lesson: Private 1h with Jane Snow/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-12-12');
    expect(screen.getByLabelText('Lesson type')).toHaveValue('lt1');
    expect(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('form', { name: 'Confirm booking' }),
    ).toBeInTheDocument();
    expect(recorded.availabilityQueries.at(-1)?.get('date')).toBe('2026-12-12');
  });

  it('says when the customer has no earlier lessons', async () => {
    serve({ last: null });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await user.click(screen.getByRole('button', { name: 'Same as last time' }));
    expect(
      await screen.findByText('No earlier lessons for this customer.'),
    ).toBeInTheDocument();
  });

  it('says when the day is closed or nobody can be booked', async () => {
    serve({
      avail: availability({
        window: null,
        slots: [],
        instructors: [],
        unavailable: [],
      }),
    });
    const user = userEvent.setup();
    const view = renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByText(/Bookings are closed on this day/),
    ).toBeInTheDocument();
    view.unmount();

    serve({ avail: availability({ instructors: [] }) });
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByText('No instructors can be booked'),
    ).toBeInTheDocument();
  });

  it('adds a past lesson with a status and without the calendar by default', async () => {
    const recorded = serve();
    server.use(
      http.get(`${API}/admin/instructors`, () =>
        HttpResponse.json(fakeAdminList),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await user.click(screen.getByRole('button', { name: 'Add a past lesson' }));
    await chooseLesson(user);
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2025-12-20' },
    });
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '10:30' },
    });
    await user.selectOptions(
      await screen.findByLabelText('Instructor'),
      'inst-1',
    );
    await user.selectOptions(screen.getByLabelText('Status'), 'no_show');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const form = await screen.findByRole('form', { name: 'Confirm booking' });
    expect(within(form).queryByLabelText('Repeat')).not.toBeInTheDocument();
    await user.click(
      within(form).getByRole('button', { name: 'Save past lesson' }),
    );

    await screen.findByText('Booked');
    expect(recorded.bookings).toEqual([
      {
        instructorId: 'inst-1',
        lessonTypeId: 'lt1',
        startsAt: '2025-12-20T15:30:00.000Z',
        customerIds: ['cu1'],
        status: 'no_show',
        addToCalendar: false,
      },
    ]);
  });

  it('refuses a future time in past-lesson mode and can add it to Google', async () => {
    const recorded = serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await user.click(screen.getByRole('button', { name: 'Add a past lesson' }));
    await chooseLesson(user);
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '23:00' },
    });
    expect(screen.getByText(/This time is in the future/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '09:00' },
    });
    await user.selectOptions(
      await screen.findByLabelText('Instructor'),
      'inst-1',
    );
    await user.click(screen.getByLabelText(/Also add it to the instructor/));
    await user.click(
      await screen.findByRole('button', { name: 'Save past lesson' }),
    );
    await screen.findByText('Booked');
    expect(recorded.bookings[0]).toMatchObject({
      startsAt: '2026-12-10T14:00:00.000Z',
      status: 'completed',
      addToCalendar: true,
    });
  });

  it('saves booking settings with weekday overrides', async () => {
    const recorded = serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    const card = await screen.findByRole('region', {
      name: 'Booking hours and slots',
    });
    await within(card).findByLabelText('Day starts');
    fireEvent.change(within(card).getByLabelText('Day starts'), {
      target: { value: '09:00' },
    });
    await user.selectOptions(within(card).getByLabelText('Slot size'), '15');
    await user.selectOptions(
      within(card).getByLabelText('Hours on Sun'),
      'closed',
    );
    await user.selectOptions(
      within(card).getByLabelText('Hours on Sat'),
      'custom',
    );
    fireEvent.change(within(card).getByLabelText('Sat ends'), {
      target: { value: '20:00' },
    });
    await user.click(
      within(card).getByRole('button', { name: 'Save settings' }),
    );

    expect(
      await within(card).findByText('Booking settings saved.'),
    ).toBeInTheDocument();
    expect(recorded.settingsPuts).toEqual([
      {
        dayStartTime: '09:00',
        dayEndTime: '18:00',
        slotMinutes: 15,
        weekdayOverrides: {
          sat: { start: '09:00', end: '20:00' },
          sun: { closed: true },
        },
      },
    ]);
  });

  it('blocks invalid settings', async () => {
    serve();
    renderWithProviders(<BookLessonPage />);
    const start = await screen.findByLabelText('Day starts');
    fireEvent.change(start, { target: { value: '19:00' } });
    expect(
      screen.getByText('Each day must end after it starts.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save settings' }),
    ).toBeDisabled();
  });

  it('shows the grid in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await screen.findByRole('option', { name: /私教 1 小时/ });
    await user.selectOptions(screen.getByLabelText('课程类型'), 'lt1');
    expect(
      await screen.findByRole('button', { name: '预约 简雪 10:00' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/日历为只读/)).toBeInTheDocument();
  });
});
