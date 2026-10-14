import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeClass, fakeLessonType, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminClass, AdminInstructorRecord } from '@/lib/types';
import { ClassActions } from './ClassActions';

const API = 'http://localhost:3000';

const jane = fakeAdminList[0] as AdminInstructorRecord;
const eddie: AdminInstructorRecord = {
  ...jane,
  id: 'inst-2',
  email: 'eddie@example.com',
  displayNameEn: 'Eddie Lee',
};

const booked = fakeClass({
  id: 'c1',
  lessonTypeId: 'lt1',
  startsAt: '2026-12-05T15:00:00.000Z',
  endsAt: '2026-12-05T17:00:00.000Z',
  googleCalendarId: 'jane@group.calendar.google.com',
  googleEventId: 'ev1',
  notes: 'Bring skis',
  participants: [
    {
      customerId: 'cu1',
      firstName: 'Lily',
      lastName: 'Chen',
      email: 'lily@example.com',
      phone: null,
      attendance: 'expected',
    },
  ],
});

function serve() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const record = async ({ request }: { request: Request }) => {
    const text = await request.text();
    calls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text ? JSON.parse(text) : undefined,
    });
    return HttpResponse.json(booked);
  };
  server.use(
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([jane, eddie]),
    ),
    http.get(`${API}/admin/lesson-types`, () =>
      HttpResponse.json([
        fakeLessonType(),
        fakeLessonType({ id: 'lt2', nameEn: 'Group 90', durationMin: 90 }),
      ]),
    ),
    http.patch(`${API}/admin/booking/classes/:id`, record),
    http.post(`${API}/admin/booking/classes/:id/cancel`, record),
    http.post(`${API}/admin/booking/classes/:id/status`, record),
  );
  return calls;
}

function openMenu(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: 'Actions' }));
}

describe('ClassActions', () => {
  it('marks a lesson completed or no-show', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((m) => m.textContent),
    ).toEqual([
      'Move or edit…',
      'Mark completed',
      'Mark no-show',
      'Cancel lesson…',
    ]);
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Mark no-show' }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: 'POST',
      path: '/admin/booking/classes/c1/status',
      body: { status: 'no_show' },
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers scheduled for a completed lesson and restore for a cancelled one', async () => {
    const calls = serve();
    const user = userEvent.setup();
    const view = renderWithProviders(
      <ClassActions item={{ ...booked, status: 'completed' }} />,
    );
    await openMenu(user);
    expect(
      screen.getByRole('menuitem', { name: 'Mark scheduled' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Mark completed' }),
    ).not.toBeInTheDocument();
    view.unmount();

    renderWithProviders(
      <ClassActions item={{ ...booked, status: 'cancelled' }} />,
    );
    await openMenu(user);
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await user.click(screen.getByRole('menuitem', { name: 'Restore lesson' }));
    await waitFor(() =>
      expect(calls.at(-1)?.body).toEqual({ status: 'scheduled' }),
    );
  });

  it('shows why a status change was refused', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/booking/classes/:id/status`, () =>
        HttpResponse.json(
          { message: 'The instructor is not free at that time', conflicts: [] },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <ClassActions item={{ ...booked, status: 'cancelled' }} />,
    );
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Restore lesson' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Another booking took this slot',
    );
  });

  it('closes the menu on an outside click', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <p>outside</p>
        <ClassActions item={booked} />
      </div>,
    );
    await openMenu(user);
    await user.click(screen.getByText('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('cancels after confirming and warns about the Google event', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this lesson?' });
    expect(dialog).toHaveTextContent(
      'Its Google Calendar event will be deleted.',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Keep lesson' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toEqual([]);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel lesson',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/admin/booking/classes/c1/cancel',
        body: undefined,
      },
    ]);
  });

  it('shows a Google failure inside the cancel dialog', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/booking/classes/:id/cancel`, () =>
        HttpResponse.json(
          {
            message: 'Google Calendar request failed',
            googleStatus: 500,
            googleReason: 'backendError',
          },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel lesson',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '500 backendError',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('moves a lesson, sending only what changed', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-12-05');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('10:00');
    expect(dialog).toHaveTextContent(
      'The Google Calendar event will be updated to match.',
    );
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '11:30' },
    });
    await within(dialog).findByRole('option', { name: 'Eddie Lee' });
    await user.selectOptions(
      within(dialog).getByLabelText('Instructor'),
      'inst-2',
    );
    await user.selectOptions(
      within(dialog).getByLabelText('Lesson type'),
      'lt2',
    );
    await user.clear(within(dialog).getByLabelText('Notes'));
    await user.click(save);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(calls).toEqual([
      {
        method: 'PATCH',
        path: '/admin/booking/classes/c1',
        body: {
          startsAt: '2026-12-05T16:30:00.000Z',
          instructorId: 'inst-2',
          lessonTypeId: 'lt2',
          notes: null,
        },
      },
    ]);
  });

  it('edits the customers of an imported lesson without a lesson type', async () => {
    const calls = serve();
    server.use(
      http.get(`${API}/admin/customers`, () =>
        HttpResponse.json([
          {
            id: 'cu2',
            shopifyCustomerId: 2,
            firstName: 'Max',
            lastName: 'Wu',
            email: null,
            phone: null,
            shopifyUpdatedAt: null,
            createdAt: '',
            updatedAt: '',
          },
        ]),
      ),
    );
    const imported: AdminClass = {
      ...booked,
      source: 'app_import',
      status: 'completed',
      lessonTypeId: null,
      googleCalendarId: null,
      googleEventId: null,
      notes: null,
    };
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={imported} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('Google Calendar event');
    expect(within(dialog).getByLabelText('Lesson type')).toHaveValue('');
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove Lily Chen' }),
    );
    expect(dialog).toHaveTextContent('Add at least one customer first.');
    await user.type(within(dialog).getByLabelText('Find a customer'), 'max');
    await user.click(
      await within(dialog).findByRole('option', { name: /Max Wu/ }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ customerIds: ['cu2'] });
  });

  it('lists conflicts from a refused move', async () => {
    serve();
    server.use(
      http.patch(`${API}/admin/booking/classes/:id`, () =>
        HttpResponse.json(
          {
            message: 'The instructor is not free at that time',
            conflicts: [
              {
                occurrence: 0,
                startsAt: '2026-12-05T16:30:00.000Z',
                endsAt: '2026-12-05T18:30:00.000Z',
                busyStart: '2026-12-05T17:00:00.000Z',
                busyEnd: '2026-12-05T18:00:00.000Z',
                source: 'google',
              },
            ],
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '11:30' },
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'busy 12:00–13:00 (Google Calendar)',
    );
  });
});
