import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeClass, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ClassesPage } from './ClassesPage';
import { hideBookingWarnings } from './booking/bookingWarnings';
import type { AdminClass, AdminInstructorRecord } from '@/lib/types';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'admin-1' } }),
}));

const API = 'http://localhost:3000';
const jane = fakeAdminList[0] as AdminInstructorRecord;

const warnings = [
  {
    code: 'customer_email_missing',
    message: 'The customer has no email address',
    customerId: 'cu1',
  },
];

function serve() {
  let lesson: AdminClass = fakeClass({
    id: 'c1',
    startsAt: '2026-11-10T15:00:00.000Z',
    endsAt: '2026-11-10T17:00:00.000Z',
    participants: [
      {
        customerId: 'cu1',
        firstName: 'Lily',
        lastName: 'Chen',
        email: null,
        phone: null,
        attendance: 'expected',
      },
    ],
  });
  server.use(
    http.get(`${API}/admin/instructors`, () => HttpResponse.json([jane])),
    http.get(`${API}/admin/classes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const statuses = params.get('status')?.split(',');
      const from = params.get('from');
      const to = params.get('to');
      const starts = Date.parse(lesson.startsAt);
      const shown =
        (!statuses || statuses.includes(lesson.status)) &&
        (!from || starts >= Date.parse(from)) &&
        (!to || starts < Date.parse(to));
      const rows = shown ? [lesson] : [];
      return HttpResponse.json(rows, {
        headers: { 'X-Total-Count': String(rows.length) },
      });
    }),
    http.post(`${API}/admin/booking/classes/:id/cancel`, () => {
      lesson = { ...lesson, status: 'cancelled' };
      return HttpResponse.json({ ...lesson, warnings });
    }),
    http.patch(`${API}/admin/booking/classes/:id`, async ({ request }) => {
      const body = (await request.json()) as { startsAt?: string };
      if (body.startsAt) lesson = { ...lesson, startsAt: body.startsAt };
      return HttpResponse.json({ ...lesson, warnings });
    }),
  );
}

const views = [
  { name: 'the Upcoming list', route: '/?tab=upcoming', moveTo: '2026-11-01' },
  {
    name: 'the week calendar',
    route: '/?view=calendar&cal=week&date=2026-11-10',
    moveTo: '2026-11-12',
  },
  {
    name: 'the calendar day list',
    route: '/?day=2026-11-10&status=scheduled%2Ccompleted%2Cno_show',
    moveTo: '2026-11-12',
  },
];

const rowMenu = () =>
  screen.queryByRole('button', { name: /^More actions for / });

async function openAction(
  user: ReturnType<typeof userEvent.setup>,
  action: string,
) {
  await user.click(
    await screen.findByRole('button', { name: /^More actions for / }),
  );
  await user.click(screen.getByRole('menuitem', { name: action }));
}

describe('ClassesPage booking warnings', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T17:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    hideBookingWarnings();
    localStorage.clear();
  });

  it.each(views)(
    'shows the cancel warnings in $name after the refetch drops the row',
    async ({ route }) => {
      serve();
      const user = userEvent.setup();
      renderWithProviders(<ClassesPage />, { route });
      await openAction(user, 'Cancel lesson…');
      await user.click(
        within(
          screen.getByRole('dialog', { name: 'Cancel this lesson?' }),
        ).getByRole('button', { name: 'Cancel lesson' }),
      );

      expect(
        await screen.findByText('Cancelled. Some emails were not sent'),
      ).toBeInTheDocument();
      await waitFor(() => expect(rowMenu()).not.toBeInTheDocument());
      const dialog = screen.getByRole('dialog', {
        name: 'Cancel this lesson?',
      });
      expect(dialog).toHaveTextContent(
        'No email sent to Lily Chen: no email address on file',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );

  it.each(views)(
    'shows the move warnings in $name after the refetch drops the row',
    async ({ route, moveTo }) => {
      serve();
      const user = userEvent.setup();
      renderWithProviders(<ClassesPage />, { route });
      await openAction(user, 'Move or edit…');
      const form = screen.getByRole('dialog', { name: 'Move or edit lesson' });
      fireEvent.change(within(form).getByLabelText('Date'), {
        target: { value: moveTo },
      });
      await user.click(
        within(form).getByRole('button', { name: 'Save changes' }),
      );

      expect(
        await screen.findByText('Saved. Some emails were not sent'),
      ).toBeInTheDocument();
      if (route.includes('cal=week')) {
        await waitFor(() =>
          expect(
            within(
              screen.getByRole('region', { name: 'Thursday, Nov 12' }),
            ).getByRole('button', { name: /^More actions for / }),
          ).toBeInTheDocument(),
        );
      } else {
        await waitFor(() => expect(rowMenu()).not.toBeInTheDocument());
      }
      const dialog = screen.getByRole('dialog', {
        name: 'Move or edit lesson',
      });
      expect(dialog).toHaveTextContent(
        'No email sent to Lily Chen: no email address on file',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
  );
});
