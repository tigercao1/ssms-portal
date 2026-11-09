import { onlineManager } from '@tanstack/react-query';
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
import type { DraftCard } from './bookingDrafts';
import type {
  Availability,
  BatchBookingInput,
  BatchBookingResult,
  BookingSettings,
  CreateBookingInput,
  LastClass,
} from './types';
import { expectMaskedInReplay } from '@/test/replayPrivacy';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'admin-1' } }),
}));

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

async function chooseSlot(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  time: string,
) {
  const list = await screen.findByRole('list', { name: 'Free instructors' });
  await user.click(
    within(list).getByRole('button', { name: new RegExp(`^${name}`) }),
  );
  await user.click(
    screen.getByRole('button', { name: `Book ${name} at ${time}` }),
  );
}

function instructorRows() {
  return within(screen.getByRole('list', { name: 'Free instructors' }))
    .getAllByRole('button')
    .map((b) => b.textContent);
}

function startChosen() {
  const missing = within(
    screen.getByRole('region', { name: 'Booking 1' }),
  ).queryByText(/^Missing:/);
  return !/start time/.test(missing?.textContent ?? '');
}

const at = (h: number, m: number) =>
  new Date(Date.UTC(2026, 11, 12, h + 5, m)).toISOString();

describe('BookLessonPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-10T17:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    hideSyncToast();
  });

  it('books a free slot picked by instructor then time', async () => {
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

    await screen.findByRole('list', { name: 'Free instructors' });
    expect(instructorRows()).toEqual(['Jane Snow2 times']);
    expect(screen.queryByText(/Eddie Lee/)).not.toBeInTheDocument();
    expect(screen.queryByText(/read-only/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Start time interval' }),
    ).not.toBeInTheDocument();
    const query = recorded.availabilityQueries.at(-1);
    expect(query?.get('date')).toBe('2026-12-12');
    expect(query?.get('lessonTypeId')).toBe('lt1');

    await chooseSlot(user, 'Jane Snow', '10:00');
    expect(
      screen.getByRole('button', { name: 'Book Jane Snow at 10:00' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const card = screen.getByRole('region', { name: 'Booking 1' });
    expect(within(card).getByText('Ready')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Repeat'), '3');
    await user.selectOptions(within(card).getByLabelText('Location'), 'l1');
    await user.type(within(card).getByLabelText('Notes'), ' first lesson ');
    await user.click(screen.getByRole('button', { name: 'Book lesson' }));

    expect(await screen.findByText('Booked 1 lesson(s)')).toBeInTheDocument();
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
    const booked = screen.getByRole('list', { name: 'Booked' });
    expect(booked).toHaveTextContent('Lily Chen');
    expect(booked).toHaveTextContent(
      /Private 1h · .*Dec 12, 2026.*10:00–11:00 · Jane Snow/,
    );
    const next = screen.getByRole('region', { name: 'Booking 1' });
    expect(within(next).getByLabelText('Date')).toHaveValue('2026-12-12');
    expect(within(next).getByLabelText('Lesson type')).toHaveValue('lt1');
    expect(startChosen()).toBe(false);
    expect(screen.getByLabelText('Repeat')).toHaveValue('1');
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });

  it('needs a customer before booking', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    await chooseSlot(user, 'Jane Snow', '10:00');
    expect(screen.getByText('Booking 1: customer')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Booking 1' })).getByText(
        'Missing: customer',
      ),
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
    await chooseSlot(user, 'Jane Snow', '10:00');
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
    await chooseSlot(user, 'Jane Snow', '10:00');
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
    await chooseSlot(user, 'Jane Snow', '10:00');
    await user.click(screen.getByRole('button', { name: 'Book lesson' }));

    expect(await screen.findByText('Booked 1 lesson(s)')).toBeInTheDocument();
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

  it('lists only free instructors and searches them by English or Chinese name', async () => {
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
            freeSlots: ['2026-12-12T14:00:00.000Z'],
          },
          {
            ...base.instructors[0]!,
            instructorId: 'inst-4',
            displayNameEn: 'Tom Busy',
            displayNameZh: null,
            freeSlots: [],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    await screen.findByRole('list', { name: 'Free instructors' });
    expect(instructorRows()).toEqual(['Jane Snow2 times', 'Mia Park1 time']);

    const search = screen.getByLabelText('Find instructor');
    await user.type(search, 'MIA');
    expect(instructorRows()).toEqual(['Mia Park1 time']);

    await user.clear(search);
    await user.type(search, '简');
    expect(instructorRows()).toEqual(['Jane Snow2 times']);

    await user.clear(search);
    await user.type(search, 'eddie');
    expect(
      screen.queryByRole('list', { name: 'Free instructors' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No instructor matches “eddie”.'),
    ).toBeInTheDocument();
  });

  it('shows only the chosen instructor’s times and clears the time when the instructor changes', async () => {
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
            freeSlots: ['2026-12-12T14:00:00.000Z'],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    await chooseSlot(user, 'Jane Snow', '11:00');
    const times = screen.getByRole('region', {
      name: 'Start times for Jane Snow',
    });
    expect(
      within(times)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['10:00', '11:00']);
    expect(screen.queryByLabelText('Find instructor')).not.toBeInTheDocument();
    expect(startChosen()).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Change instructor' }));
    expect(startChosen()).toBe(false);
    await user.click(screen.getByRole('button', { name: /^Mia Park/ }));
    const mia = screen.getByRole('region', {
      name: 'Start times for Mia Park',
    });
    expect(
      within(mia)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Book Mia Park at 09:00']);
    expect(within(mia).getByRole('button')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(startChosen()).toBe(false);
  });

  it('moves focus to the first time after choosing an instructor and back to the row after changing', async () => {
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
            freeSlots: ['2026-12-12T14:00:00.000Z'],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    const list = await screen.findByRole('list', { name: 'Free instructors' });
    within(list)
      .getByRole('button', { name: /^Mia Park/ })
      .focus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('button', { name: 'Book Mia Park at 09:00' }),
    ).toHaveFocus();

    screen.getByRole('button', { name: 'Change instructor' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: /^Mia Park/ })).toHaveFocus();
    expect(document.body).not.toHaveFocus();
  });

  it('focuses the times section when the instructor has no start at the block', async () => {
    const base = availability();
    serve({
      avail: availability({
        slotMinutes: 30,
        instructors: [
          { ...base.instructors[0]!, freeSlots: [at(9, 0), at(10, 0)] },
          {
            ...base.instructors[0]!,
            instructorId: 'inst-3',
            displayNameEn: 'Mia Park',
            displayNameZh: null,
            freeSlots: [at(9, 30)],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    const blocks = await screen.findByRole('group', {
      name: 'Start time interval',
    });
    await user.click(
      within(blocks).getByRole('button', { name: 'Every 60 min' }),
    );
    await user.click(screen.getByRole('button', { name: /^Mia Park/ }));
    expect(
      screen.getByRole('region', { name: 'Start times for Mia Park' }),
    ).toHaveFocus();
  });

  it('filters start times by a 60, 30 or 15 minute block', async () => {
    const free = [
      at(9, 0),
      at(9, 15),
      at(9, 30),
      at(11, 45),
      at(13, 0),
      at(13, 15),
      at(17, 30),
    ];
    const base = availability();
    serve({
      avail: availability({
        slotMinutes: 15,
        instructors: [{ ...base.instructors[0]!, busy: [], freeSlots: free }],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByRole('button', { name: /^Jane Snow/ }),
    ).toHaveTextContent('4 times');
    await user.click(screen.getByRole('button', { name: /^Jane Snow/ }));
    const blocks = screen.getByRole('group', { name: 'Start time interval' });
    const shown = () =>
      within(screen.getByRole('region', { name: 'Start times for Jane Snow' }))
        .getAllByRole('button')
        .map((b) => b.textContent);
    expect(
      within(blocks).getByRole('button', { name: 'Every 30 min' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(shown()).toEqual(['09:00', '09:30', '13:00', '17:30']);

    await user.click(
      within(blocks).getByRole('button', { name: 'Every 60 min' }),
    );
    expect(shown()).toEqual(['09:00', '13:00']);

    await user.click(
      within(blocks).getByRole('button', { name: 'Every 15 min' }),
    );
    expect(shown()).toEqual([
      '09:00',
      '09:15',
      '09:30',
      '11:45',
      '13:00',
      '13:15',
      '17:30',
    ]);
    expect(screen.getByText('Morning')).toBeInTheDocument();
    expect(screen.getByText('Afternoon')).toBeInTheDocument();
    expect(screen.getByText('Evening')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Book Jane Snow at 09:15' }),
    );
    expect(startChosen()).toBe(true);
    await user.click(
      within(blocks).getByRole('button', { name: 'Every 30 min' }),
    );
    expect(startChosen()).toBe(false);
  });

  it('offers only block sizes that change what the slot size shows', async () => {
    const base = availability();
    serve({
      avail: availability({
        slotMinutes: 30,
        instructors: [
          {
            ...base.instructors[0]!,
            freeSlots: [at(9, 0), at(9, 30), at(10, 0)],
          },
        ],
      }),
    });
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    const blocks = await screen.findByRole('group', {
      name: 'Start time interval',
    });
    expect(
      within(blocks)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Every 60 min', 'Every 30 min']);
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

    expectMaskedInReplay(
      await screen.findByText(/Last lesson: Private 1h with Jane Snow/),
    );
    expect(screen.getByLabelText('Date')).toHaveValue('2026-12-12');
    expect(screen.getByLabelText('Lesson type')).toHaveValue('lt1');
    expect(
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:00' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Change instructor' }),
    ).toBeInTheDocument();
    expect(startChosen()).toBe(true);
    expect(recorded.availabilityQueries.at(-1)?.get('date')).toBe('2026-12-12');
  });

  it('selects the last instructor and shows an off-block last time at a smaller block', async () => {
    const base = availability();
    serve({
      avail: availability({
        slotMinutes: 15,
        instructors: [
          { ...base.instructors[0]!, freeSlots: [at(9, 0), at(10, 15)] },
        ],
      }),
      last: {
        classId: 'old',
        startsAt: '2026-12-05T15:15:00.000Z',
        weekday: 'sat',
        time: '10:15',
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
      await screen.findByRole('button', { name: 'Book Jane Snow at 10:15' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(
        screen.getByRole('group', { name: 'Start time interval' }),
      ).getByRole('button', { name: 'Every 15 min' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('selects the last instructor without a time when that time is taken', async () => {
    serve({
      last: {
        classId: 'old',
        startsAt: '2026-12-05T14:00:00.000Z',
        weekday: 'sat',
        time: '09:00',
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
      await screen.findByRole('region', { name: 'Start times for Jane Snow' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Book Jane Snow at 10:00' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(startChosen()).toBe(false);
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
      await screen.findByText(
        'Bookings are closed on this day. Change the hours under Booking settings.',
      ),
    ).toBeInTheDocument();
    view.unmount();

    const base = availability();
    serve({
      avail: availability({
        instructors: [{ ...base.instructors[0]!, freeSlots: [] }],
      }),
    });
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByText('No instructor is free'),
    ).toBeInTheDocument();
    expect(screen.getByText('Try another date.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Find instructor')).not.toBeInTheDocument();
    expect(screen.queryByText(/Eddie Lee/)).not.toBeInTheDocument();
  });

  it('points to the setup pages when no instructor can be booked at all', async () => {
    serve({ avail: availability({ instructors: [] }) });
    const user = userEvent.setup();
    const view = renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByText('No instructor can take bookings yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Check Booking settings and Calendar matching.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Try another date.')).not.toBeInTheDocument();
    view.unmount();

    serve({ avail: availability({ instructors: [], unavailable: [] }) });
    renderWithProviders(<BookLessonPage />);
    await chooseLesson(user);
    expect(
      await screen.findByText('No instructor is free'),
    ).toBeInTheDocument();
    expect(screen.getByText('Try another date.')).toBeInTheDocument();
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
    expect(
      screen.queryByRole('list', { name: 'Free instructors' }),
    ).not.toBeInTheDocument();

    expect(screen.queryByLabelText('Repeat')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save past lesson' }));

    await screen.findByText('Booked 1 lesson(s)');
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
    expect(
      screen.getByText(/^Booking 1: .*a start time in the past$/),
    ).toBeInTheDocument();

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
    await screen.findByText('Booked 1 lesson(s)');
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

  it('shows the picker in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await screen.findByRole('option', { name: /私教 1 小时/ });
    await user.selectOptions(screen.getByLabelText('课程类型'), 'lt1');
    const list = await screen.findByRole('list', { name: '空闲教练' });
    await user.click(within(list).getByRole('button', { name: /^简雪/ }));
    expect(
      screen.getByRole('button', { name: '预约 简雪 10:00' }),
    ).toBeInTheDocument();
    expect(screen.getByText('上午')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '更换教练' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Eddie Lee/)).not.toBeInTheDocument();
  });
});

const DRAFTS_KEY = 'ssms.bookingDrafts.v2:admin-1';
const LEGACY_KEY = 'ssms.bookingDrafts.v1:admin-1';
const UUID = /^[0-9a-f-]{36}$/;

const lilyPicked = {
  id: 'cu1',
  firstName: 'Lily',
  lastName: 'Chen',
  email: null,
  phone: null,
};

function card(overrides: Partial<DraftCard> = {}): DraftCard {
  return {
    id: 'd1',
    mode: 'grid',
    customers: [lilyPicked],
    lessonTypeId: 'lt1',
    lessonTypeNameEn: 'Private 1h',
    lessonTypeNameZh: '私教 1 小时',
    durationMin: 60,
    date: '2026-12-12',
    time: '',
    instructorId: 'inst-1',
    instructorNameEn: 'Jane Snow',
    instructorNameZh: '简雪',
    startsAt: '2026-12-12T15:00:00.000Z',
    notes: '',
    locationId: '',
    ...overrides,
  };
}

function pastCard(overrides: Partial<DraftCard> = {}): DraftCard {
  return card({
    mode: 'past',
    date: '2025-12-01',
    time: '10:00',
    startsAt: '2025-12-01T15:00:00.000Z',
    status: 'completed',
    addToCalendar: false,
    ...overrides,
  });
}

function legacyRow(c: DraftCard) {
  const row: Partial<DraftCard> = { ...c };
  delete row.mode;
  delete row.date;
  delete row.time;
  return row;
}

function seedCards(
  cards: DraftCard[],
  batchId = 'batch-1',
  extra: Record<string, unknown> = {},
) {
  localStorage.setItem(
    DRAFTS_KEY,
    JSON.stringify({ version: 2, batchId, cards, ...extra }),
  );
}

function storedCart(): {
  batchId: string;
  cards: DraftCard[];
  outcomeUnknown?: boolean;
} | null {
  const raw = localStorage.getItem(DRAFTS_KEY);
  return raw ? JSON.parse(raw) : null;
}

function serveBatch(
  ...responses: ((body: BatchBookingInput) => Response | Promise<Response>)[]
): BatchBookingInput[] {
  const sent: BatchBookingInput[] = [];
  server.use(
    http.post(`${API}/admin/booking/classes/batch`, async ({ request }) => {
      const body = (await request.json()) as BatchBookingInput;
      sent.push(body);
      const respond = responses[sent.length - 1] ?? responses.at(-1);
      return respond ? respond(body) : HttpResponse.error();
    }),
  );
  return sent;
}

function createdAll(body: BatchBookingInput): BatchBookingResult {
  return {
    batchId: body.batchId,
    results: body.bookings.map((b, index) => ({
      index,
      status: 'created' as const,
      classes: [
        {
          ...fakeClass({ id: `c${index}`, startsAt: b.startsAt }),
          calendarSync: 'ok' as const,
          calendarSyncError: null,
        },
      ],
    })),
  };
}

function serveInstructors() {
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json(fakeAdminList),
    ),
  );
}

const region = (n: number) =>
  screen.getByRole('region', { name: `Booking ${n}` });
const cardRegions = () =>
  screen.queryAllByRole('region', { name: /^Booking \d+$/ });

describe('BookLessonPage booking cards', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-10T17:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    hideSyncToast();
  });

  it('adds another card pre-filled from the previous one and hides repeat', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    expect(cardRegions()).toHaveLength(1);
    await pickLily(user);
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-12-12' },
    });
    await chooseLesson(user);
    await chooseSlot(user, 'Jane Snow', '10:00');
    expect(screen.getByRole('button', { name: 'Book lesson' })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Repeat'), '3');
    await user.click(
      screen.getByRole('button', { name: 'Add another booking' }),
    );

    const first = region(1);
    expect(first).toHaveTextContent('Lily Chen');
    expect(first).toHaveTextContent(
      /Private 1h · .*Dec 12, 2026.*10:00–11:00 · Jane Snow/,
    );
    expect(within(first).getByText('Ready')).toBeInTheDocument();
    expect(
      within(first).getByRole('button', { name: 'Edit booking 1' }),
    ).toHaveAttribute('aria-expanded', 'false');
    const second = region(2);
    expect(within(second).getByLabelText('Find a customer')).toHaveFocus();
    expect(
      within(second).getByRole('list', { name: 'Selected customers' }),
    ).toHaveTextContent('Lily Chen');
    expect(within(second).getByLabelText('Date')).toHaveValue('2026-12-12');
    expect(within(second).getByLabelText('Lesson type')).toHaveValue('lt1');
    expect(
      within(second).getByRole('button', { name: 'Book from availability' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Repeat')).not.toBeInTheDocument();

    await user.click(
      within(second).getByRole('button', { name: 'Clear customers' }),
    );
    expect(
      within(second).queryByRole('list', { name: 'Selected customers' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book all (2)' })).toBeDisabled();
    expect(
      screen.getByText('Booking 2: customer, instructor, start time'),
    ).toBeInTheDocument();
    const cart = storedCart();
    expect(cart?.batchId).toMatch(UUID);
    expect(cart?.cards).toMatchObject([
      {
        instructorId: 'inst-1',
        startsAt: '2026-12-12T15:00:00.000Z',
        customers: [{ id: 'cu1' }],
      },
      { customers: [], lessonTypeId: 'lt1', date: '2026-12-12', startsAt: '' },
    ]);

    await user.click(
      within(second).getByRole('button', { name: 'Remove booking 2' }),
    );
    expect(cardRegions()).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Add another booking' }),
    ).toHaveFocus();
    expect(screen.getByLabelText('Repeat')).toHaveValue('1');
    expect(screen.getByRole('button', { name: 'Book lesson' })).toBeEnabled();
  });

  it('folds, edits and removes cards and keeps them across a remount', async () => {
    seedCards([
      card({ notes: 'skis' }),
      pastCard({ id: 'd2', status: 'no_show', addToCalendar: true }),
    ]);
    serve();
    serveInstructors();
    const user = userEvent.setup();
    const view = renderWithProviders(<BookLessonPage />);
    expect(cardRegions()).toHaveLength(2);
    expect(screen.queryByLabelText('Find a customer')).not.toBeInTheDocument();
    expect(region(1)).toHaveTextContent('Notes: skis');
    expect(region(2)).toHaveTextContent(/Dec 1, 2025.*10:00–11:00/);
    expect(region(2)).toHaveTextContent('No-show');
    expect(screen.getByRole('button', { name: 'Book all (2)' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Edit booking 2' }));
    const open = region(2);
    expect(within(open).getByLabelText('Find a customer')).toHaveFocus();
    expect(
      within(open).getByRole('button', { name: 'Add a past lesson' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(open).getByLabelText('Date')).toHaveValue('2025-12-01');
    expect(within(open).getByLabelText('Start time')).toHaveValue('10:00');
    expect(within(open).getByLabelText('Status')).toHaveValue('no_show');
    expect(within(open).getByLabelText(/Also add it/)).toBeChecked();
    expect(screen.getByRole('button', { name: 'Book all (2)' })).toBeEnabled();
    await user.selectOptions(
      within(open).getByLabelText('Status'),
      'completed',
    );
    const done = within(open).getByRole('button', {
      name: 'Done with booking 2',
    });
    expect(done).toHaveAttribute('aria-expanded', 'true');
    await user.click(done);

    expect(
      screen.getByRole('button', { name: 'Edit booking 2' }),
    ).toHaveFocus();
    expect(region(2)).toHaveTextContent('Completed');
    expect(storedCart()?.cards[1]).toMatchObject({
      id: 'd2',
      status: 'completed',
      addToCalendar: true,
      startsAt: '2025-12-01T15:00:00.000Z',
    });

    await user.click(screen.getByRole('button', { name: 'Remove booking 1' }));
    expect(cardRegions()).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Save past lesson' }),
    ).toBeEnabled();
    view.unmount();

    renderWithProviders(<BookLessonPage />);
    expect(cardRegions()).toHaveLength(1);
    expect(within(region(1)).getByLabelText('Status')).toHaveValue('completed');
    expect(storedCart()?.cards.map((c) => c.id)).toEqual(['d2']);
    expect(storedCart()?.batchId).toBe('batch-1');
  });

  it('keeps an unfinished card across a reload', async () => {
    serve();
    const user = userEvent.setup();
    const view = renderWithProviders(<BookLessonPage />);
    await pickLily(user);
    await chooseLesson(user);
    view.unmount();

    renderWithProviders(<BookLessonPage />);
    await screen.findByRole('option', { name: /Private 1h/ });
    const restored = region(1);
    expect(
      within(restored).getByRole('list', { name: 'Selected customers' }),
    ).toHaveTextContent('Lily Chen');
    expect(within(restored).getByLabelText('Lesson type')).toHaveValue('lt1');
    expect(storedCart()?.cards).toHaveLength(1);
  });

  it('moves a list saved by the previous version into cards', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        version: 1,
        batchId: 'batch-old',
        outcomeUnknown: true,
        rows: [
          legacyRow(card({ notes: 'skis' })),
          legacyRow(pastCard({ id: 'd2', status: 'no_show' })),
        ],
      }),
    );
    serve();
    const sent = serveBatch((body) => HttpResponse.json(createdAll(body)));
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);

    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(storedCart()).toMatchObject({
      batchId: 'batch-old',
      outcomeUnknown: true,
      cards: [
        { id: 'd1', mode: 'grid', date: '2026-12-12', notes: 'skis' },
        { id: 'd2', mode: 'past', date: '2025-12-01', time: '10:00' },
      ],
    });
    expect(cardRegions()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Booked 2 lesson(s)')).toBeInTheDocument();
    expect(sent).toEqual([
      {
        batchId: 'batch-old',
        bookings: [
          {
            instructorId: 'inst-1',
            lessonTypeId: 'lt1',
            startsAt: '2026-12-12T15:00:00.000Z',
            customerIds: ['cu1'],
            notes: 'skis',
          },
          {
            instructorId: 'inst-1',
            lessonTypeId: 'lt1',
            startsAt: '2025-12-01T15:00:00.000Z',
            customerIds: ['cu1'],
            status: 'no_show',
            addToCalendar: false,
          },
        ],
      },
    ]);
  });

  it('discards corrupt, old or unreadable stored cards', async () => {
    serve();
    localStorage.setItem(DRAFTS_KEY, '{not json');
    localStorage.setItem(LEGACY_KEY, '{not json');
    const view = renderWithProviders(<BookLessonPage />);
    await screen.findByRole('option', { name: /Private 1h/ });
    expect(cardRegions()).toHaveLength(1);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    view.unmount();

    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        version: 1,
        batchId: 'b',
        rows: [{ ...card(), customers: [] }],
      }),
    );
    const again = renderWithProviders(<BookLessonPage />);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    again.unmount();

    localStorage.setItem(
      DRAFTS_KEY,
      JSON.stringify({ version: 1, batchId: 'b', cards: [card()] }),
    );
    renderWithProviders(<BookLessonPage />);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    expect(region(1)).toHaveTextContent(
      'Missing: customer, lesson type, instructor, start time',
    );

    seedCards([{ ...card(), customers: 'Lily' } as unknown as DraftCard]);
    window.dispatchEvent(new StorageEvent('storage', { key: DRAFTS_KEY }));
    expect(cardRegions()).toHaveLength(1);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });

  it('books one card once even when Book is pressed twice', async () => {
    seedCards([card()]);
    const recorded = serve();
    renderWithProviders(<BookLessonPage />);
    const book = screen.getByRole('button', { name: 'Book lesson' });
    fireEvent.click(book);
    fireEvent.click(book);
    expect(await screen.findByText('Booked 1 lesson(s)')).toBeInTheDocument();
    expect(recorded.bookings).toHaveLength(1);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });

  it('books every card at once and shows what was booked', async () => {
    seedCards([
      card({ notes: ' first ', locationId: 'l1' }),
      pastCard({ id: 'd2' }),
    ]);
    const recorded = serve();
    const sent = serveBatch((body) => HttpResponse.json(createdAll(body)));
    renderWithProviders(<BookLessonPage />);
    const bookAll = screen.getByRole('button', { name: 'Book all (2)' });
    fireEvent.click(bookAll);
    fireEvent.click(bookAll);

    expect(await screen.findByText('Booked 2 lesson(s)')).toBeInTheDocument();
    expect(recorded.bookings).toEqual([]);
    expect(sent).toEqual([
      {
        batchId: 'batch-1',
        bookings: [
          {
            instructorId: 'inst-1',
            lessonTypeId: 'lt1',
            startsAt: '2026-12-12T15:00:00.000Z',
            customerIds: ['cu1'],
            notes: 'first',
            locationId: 'l1',
          },
          {
            instructorId: 'inst-1',
            lessonTypeId: 'lt1',
            startsAt: '2025-12-01T15:00:00.000Z',
            customerIds: ['cu1'],
            status: 'completed',
            addToCalendar: false,
          },
        ],
      },
    ]);
    const booked = within(screen.getByRole('list', { name: 'Booked' }));
    expect(booked.getAllByRole('listitem')).toHaveLength(2);
    expect(booked.getAllByText('Booked')).toHaveLength(2);
    expect(cardRegions()).toHaveLength(1);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });

  it('keeps failed cards editable with their reason and books the rest under a new batch id', async () => {
    seedCards([
      card(),
      card({ id: 'd2', startsAt: '2026-12-12T16:00:00.000Z' }),
      card({ id: 'd3', startsAt: '2026-12-12T17:00:00.000Z' }),
    ]);
    serve();
    const sent = serveBatch(
      () =>
        HttpResponse.json({
          batchId: 'batch-1',
          results: [
            {
              index: 0,
              status: 'created',
              classes: [
                {
                  ...fakeClass({ id: 'c0' }),
                  calendarSync: 'ok',
                  calendarSyncError: null,
                },
              ],
            },
            {
              index: 1,
              status: 'failed',
              code: 'INSTRUCTOR_BUSY',
              message: 'The instructor is not free at that time',
            },
            {
              index: 2,
              status: 'failed',
              code: 'SOMETHING_NEW',
              message: 'Server says no',
            },
          ],
        }),
      (body) => HttpResponse.json(createdAll(body)),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Book all (3)' }));

    expect(await screen.findByText('Booked 1 lesson(s)')).toBeInTheDocument();
    expect(
      screen.getByText(/2 booking\(s\) could not be booked/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Booked' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(1);
    expect(cardRegions()).toHaveLength(2);
    expect(region(1)).toHaveTextContent(
      'The instructor is not free at that time.',
    );
    expect(within(region(1)).getByText('Not booked')).toBeInTheDocument();
    expect(region(2)).toHaveTextContent('Server says no');
    const cart = storedCart();
    expect(cart?.cards.map((c) => c.id)).toEqual(['d2', 'd3']);
    expect(cart?.batchId).not.toBe('batch-1');
    expect(cart?.batchId).toMatch(UUID);

    await user.click(screen.getByRole('button', { name: 'Edit booking 1' }));
    expect(within(region(1)).getByRole('alert')).toHaveTextContent(
      'The instructor is not free at that time.',
    );
    await user.type(within(region(1)).getByLabelText('Notes'), 'moved');
    expect(storedCart()?.cards[0]?.error).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Book all (2)' }));
    expect(await screen.findByText('Booked 2 lesson(s)')).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.batchId).toBe(cart?.batchId);
    expect(sent[1]?.bookings[0]).toMatchObject({ notes: 'moved' });
  });

  it.each([
    ['a lost connection', () => HttpResponse.error()],
    [
      'a server error',
      () => HttpResponse.json({ message: 'boom' }, { status: 503 }),
    ],
  ])(
    'keeps the cards and batch id after %s and retries safely',
    async (_, fail) => {
      seedCards([card(), card({ id: 'd2' })]);
      serve();
      const sent = serveBatch(fail, (body) =>
        HttpResponse.json(createdAll(body)),
      );
      const user = userEvent.setup();
      renderWithProviders(<BookLessonPage />);
      await user.click(screen.getByRole('button', { name: 'Book all (2)' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not confirm whether these bookings were saved',
      );
      expect(cardRegions()).toHaveLength(2);
      expect(storedCart()?.batchId).toBe('batch-1');
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByText('Booked 2 lesson(s)')).toBeInTheDocument();
      expect(sent.map((b) => b.batchId)).toEqual(['batch-1', 'batch-1']);
      expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    },
  );

  it('tells the admin the outcome is unknown when the browser is offline', async () => {
    const online = vi
      .spyOn(window.navigator, 'onLine', 'get')
      .mockReturnValue(false);
    onlineManager.setOnline(false);
    seedCards([card(), card({ id: 'd2' })]);
    serve();
    serveBatch(
      () => HttpResponse.error(),
      (body) => HttpResponse.json(createdAll(body)),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Book all (2)' }));

    expect(
      await screen.findByText(
        /We could not confirm whether these bookings were saved/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    online.mockRestore();
    onlineManager.setOnline(true);
  });

  it('locks the cards after an unknown outcome and retries them unchanged', async () => {
    seedCards([
      card({ notes: 'skis' }),
      card({ id: 'd2', startsAt: '2026-12-12T16:00:00.000Z' }),
    ]);
    serve();
    const sent = serveBatch(
      () => HttpResponse.error(),
      () =>
        HttpResponse.json({
          batchId: 'batch-1',
          results: [
            {
              index: 0,
              status: 'created',
              classes: [
                {
                  ...fakeClass({ id: 'c0' }),
                  calendarSync: 'ok',
                  calendarSyncError: null,
                },
              ],
            },
            {
              index: 1,
              status: 'failed',
              code: 'INSTRUCTOR_BUSY',
              message: 'busy',
            },
          ],
        }),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Edit booking 1' }));
    await user.click(screen.getByRole('button', { name: 'Book all (2)' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'They are locked until Try again gets an answer',
    );
    expect(storedCart()?.outcomeUnknown).toBe(true);
    expect(screen.queryByLabelText('Find a customer')).not.toBeInTheDocument();
    for (const name of [
      'Edit booking 1',
      'Remove booking 1',
      'Edit booking 2',
      'Remove booking 2',
    ])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    for (const name of ['Add another booking', 'Remove all', /^Book all/])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Booked 1 lesson(s)')).toBeInTheDocument();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[0]?.batchId).toBe('batch-1');
    const cart = storedCart();
    expect(cart?.outcomeUnknown).toBe(false);
    expect(cart?.cards.map((c) => c.id)).toEqual(['d2']);
    expect(cart?.batchId).not.toBe('batch-1');
    expect(
      screen.getByRole('button', { name: 'Edit booking 1' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Book lesson' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Add another booking' }),
    ).toBeEnabled();
  });

  it('saves the lock before sending so a reload mid-request stays locked', async () => {
    seedCards([card(), card({ id: 'd2' })]);
    serve();
    let release: () => void = () => {};
    const sent = serveBatch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(HttpResponse.error());
        }),
    );
    const user = userEvent.setup();
    const view = renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Book all (2)' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(storedCart()?.outcomeUnknown).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
    view.unmount();
    release();

    renderWithProviders(<BookLessonPage />);
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove booking 1' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit booking 2' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Remove all' }),
    ).not.toBeInTheDocument();
  });

  it('unlocks the cards when the whole request is rejected as invalid', async () => {
    seedCards([card()], 'batch-1', { outcomeUnknown: true });
    serve();
    serveBatch(() =>
      HttpResponse.json(
        { message: 'bookings must be an array' },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'bookings must be an array',
    );
    expect(
      screen.getByRole('button', { name: 'Remove booking 1' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Book lesson' })).toBeEnabled();
    expect(storedCart()).toMatchObject({
      batchId: 'batch-1',
      outcomeUnknown: false,
    });
  });

  it('discards locked cards only after a warning', async () => {
    seedCards([card(), card({ id: 'd2' })], 'batch-1', {
      outcomeUnknown: true,
    });
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Discard bookings' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Discard these bookings?',
    });
    expect(dialog).toHaveTextContent(/may already exist/);
    await user.click(
      within(dialog).getByRole('button', { name: 'Discard bookings' }),
    );
    expect(cardRegions()).toHaveLength(1);
    expect(screen.getByLabelText('Find a customer')).toHaveFocus();
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });

  it('discards stored cards whose lock flag is corrupt', async () => {
    seedCards([card()], 'batch-1', { outcomeUnknown: 'yes' });
    serve();
    renderWithProviders(<BookLessonPage />);
    await screen.findByRole('option', { name: /Private 1h/ });
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('holds the page to 20 bookings', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      card({
        id: `d${i}`,
        startsAt: `2026-12-${String(11 + (i % 9)).padStart(2, '0')}T${String(13 + Math.floor(i / 9)).padStart(2, '0')}:00:00.000Z`,
      }),
    );
    seedCards(twenty);
    serve();
    const view = renderWithProviders(<BookLessonPage />);
    expect(
      screen.getByRole('button', { name: 'Add another booking' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/You can add up to 20 bookings at once/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Book all (20)' })).toBeEnabled();
    view.unmount();

    seedCards([...twenty, card({ id: 'd20' })]);
    const sent = serveBatch(() => HttpResponse.json({}));
    renderWithProviders(<BookLessonPage />);
    const bookAll = screen.getByRole('button', { name: 'Book all (21)' });
    expect(bookAll).toBeDisabled();
    expect(
      screen.getByText(/Book all takes up to 20 bookings; this page has 21/),
    ).toBeInTheDocument();
    fireEvent.click(bookAll);
    expect(sent).toEqual([]);
  });

  it('books a past-lesson card together with a booking from availability', async () => {
    seedCards([card()]);
    serve();
    serveInstructors();
    const sent = serveBatch((body) => HttpResponse.json(createdAll(body)));
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(
      screen.getByRole('button', { name: 'Add another booking' }),
    );
    const second = region(2);
    await user.click(
      within(second).getByRole('button', { name: 'Add a past lesson' }),
    );
    expect(within(second).getByLabelText('Date')).toHaveValue('2026-12-10');
    fireEvent.change(within(second).getByLabelText('Date'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.change(within(second).getByLabelText('Start time'), {
      target: { value: '10:30' },
    });
    await user.selectOptions(
      await within(second).findByLabelText('Instructor'),
      'inst-1',
    );
    await user.selectOptions(
      within(second).getByLabelText('Status'),
      'no_show',
    );
    await user.click(screen.getByRole('button', { name: 'Book all (2)' }));

    expect(await screen.findByText('Booked 2 lesson(s)')).toBeInTheDocument();
    expect(sent[0]?.bookings).toEqual([
      {
        instructorId: 'inst-1',
        lessonTypeId: 'lt1',
        startsAt: '2026-12-12T15:00:00.000Z',
        customerIds: ['cu1'],
      },
      {
        instructorId: 'inst-1',
        lessonTypeId: 'lt1',
        startsAt: '2026-12-01T15:30:00.000Z',
        customerIds: ['cu1'],
        status: 'no_show',
        addToCalendar: false,
      },
    ]);
  });

  it('asks before removing every card', async () => {
    seedCards([card(), card({ id: 'd2' })]);
    serve();
    const user = userEvent.setup();
    renderWithProviders(<BookLessonPage />);
    await user.click(screen.getByRole('button', { name: 'Remove all' }));
    const dialog = screen.getByRole('dialog', {
      name: 'Remove all bookings?',
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove all' }),
    );
    expect(cardRegions()).toHaveLength(1);
    expect(localStorage.getItem(DRAFTS_KEY)).toBeNull();
  });
});
