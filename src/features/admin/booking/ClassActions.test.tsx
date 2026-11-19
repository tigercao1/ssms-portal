import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  customersByIds,
  fakeAdminList,
  fakeClass,
  fakeCustomer,
  fakeLessonType,
  server,
} from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminClass, AdminInstructorRecord, Customer } from '@/lib/types';
import {
  contactlessCustomer,
  deletedCustomer,
} from '@/features/documents/lookups/fixtures';
import { ClassActions } from './ClassActions';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'admin-1' } }),
}));

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
  return user.click(screen.getByRole('button', { name: /^More actions for / }));
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
    expect(
      screen.queryByRole('button', { name: /^More actions for / }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore lesson' }));
    await waitFor(() =>
      expect(calls.at(-1)?.body).toEqual({ status: 'scheduled' }),
    );
  });

  it('marks the menu button busy while a status change is pending', async () => {
    serve();
    let release: () => void = () => undefined;
    server.use(
      http.post(
        `${API}/admin/booking/classes/:id/status`,
        () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(HttpResponse.json(booked));
          }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Mark completed' }));
    const trigger = screen.getByRole('button', { name: /^More actions for / });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-busy', 'true'));
    release();
    await waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy'));
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
    await user.click(screen.getByRole('button', { name: 'Restore lesson' }));
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

  it('shows the waiver status of every customer already in the lesson from one lookup by id', async () => {
    serve();
    const lily = fakeCustomer({
      id: '3d6f1b2a-8c4e-4a7d-9b15-7e2c4f6a8d01',
      waiver: {
        status: 'expired',
        signedAt: '2026-01-10T15:00:00Z',
        year: '2026/27',
      },
    });
    const li = fakeCustomer({
      id: '9a4c2e7b-1d3f-4b6a-8e5c-0f7d9b2a4c63',
      firstName: '李',
      lastName: null,
      email: null,
      phone: null,
      waiver: {
        status: 'signed',
        signedAt: '2026-11-01T15:00:00Z',
        year: '2026/27',
      },
    });
    const unknownId = 'e7b3d9f1-5a2c-4e8b-a6d4-1c9f3b7e5a28';
    const requests: (string | null)[] = [];
    server.use(
      http.get(`${API}/admin/customers`, ({ request }) => {
        const ids = new URL(request.url).searchParams.get('ids');
        requests.push(ids);
        return customersByIds(
          [lily, li, contactlessCustomer, deletedCustomer],
          ids ?? '',
        );
      }),
    );
    const participant = (c: Customer) => ({
      customerId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      attendance: 'expected' as const,
    });
    const item = fakeClass({
      ...booked,
      participants: [
        participant(lily),
        participant(li),
        participant(contactlessCustomer),
        participant(deletedCustomer),
        participant(fakeCustomer({ id: unknownId, firstName: 'Ghost' })),
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={item} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    const selected = within(dialog).getByRole('list', {
      name: 'Selected customers',
    });
    const row = (name: string) =>
      within(selected).getByText(name).closest('li') as HTMLElement;

    await waitFor(() =>
      expect(row('Lily Chen')).toHaveTextContent(
        'Signed last year (Jan 10, 2026), needs re-sign',
      ),
    );
    expect(row('李')).toHaveTextContent('Waiver signed Nov 1, 2026');
    expect(row('—')).toHaveTextContent('No waiver on file');
    expect(row('Zoë Tremblay')).toHaveTextContent(
      'Signed last year (Jan 10, 2026), needs re-sign',
    );
    expect(row('Ghost Chen')).not.toHaveTextContent(/waiver|sign/i);
    expect(
      within(dialog).getByText(
        'No signed waiver for 2026/27: Lily Chen, —, Zoë Tremblay. You can still book.',
      ),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual([
      [
        lily.id,
        li.id,
        contactlessCustomer.id,
        deletedCustomer.id,
        unknownId,
      ].join(','),
    ]);
  });

  it('shows no waiver badge and keeps the lesson editable when the lookup is refused', async () => {
    const calls = serve();
    let lookups = 0;
    server.use(
      http.get(`${API}/admin/customers`, () => {
        lookups += 1;
        return HttpResponse.json(
          { message: 'each value in ids must be a UUID' },
          { status: 400 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });

    await waitFor(() => expect(lookups).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lookups).toBe(1);
    expect(
      within(dialog).getByRole('list', { name: 'Selected customers' }),
    ).not.toHaveTextContent(/waiver|sign/i);
    fireEvent.change(within(dialog).getByLabelText('Notes'), {
      target: { value: 'Meet at the lodge' },
    });
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ notes: 'Meet at the lodge' });
  });

  it('sends startsAt only when the date or time was changed', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderWithProviders(
      <ClassActions
        item={{ ...booked, startsAt: '2026-12-05T15:00:30.000Z' }}
      />,
    );
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '11:00' },
    });
    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '10:00' },
    });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Notes'), {
      target: { value: 'Meet at the lodge' },
    });
    await user.click(save);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ notes: 'Meet at the lodge' });
  });

  it('turns off emails for a move and names who got none', async () => {
    const calls: unknown[] = [];
    serve();
    server.use(
      http.patch(`${API}/admin/booking/classes/:id`, async ({ request }) => {
        calls.push(await request.json());
        return HttpResponse.json({
          ...booked,
          warnings: [
            {
              code: 'customer_email_missing',
              message: 'The customer has no email address',
              customerId: 'cu1',
            },
            {
              code: 'instructor_email_missing',
              message: 'The instructor has no email address',
              instructorId: 'inst-2',
            },
          ],
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    const toggle = within(dialog).getByRole('switch', {
      name: 'Send update emails',
    });
    expect(toggle).toBeChecked();
    await within(dialog).findByRole('option', { name: 'Eddie Lee' });
    await user.selectOptions(
      within(dialog).getByLabelText('Instructor'),
      'inst-2',
    );
    await user.click(toggle);
    await user.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    );
    expect(
      await within(dialog).findByText('Saved. Some emails were not sent'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'No email sent to Lily Chen: no email address on file',
    );
    expect(dialog).toHaveTextContent(
      'No email sent to Eddie Lee: no email address on file',
    );
    expect(calls).toEqual([{ instructorId: 'inst-2', sendEmails: false }]);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the past-time label instead of the email toggle when the move lands in the past', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const dialog = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: '2020-01-02' },
    });
    expect(
      within(dialog).queryByRole('switch', { name: 'Send update emails' }),
    ).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Past time: no emails will be sent');
  });

  it('cancels without emails when turned off and shows warnings from the server', async () => {
    const bodies: string[] = [];
    serve();
    server.use(
      http.post(
        `${API}/admin/booking/classes/:id/cancel`,
        async ({ request }) => {
          bodies.push(await request.text());
          return HttpResponse.json({
            ...booked,
            status: 'cancelled',
            warnings:
              bodies.length === 1
                ? []
                : [
                    {
                      code: 'customer_email_missing',
                      message: 'The customer has no email address',
                      customerId: 'cu1',
                    },
                  ],
          });
        },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    let dialog = screen.getByRole('dialog', { name: 'Cancel this lesson?' });
    await user.click(
      within(dialog).getByRole('switch', { name: 'Send cancellation emails' }),
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel lesson' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(bodies).toEqual([JSON.stringify({ sendEmails: false })]);

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    dialog = screen.getByRole('dialog', { name: 'Cancel this lesson?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Cancel lesson' }),
    );
    expect(
      await within(dialog).findByText('Cancelled. Some emails were not sent'),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'No email sent to Lily Chen: no email address on file',
    );
  });

  it('shows the past-time label in the cancel dialog for a past lesson', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(
      <ClassActions
        item={{
          ...booked,
          startsAt: '2020-01-02T15:00:00.000Z',
          endsAt: '2020-01-02T16:00:00.000Z',
        }}
      />,
    );
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Cancel lesson…' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this lesson?' });
    expect(within(dialog).queryByRole('switch')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('Past time: no emails will be sent');
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

  it('keeps focus in the top dialog and closes one dialog per Escape', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<ClassActions item={booked} />);
    const trigger = screen.getByRole('button', { name: /^More actions for / });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Move or edit…' }));
    const move = screen.getByRole('dialog', { name: 'Move or edit lesson' });
    expect(move).toHaveFocus();
    expect(trigger.closest('[inert]')).not.toBeNull();
    for (let i = 0; i < 12; i++) {
      await user.tab({ shift: i % 4 === 0 });
      expect(move).toContainElement(document.activeElement as HTMLElement);
    }

    const add = within(move).getByRole('button', { name: 'New customer' });
    await user.click(add);
    const create = screen.getByRole('dialog', { name: 'New customer' });
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: i % 2 === 0 });
      expect(create).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard('{Escape}');
    expect(create).not.toBeInTheDocument();
    expect(add).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(move).not.toBeInTheDocument();
    expect(trigger.closest('[inert]')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
