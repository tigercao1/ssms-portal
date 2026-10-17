import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { InstructorCalendarCard } from './InstructorCalendarCard';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import type {
  CalendarCandidate,
  InstructorCalendarOverview,
  InstructorCalendarsOverview,
  InstructorGoogleCalendar,
  InstructorGoogleCalendarInput,
} from '@/lib/types';

const API = 'http://localhost:3000';

function entry(
  overrides: Partial<InstructorCalendarOverview>,
): InstructorCalendarOverview {
  return {
    instructorId: 'inst-1',
    googleCalendarId: null,
    calendarSummary: null,
    matchStatus: null,
    updatedAt: null,
    displayNameEn: 'Jane Snow',
    displayNameZh: null,
    email: 'jane@example.com',
    approvalStatus: 'approved',
    isActive: true,
    candidates: [],
    suggestion: null,
    ...overrides,
  };
}

const liWei = entry({
  instructorId: 'inst-2',
  displayNameEn: 'Li Wei',
  email: 'li@example.com',
  googleCalendarId: 'li.wei@gmail.com',
  calendarSummary: 'Li Wei',
  matchStatus: 'confirmed',
});

function serve({
  current = {},
  google = { connected: true, error: null },
  suggestion = null,
  patchStatus = 200,
}: {
  current?: Partial<InstructorGoogleCalendar>;
  google?: InstructorCalendarsOverview['google'];
  suggestion?: CalendarCandidate | null;
  patchStatus?: number;
} = {}) {
  const bodies: unknown[] = [];
  const calendarRequests: string[] = [];
  let stored: InstructorGoogleCalendar = {
    instructorId: 'inst-1',
    googleCalendarId: null,
    calendarSummary: null,
    matchStatus: null,
    updatedAt: null,
    ...current,
  };
  const overview: InstructorCalendarsOverview = {
    google,
    instructors: [entry({ ...stored, suggestion }), liWei],
  };
  server.use(
    http.get(`${API}/admin/instructor-calendars`, () =>
      HttpResponse.json(overview),
    ),
    http.get(`${API}/admin/google/calendars`, ({ request }) => {
      calendarRequests.push(request.url);
      return HttpResponse.json([
        { id: 'admin@ssnow.club', summary: 'SSNOW Admin', accessRole: 'owner', canWrite: true },
        { id: 'li.wei@gmail.com', summary: 'Li Wei', accessRole: 'writer', canWrite: true },
        { id: 'jane.snow@ssnow.club', summary: 'Jane Snow', accessRole: 'writer', canWrite: true },
        { id: 'sam.ski@gmail.com', summary: 'Sam Ski', accessRole: 'reader', canWrite: false },
      ]);
    }),
    http.get(`${API}/admin/instructors/:id/google-calendar`, () =>
      HttpResponse.json(stored),
    ),
    http.patch(
      `${API}/admin/instructors/:id/google-calendar`,
      async ({ request }) => {
        const body = (await request.json()) as InstructorGoogleCalendarInput;
        bodies.push(body);
        if (patchStatus !== 200) {
          return HttpResponse.json(
            {
              message:
                patchStatus === 409
                  ? 'This calendar is already linked to another instructor'
                  : 'nope',
            },
            { status: patchStatus },
          );
        }
        stored = {
          ...stored,
          googleCalendarId: body.googleCalendarId,
          calendarSummary: body.googleCalendarId,
          matchStatus: body.googleCalendarId
            ? (body.matchStatus ?? 'confirmed')
            : null,
        };
        return HttpResponse.json(stored);
      },
    ),
  );
  return { bodies, calendarRequests };
}

function renderCard() {
  return renderWithProviders(<InstructorCalendarCard instructorId="inst-1" />);
}

const picker = () => screen.findByRole('combobox', { name: 'Calendar' });

async function openPicker() {
  const input = await picker();
  await userEvent.click(input);
  return input;
}

const optionTexts = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent);

async function choose(name: RegExp | string) {
  await openPicker();
  await userEvent.click(screen.getByRole('option', { name }));
}

describe('InstructorCalendarCard picker', () => {
  it('lists unassigned calendars first and disables ones linked to another instructor', async () => {
    serve();
    renderCard();

    const input = await openPicker();
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(optionTexts()).toEqual([
      'SSNOW Admin (admin@ssnow.club)',
      'Jane Snow (jane.snow@ssnow.club)',
      'Sam Ski (sam.ski@gmail.com) · read-only',
      'Li Wei (li.wei@gmail.com) · Linked to Li Wei',
    ]);
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('group')
        .map((g) => g.getAttribute('aria-label')),
    ).toEqual(['Unassigned', 'Linked to other instructors']);
    expect(
      screen.getByRole('option', { name: /Linked to Li Wei/ }),
    ).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(screen.getByRole('option', { name: /Linked to Li Wei/ }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('filters the list as you type and picks a match', async () => {
    const { bodies } = serve();
    renderCard();

    const input = await openPicker();
    await userEvent.type(input, 'gmail');
    expect(optionTexts()).toEqual([
      'Sam Ski (sam.ski@gmail.com) · read-only',
      'Li Wei (li.wei@gmail.com) · Linked to Li Wei',
    ]);

    await userEvent.clear(input);
    await userEvent.type(input, 'jane');
    expect(optionTexts()).toEqual(['Jane Snow (jane.snow@ssnow.club)']);
    await userEvent.click(screen.getByRole('option', { name: /Jane Snow/ }));

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('Jane Snow (jane.snow@ssnow.club)');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(bodies).toEqual([
        { googleCalendarId: 'jane.snow@ssnow.club', matchStatus: 'confirmed' },
      ]),
    );
  });

  it('says when nothing matches the search', async () => {
    serve();
    renderCard();

    await userEvent.type(await openPicker(), 'zzz');
    expect(
      screen.getByText('No calendars match your search.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('picks with the keyboard and skips calendars linked elsewhere', async () => {
    const { bodies } = serve();
    renderCard();

    const input = await picker();
    input.focus();
    await userEvent.type(input, 'i');
    expect(optionTexts()).toEqual([
      'SSNOW Admin (admin@ssnow.club)',
      'Sam Ski (sam.ski@gmail.com) · read-only',
      'Li Wei (li.wei@gmail.com) · Linked to Li Wei',
    ]);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: /SSNOW Admin/ }).id,
    );
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('SSNOW Admin (admin@ssnow.club)');
    expect(bodies).toEqual([]);
  });

  it('restores the picked calendar when the search is abandoned', async () => {
    serve({
      current: {
        googleCalendarId: 'admin@ssnow.club',
        calendarSummary: 'SSNOW Admin',
        matchStatus: 'confirmed',
      },
    });
    renderCard();

    const input = await openPicker();
    await userEvent.type(input, 'sam');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input).toHaveValue('SSNOW Admin (admin@ssnow.club)');

    await userEvent.type(input, 'sam');
    await userEvent.tab();
    expect(input).toHaveValue('SSNOW Admin (admin@ssnow.club)');
  });

  it('shows the current calendar and saves a new pick as confirmed', async () => {
    const { bodies } = serve({
      current: {
        googleCalendarId: 'admin@ssnow.club',
        calendarSummary: 'SSNOW Admin',
        matchStatus: 'confirmed',
      },
    });
    renderCard();

    expect(await picker()).toHaveValue('SSNOW Admin (admin@ssnow.club)');
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await openPicker();
    expect(
      screen.getByRole('option', { name: /SSNOW Admin/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('option', { name: /Jane Snow/ }));
    await userEvent.click(save);

    await waitFor(() =>
      expect(bodies).toEqual([
        { googleCalendarId: 'jane.snow@ssnow.club', matchStatus: 'confirmed' },
      ]),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('marks the suggested match and confirms it in one click', async () => {
    const { bodies } = serve({
      suggestion: {
        calendarId: 'jane.snow@ssnow.club',
        calendarSummary: 'Jane Snow',
        matchedBy: 'email',
      },
    });
    renderCard();

    await openPicker();
    expect(optionTexts()[0]).toBe(
      'Jane Snow (jane.snow@ssnow.club) · Suggested',
    );
    expect(screen.getByText('Suggested match: Jane Snow')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { googleCalendarId: 'jane.snow@ssnow.club', matchStatus: 'confirmed' },
      ]),
    );
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm' }),
    ).not.toBeInTheDocument();
  });

  it('confirms a stored suggestion', async () => {
    const { bodies } = serve({
      current: {
        googleCalendarId: 'jane.snow@ssnow.club',
        calendarSummary: 'Jane Snow',
        matchStatus: 'suggested',
      },
    });
    renderCard();

    expect(await picker()).toHaveValue('Jane Snow (jane.snow@ssnow.club)');
    expect(screen.getByText('Suggested', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { googleCalendarId: 'jane.snow@ssnow.club', matchStatus: 'confirmed' },
      ]),
    );
  });

  it('warns that a read-only calendar cannot take lessons but still saves it', async () => {
    const { bodies } = serve();
    renderCard();

    await picker();
    expect(
      screen.queryByText("Read-only, SSMS can't add lessons"),
    ).not.toBeInTheDocument();
    await choose(/Sam Ski/);
    expect(
      screen.getByText("Read-only, SSMS can't add lessons"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { googleCalendarId: 'sam.ski@gmail.com', matchStatus: 'confirmed' },
      ]),
    );
  });

  it('clears the linked calendar', async () => {
    const { bodies } = serve({
      current: {
        googleCalendarId: 'admin@ssnow.club',
        matchStatus: 'confirmed',
      },
    });
    renderCard();

    await picker();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(bodies).toEqual([{ googleCalendarId: null }]));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Calendar' })).toHaveValue(''),
    );
    expect(
      screen.queryByRole('button', { name: 'Clear' }),
    ).not.toBeInTheDocument();
  });

  it('explains a calendar that another instructor took first', async () => {
    serve({ patchStatus: 409 });
    renderCard();

    await choose(/SSNOW Admin/);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This calendar is already linked to another instructor.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the API message for other failures', async () => {
    serve({ patchStatus: 400 });
    renderCard();

    await choose(/SSNOW Admin/);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('keeps a current calendar that Google no longer lists', async () => {
    serve({
      current: {
        googleCalendarId: 'gone@group.calendar.google.com',
        calendarSummary: 'Old calendar',
        matchStatus: 'confirmed',
      },
    });
    renderCard();

    expect(await openPicker()).toHaveValue('Old calendar');
    expect(
      screen.getByRole('option', {
        name: 'Old calendar · not shared with SSMS',
      }),
    ).toHaveAttribute('aria-selected', 'true');
  });
});

describe('InstructorCalendarCard without Google', () => {
  it('falls back to a manual ID when Google is not connected', async () => {
    const { bodies, calendarRequests } = serve({
      google: { connected: false, error: null },
    });
    renderCard();

    expect(
      await screen.findByText(
        "Google Calendar is not connected, so calendars can't be listed. Connect it, or enter the calendar ID by hand.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Settings → Google Calendar' }),
    ).toHaveAttribute('href', '/admin/settings/google');
    expect(
      screen.queryByRole('combobox', { name: 'Calendar' }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Google Calendar ID' }),
      '  jane@group.calendar.google.com ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          googleCalendarId: 'jane@group.calendar.google.com',
          matchStatus: 'confirmed',
        },
      ]),
    );
    expect(calendarRequests).toEqual([]);
  });

  it('falls back to a manual ID when Google returns an error', async () => {
    const { bodies } = serve({
      google: { connected: true, error: 'Google Calendar is unavailable' },
      current: { googleCalendarId: 'old@group.calendar.google.com', matchStatus: 'confirmed' },
    });
    renderCard();

    expect(
      await screen.findByText(
        "Couldn't load calendars from Google. Check the connection, or enter the calendar ID by hand.",
      ),
    ).toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Google Calendar ID' });
    expect(input).toHaveValue('old@group.calendar.google.com');
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(bodies).toEqual([{ googleCalendarId: null }]));
  });

  it('falls back to a manual ID when the calendar list fails to load', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/google/calendars`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 502 }),
      ),
    );
    renderCard();

    expect(
      await screen.findByRole('textbox', { name: 'Google Calendar ID' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows an error when the instructor calendar cannot be loaded', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/instructors/:id/google-calendar`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderCard();

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
  });

  it('labels the picker in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    renderCard();

    await userEvent.click(await screen.findByRole('combobox', { name: '日历' }));
    expect(
      screen.getByRole('option', { name: /已关联 Li Wei/ }),
    ).toHaveAttribute('aria-disabled', 'true');
  });
});
