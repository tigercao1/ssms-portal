import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { CalendarMatchingPage } from './CalendarMatchingPage';
import type {
  GoogleCalendar,
  InstructorCalendarOverview,
  InstructorCalendarsOverview,
  InstructorGoogleCalendarInput,
} from '@/lib/types';

const API = 'http://localhost:3000';

const calendars: GoogleCalendar[] = [
  {
    id: 'jane@ssnow.club',
    summary: 'Jane Snow',
    accessRole: 'writer',
    canWrite: true,
  },
  {
    id: 'eddie@ssnow.club',
    summary: 'Eddie Lee',
    accessRole: 'owner',
    canWrite: true,
  },
  {
    id: 'ming@gmail.com',
    summary: '王明',
    accessRole: 'reader',
    canWrite: false,
  },
  {
    id: 'busy@gmail.com',
    summary: 'Busy only',
    accessRole: 'freeBusyReader',
    canWrite: false,
  },
];

function entry(
  overrides: Partial<InstructorCalendarOverview>,
): InstructorCalendarOverview {
  return {
    instructorId: 'inst-x',
    googleCalendarId: null,
    calendarSummary: null,
    matchStatus: null,
    updatedAt: null,
    displayNameEn: 'Someone',
    displayNameZh: null,
    email: null,
    approvalStatus: 'approved',
    isActive: true,
    candidates: [],
    suggestion: null,
    ...overrides,
  };
}

const jane = entry({
  instructorId: 'inst-1',
  displayNameEn: 'Jane Snow',
  displayNameZh: '简',
  email: 'jane@ssnow.club',
  googleCalendarId: 'jane@ssnow.club',
  calendarSummary: 'Jane Snow',
  matchStatus: 'suggested',
});
const eddie = entry({
  instructorId: 'inst-2',
  displayNameEn: 'Eddie Lee',
  email: 'eddie@example.com',
  suggestion: {
    calendarId: 'eddie@ssnow.club',
    calendarSummary: 'Eddie Lee',
    matchedBy: 'name',
  },
});
const ming = entry({
  instructorId: 'inst-3',
  displayNameEn: 'Ming Wang',
  displayNameZh: '王明',
  email: 'ming@gmail.com',
  googleCalendarId: 'ming@gmail.com',
  calendarSummary: '王明',
  matchStatus: 'confirmed',
});
const nobody = entry({ instructorId: 'inst-4', displayNameEn: 'No Match' });

function serve({
  overview = {
    google: { connected: true, error: null },
    instructors: [jane, eddie, ming, nobody],
  } as InstructorCalendarsOverview,
  patchError,
  suggest,
}: {
  overview?: InstructorCalendarsOverview;
  patchError?: { status: number; message: string };
  suggest?: { status: number; message: string } | number;
} = {}) {
  let stored = overview;
  const patches: { id: string; body: InstructorGoogleCalendarInput }[] = [];
  const calendarCalls: number[] = [];
  server.use(
    http.get(`${API}/admin/instructor-calendars`, () =>
      HttpResponse.json(stored),
    ),
    http.get(`${API}/admin/google/calendars`, () => {
      calendarCalls.push(1);
      return HttpResponse.json(calendars);
    }),
    http.post(`${API}/admin/instructor-calendars/suggest`, () => {
      if (typeof suggest === 'object') {
        return HttpResponse.json(
          { message: suggest.message },
          { status: suggest.status },
        );
      }
      stored = {
        ...stored,
        instructors: stored.instructors.map((i) =>
          i.suggestion && !i.googleCalendarId
            ? {
                ...i,
                googleCalendarId: i.suggestion.calendarId,
                calendarSummary: i.suggestion.calendarSummary,
                matchStatus: 'suggested',
              }
            : i,
        ),
      };
      return HttpResponse.json({ suggested: suggest ?? 1, overview: stored });
    }),
    http.patch(
      `${API}/admin/instructors/:id/google-calendar`,
      async ({ request, params }) => {
        const body = (await request.json()) as InstructorGoogleCalendarInput;
        patches.push({ id: String(params.id), body });
        if (patchError) {
          return HttpResponse.json(
            { message: patchError.message },
            { status: patchError.status },
          );
        }
        let updated: InstructorCalendarOverview | undefined;
        stored = {
          ...stored,
          instructors: stored.instructors.map((i) => {
            if (i.instructorId !== params.id) return i;
            updated = {
              ...i,
              googleCalendarId: body.googleCalendarId,
              calendarSummary: body.googleCalendarId
                ? (body.calendarSummary ?? null)
                : null,
              matchStatus: body.googleCalendarId
                ? (body.matchStatus ?? 'confirmed')
                : null,
            };
            return updated;
          }),
        };
        return HttpResponse.json(updated);
      },
    ),
  );
  return { patches, calendarCalls };
}

function rowOf(name: string) {
  return within(
    screen
      .getByText(name, { selector: 'span.font-medium' })
      .closest('tr') as HTMLElement,
  );
}

describe('CalendarMatchingPage', () => {
  it('shows each instructor with their linked or proposed calendar and status', async () => {
    serve();
    renderWithProviders(<CalendarMatchingPage />);

    expect(
      await screen.findByRole('heading', { name: 'Calendar matching' }),
    ).toBeInTheDocument();
    await screen.findByText('Jane Snow', { selector: 'span.font-medium' });

    const janeRow = rowOf('Jane Snow');
    expect(janeRow.getByText('Suggested')).toBeInTheDocument();
    expect(
      janeRow.getByText('jane@ssnow.club', { selector: '.font-mono' }),
    ).toBeInTheDocument();
    expect(
      janeRow.getByRole('button', { name: 'Confirm calendar for Jane Snow' }),
    ).toBeInTheDocument();
    expect(
      janeRow.getByRole('button', { name: 'Clear calendar for Jane Snow' }),
    ).toBeInTheDocument();

    const eddieRow = rowOf('Eddie Lee');
    expect(eddieRow.getByText('Not linked')).toBeInTheDocument();
    expect(eddieRow.getByText('Proposed: Eddie Lee')).toBeInTheDocument();
    expect(eddieRow.getByText(/matched by name/)).toBeInTheDocument();
    expect(
      eddieRow.queryByRole('button', { name: /Clear/ }),
    ).not.toBeInTheDocument();

    const mingRow = rowOf('Ming Wang');
    expect(mingRow.getByText('Confirmed')).toBeInTheDocument();
    expect(
      mingRow.queryByRole('button', { name: /Confirm/ }),
    ).not.toBeInTheDocument();

    const noneRow = rowOf('No Match');
    expect(noneRow.getByText('—')).toBeInTheDocument();
    expect(
      noneRow.queryByRole('button', { name: /Confirm/ }),
    ).not.toBeInTheDocument();
  });

  it('warns about calendars SSMS cannot write to', async () => {
    serve();
    renderWithProviders(<CalendarMatchingPage />);
    await screen.findByText('Jane Snow', { selector: 'span.font-medium' });

    await waitFor(() =>
      expect(
        rowOf('Ming Wang').getByText(/SSMS can't add lessons to this calendar/),
      ).toBeInTheDocument(),
    );
    expect(
      rowOf('Jane Snow').queryByText(/SSMS can't add lessons/),
    ).not.toBeInTheDocument();
    const section = screen
      .getByRole('heading', { name: "Calendars SSMS can't write to" })
      .closest('div')?.parentElement as HTMLElement;
    expect(within(section).getByText('王明')).toBeInTheDocument();
    expect(within(section).getByText('Busy only')).toBeInTheDocument();
    expect(
      within(section).getByText('busy@gmail.com · freeBusyReader'),
    ).toBeInTheDocument();
    expect(within(section).queryByText('Jane Snow')).not.toBeInTheDocument();
  });

  it('confirms a stored suggestion and a proposal that was not stored yet', async () => {
    const { patches } = serve();
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Confirm calendar for Jane Snow',
      }),
    );
    await waitFor(() =>
      expect(rowOf('Jane Snow').getByText('Confirmed')).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: 'Confirm calendar for Eddie Lee' }),
    );
    await waitFor(() =>
      expect(rowOf('Eddie Lee').getByText('Confirmed')).toBeInTheDocument(),
    );

    expect(patches).toEqual([
      {
        id: 'inst-1',
        body: {
          googleCalendarId: 'jane@ssnow.club',
          calendarSummary: 'Jane Snow',
          matchStatus: 'confirmed',
        },
      },
      {
        id: 'inst-2',
        body: {
          googleCalendarId: 'eddie@ssnow.club',
          calendarSummary: 'Eddie Lee',
          matchStatus: 'confirmed',
        },
      },
    ]);
  });

  it('changes a calendar by picking from the list, flagging read-only ones', async () => {
    const { patches } = serve();
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);
    const change = await screen.findByRole('button', {
      name: 'Change calendar for No Match',
    });
    await waitFor(() => expect(change).toBeEnabled());
    await user.click(change);

    const row = rowOf('No Match');
    const select = row.getByLabelText('Calendar for No Match');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Choose a calendar',
      'Jane Snow (jane@ssnow.club)',
      'Eddie Lee (eddie@ssnow.club)',
      '王明 (ming@gmail.com) · read-only',
      'Busy only (busy@gmail.com) · read-only',
    ]);
    expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.selectOptions(select, 'busy@gmail.com');
    expect(row.getByText(/SSMS can't add lessons/)).toBeInTheDocument();
    await user.selectOptions(select, 'eddie@ssnow.club');
    expect(row.queryByText(/SSMS can't add lessons/)).not.toBeInTheDocument();
    await user.click(row.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patches).toEqual([
        {
          id: 'inst-4',
          body: {
            googleCalendarId: 'eddie@ssnow.club',
            calendarSummary: 'Eddie Lee',
            matchStatus: 'confirmed',
          },
        },
      ]),
    );
    await waitFor(() =>
      expect(
        rowOf('No Match').queryByLabelText('Calendar for No Match'),
      ).not.toBeInTheDocument(),
    );
    expect(rowOf('No Match').getByText('Confirmed')).toBeInTheDocument();
  });

  it('shows the 409 when the picked calendar belongs to someone else, and cancels', async () => {
    serve({
      patchError: {
        status: 409,
        message: 'This calendar is already linked to another instructor',
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);
    const change = await screen.findByRole('button', {
      name: 'Change calendar for No Match',
    });
    await waitFor(() => expect(change).toBeEnabled());
    await user.click(change);
    const row = rowOf('No Match');
    await user.selectOptions(
      row.getByLabelText('Calendar for No Match'),
      'jane@ssnow.club',
    );
    await user.click(row.getByRole('button', { name: 'Save' }));

    expect(await row.findByRole('alert')).toHaveTextContent(
      'This calendar is already linked to another instructor.',
    );
    await user.click(row.getByRole('button', { name: 'Cancel' }));
    expect(row.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      row.queryByLabelText('Calendar for No Match'),
    ).not.toBeInTheDocument();
  });

  it('clears a link and shows other API errors', async () => {
    const { patches } = serve();
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Clear calendar for Ming Wang',
      }),
    );
    await waitFor(() =>
      expect(rowOf('Ming Wang').getByText('Not linked')).toBeInTheDocument(),
    );
    expect(patches).toEqual([
      { id: 'inst-3', body: { googleCalendarId: null } },
    ]);

    serve({ patchError: { status: 404, message: 'Instructor not found' } });
    await user.click(
      screen.getByRole('button', { name: 'Clear calendar for Jane Snow' }),
    );
    expect(await rowOf('Jane Snow').findByRole('alert')).toHaveTextContent(
      'Instructor not found',
    );
  });

  it('saves suggestions and reports how many', async () => {
    serve({ suggest: 1 });
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Suggest matches' }),
    );
    expect(await screen.findByText('1 suggestions saved.')).toBeInTheDocument();
    expect(rowOf('Eddie Lee').getByText('Suggested')).toBeInTheDocument();
  });

  it('shows the API error when suggesting fails', async () => {
    serve({
      suggest: { status: 409, message: 'Google Calendar is not connected' },
    });
    const user = userEvent.setup();
    renderWithProviders(<CalendarMatchingPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Suggest matches' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not suggest matches');
    expect(alert).toHaveTextContent('Google Calendar is not connected');
  });

  it('explains when Google is not connected, keeps stored links and skips the calendar list', async () => {
    const { calendarCalls } = serve({
      overview: {
        google: { connected: false, error: null },
        instructors: [ming],
      },
    });
    renderWithProviders(<CalendarMatchingPage />);
    expect(
      await screen.findByText(
        /Google Calendar is not connected, so no calendars can be listed/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Google Calendar settings' }),
    ).toHaveAttribute('href', '/admin/settings/google');
    expect(rowOf('Ming Wang').getByText('Confirmed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change calendar for Ming Wang' }),
    ).toBeDisabled();
    expect(calendarCalls).toHaveLength(0);
  });

  it('shows a Google listing error and an empty state', async () => {
    serve({
      overview: {
        google: { connected: true, error: 'Google Calendar request failed' },
        instructors: [],
      },
    });
    renderWithProviders(<CalendarMatchingPage />);
    expect(
      await screen.findByText(
        'Could not load calendars from Google: Google Calendar request failed',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No instructors yet.')).toBeInTheDocument();
  });

  it('shows the API error when the overview fails', async () => {
    server.use(
      http.get(`${API}/admin/instructor-calendars`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<CalendarMatchingPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });

  it('uses Chinese names and labels', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    renderWithProviders(<CalendarMatchingPage />);
    expect(
      await screen.findByRole('heading', { name: '日历匹配' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '确认 简 的日历' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('待确认').length).toBeGreaterThan(0);
  });
});
