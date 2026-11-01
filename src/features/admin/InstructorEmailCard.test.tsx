import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { InstructorEmailCard } from './InstructorEmailCard';
import { useAdminInstructor } from './api';
import { renderWithProviders } from '@/test/render';
import { fakeAdminList, server } from '@/test/msw';
import { expectMaskedInReplay } from '@/test/replayPrivacy';
import type { AdminInstructorRecord, UserRole } from '@/lib/types';

const API = 'http://localhost:3000';
const OLD = 'jane@example.com';
const NEW = 'jane.snow@example.org';
const MEMORY_KEY = 'ssms.unfinishedEmailChange.inst-1';

const session = vi.hoisted(() => ({ userId: 'admin-self' }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: true,
    user: { id: session.userId, email: 'admin@example.com' },
    signOut: vi.fn(),
  }),
}));

type Reply = {
  status: number;
  body: Record<string, unknown>;
  applied?: boolean;
};

function serve({
  role = 'instructor',
  replies = [],
  email = OLD,
}: { role?: UserRole; replies?: Reply[]; email?: string } = {}) {
  let record: AdminInstructorRecord = {
    ...(fakeAdminList[0] as AdminInstructorRecord),
    email,
  };
  const bodies: unknown[] = [];
  let detailLoads = 0;
  server.use(
    http.get(`${API}/admin/instructors/:id`, () => {
      detailLoads += 1;
      return HttpResponse.json(record);
    }),
    http.get(`${API}/admin/users/:id/role`, () => HttpResponse.json({ role })),
    http.patch(`${API}/admin/instructors/:id/email`, async ({ request }) => {
      const body = (await request.json()) as { email: string };
      bodies.push(body);
      const reply = replies.shift();
      if (reply && reply.status !== 200) {
        if (reply.applied ?? reply.body.code === 'email_change_incomplete')
          record = { ...record, email: body.email };
        return HttpResponse.json(reply.body, { status: reply.status });
      }
      record = { ...record, email: body.email };
      return HttpResponse.json(record);
    }),
  );
  return { bodies, detailLoads: () => detailLoads };
}

function Harness() {
  const { data } = useAdminInstructor('inst-1');
  return data ? <InstructorEmailCard rec={data} /> : null;
}

async function openDialog() {
  renderWithProviders(<Harness />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Change email' }),
  );
  return screen.getByRole('dialog', { name: 'Change sign-in email' });
}

async function reviewNewEmail(value: string) {
  const dialog = await openDialog();
  await userEvent.type(within(dialog).getByLabelText('New email'), value);
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Continue' }),
  );
  return dialog;
}

beforeEach(() => {
  session.userId = 'admin-self';
  sessionStorage.clear();
});

function rememberUnfinished() {
  sessionStorage.setItem(
    MEMORY_KEY,
    JSON.stringify({ email: NEW, expectedCurrentEmail: OLD }),
  );
}

async function openFinish() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Finish the change' }),
  );
  return screen.getByRole('dialog', { name: 'Change sign-in email' });
}

describe('InstructorEmailCard', () => {
  it('shows the current email, masked in session replay', async () => {
    serve();
    renderWithProviders(<Harness />);
    const shown = await screen.findByText(OLD);
    expectMaskedInReplay(shown);
    expect(
      await screen.findByRole('button', { name: 'Change email' }),
    ).toBeEnabled();
  });

  it('opens a dialog with focus on the new address and checks it before confirming', async () => {
    serve();
    const dialog = await openDialog();
    const input = within(dialog).getByLabelText('New email');
    expect(input).toHaveFocus();
    expectMaskedInReplay(within(dialog).getByText(OLD));

    await userEvent.type(input, 'not-an-email');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continue' }),
    );
    expect(
      within(dialog).getByText('Enter a valid email address.'),
    ).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, 'JANE@example.com');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continue' }),
    );
    expect(
      within(dialog).getByText("This is already the instructor's email."),
    ).toBeInTheDocument();
  });

  it('repeats both addresses and the consequences, then changes the email and refreshes the record', async () => {
    const { bodies, detailLoads } = serve();
    const dialog = await reviewNewEmail('  Jane.Snow@Example.ORG ');

    const summary = within(dialog).getByTestId('email-change-summary');
    expect(within(summary).getByText(OLD)).toBeInTheDocument();
    expect(within(summary).getByText(NEW)).toBeInTheDocument();
    expectMaskedInReplay(within(summary).getByText(NEW));
    expect(
      within(dialog).getByText(/signed out on every device/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Both addresses get an email/),
    ).toBeInTheDocument();
    expect(bodies).toEqual([]);
    const loadsBefore = detailLoads();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Change email' }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Change sign-in email' }),
      ).not.toBeInTheDocument(),
    );
    expect(bodies).toEqual([{ email: NEW, expectedCurrentEmail: OLD }]);
    expect(await screen.findByText(NEW)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Email changed. The instructor was signed out and both addresses were notified.',
    );
    await waitFor(() => expect(detailLoads()).toBeGreaterThan(loadsBefore));
  });

  it('goes back to the address field without sending anything', async () => {
    const { bodies } = serve();
    const dialog = await reviewNewEmail(NEW);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(within(dialog).getByLabelText('New email')).toHaveValue(NEW);
    expect(bodies).toEqual([]);
  });

  it('says when another account already uses the address', async () => {
    serve({
      replies: [
        { status: 409, body: { statusCode: 409, code: 'email_taken' } },
      ],
    });
    const dialog = await reviewNewEmail(NEW);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Change email' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Another account already uses this email address.',
    );
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('says the form is stale and offers no retry when the email changed meanwhile', async () => {
    serve({
      replies: [
        { status: 409, body: { statusCode: 409, code: 'stale_email' } },
      ],
    });
    const dialog = await reviewNewEmail(NEW);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Change email' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "This instructor's email changed while this window was open.",
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Change email' }),
    ).not.toBeInTheDocument();
  });

  it('retries an incomplete change with the same request', async () => {
    const { bodies } = serve({
      replies: [
        {
          status: 500,
          body: { statusCode: 500, code: 'email_change_incomplete' },
        },
      ],
    });
    const dialog = await reviewNewEmail(NEW);
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Change email' }),
    );
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "The email was changed, but signing the instructor out or moving their invite didn't finish.",
    );

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Try again' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Change sign-in email' }),
      ).not.toBeInTheDocument(),
    );
    expect(bodies).toEqual([
      { email: NEW, expectedCurrentEmail: OLD },
      { email: NEW, expectedCurrentEmail: OLD },
    ]);
  });

  it('closes on Escape without sending anything', async () => {
    const { bodies } = serve();
    await openDialog();
    await userEvent.keyboard('{Escape}');
    expect(
      screen.queryByRole('dialog', { name: 'Change sign-in email' }),
    ).not.toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it('offers no change for an admin account', async () => {
    serve({ role: 'admin' });
    renderWithProviders(<Harness />);
    expect(
      await screen.findByText("An admin's email can't be changed here."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change email' }),
    ).not.toBeInTheDocument();
  });

  it('offers no change for the signed-in admin themself', async () => {
    session.userId = 'auth-1';
    serve();
    renderWithProviders(<Harness />);
    expect(
      await screen.findByText("You can't change your own email here."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Change email' }),
    ).not.toBeInTheDocument();
  });

  describe('an unfinished change', () => {
    it('is remembered after the dialog closes and finished with the same request', async () => {
      const { bodies } = serve({
        replies: [
          {
            status: 500,
            body: { statusCode: 500, code: 'email_change_incomplete' },
          },
        ],
      });
      const dialog = await reviewNewEmail(NEW);
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Change email' }),
      );
      await within(dialog).findByRole('alert');
      await userEvent.keyboard('{Escape}');

      const notice = await screen.findByText(
        `The change to ${NEW} didn't finish.`,
      );
      expectMaskedInReplay(notice);
      const finish = await openFinish();
      expect(
        within(finish).getByText(new RegExp(`Finish the change to ${NEW}`)),
      ).toBeInTheDocument();
      const summary = within(finish).getByTestId('email-change-summary');
      expect(within(summary).getByText(OLD)).toBeInTheDocument();
      expect(within(summary).getByText(NEW)).toBeInTheDocument();
      expect(within(finish).queryByLabelText('New email')).toBeNull();

      await userEvent.click(
        within(finish).getByRole('button', { name: 'Finish the change' }),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Change sign-in email' }),
        ).not.toBeInTheDocument(),
      );
      expect(bodies).toEqual([
        { email: NEW, expectedCurrentEmail: OLD },
        { email: NEW, expectedCurrentEmail: OLD },
      ]);
      expect(sessionStorage.getItem(MEMORY_KEY)).toBeNull();
      expect(
        screen.queryByText(`The change to ${NEW} didn't finish.`),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Change email' }),
      ).toBeInTheDocument();
    });

    it('is offered after a reload when the request got no answer but the address moved', async () => {
      const { bodies } = serve({
        replies: [
          { status: 502, body: { message: 'Bad gateway' }, applied: true },
        ],
      });
      const dialog = await reviewNewEmail(NEW);
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Change email' }),
      );
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Something went wrong',
      );
      expect(JSON.parse(sessionStorage.getItem(MEMORY_KEY)!)).toEqual({
        email: NEW,
        expectedCurrentEmail: OLD,
      });
      cleanup();

      renderWithProviders(<Harness />);
      const finish = await openFinish();
      await userEvent.click(
        within(finish).getByRole('button', { name: 'Finish the change' }),
      );

      await waitFor(() => expect(bodies).toHaveLength(2));
      expect(bodies[1]).toEqual({ email: NEW, expectedCurrentEmail: OLD });
    });

    it('is forgotten on request, leaving the normal form for the address shown', async () => {
      rememberUnfinished();
      const { bodies } = serve({ email: NEW });
      renderWithProviders(<Harness />);
      const finish = await openFinish();

      await userEvent.click(
        within(finish).getByRole('button', { name: "Don't finish" }),
      );

      expect(sessionStorage.getItem(MEMORY_KEY)).toBeNull();
      expect(within(finish).getByLabelText('New email')).toBeInTheDocument();
      expect(within(finish).getByText(NEW)).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(
        screen.getByRole('button', { name: 'Change email' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/didn't finish/)).toBeNull();
      expect(bodies).toEqual([]);
    });

    it('is cleared with the stale message when someone else changed the email meanwhile', async () => {
      rememberUnfinished();
      serve({
        email: 'someone.else@example.com',
        replies: [
          { status: 409, body: { statusCode: 409, code: 'stale_email' } },
        ],
      });
      renderWithProviders(<Harness />);
      const finish = await openFinish();

      await userEvent.click(
        within(finish).getByRole('button', { name: 'Finish the change' }),
      );

      expect(await within(finish).findByRole('alert')).toHaveTextContent(
        "This instructor's email changed while this window was open.",
      );
      expect(sessionStorage.getItem(MEMORY_KEY)).toBeNull();
      expect(
        within(finish).queryByRole('button', { name: 'Finish the change' }),
      ).toBeNull();
      expect(within(finish).getAllByRole('button')).toHaveLength(1);
      await userEvent.click(
        within(finish).getByRole('button', { name: 'Close' }),
      );
      expect(
        await screen.findByRole('button', { name: 'Change email' }),
      ).toBeInTheDocument();
    });

    it('is not offered while the instructor still has the old address', async () => {
      rememberUnfinished();
      serve();
      renderWithProviders(<Harness />);
      expect(
        await screen.findByRole('button', { name: 'Change email' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/didn't finish/)).toBeNull();
    });

    it('is not offered for an admin account or the admin themself', async () => {
      rememberUnfinished();
      serve({ role: 'admin', email: NEW });
      renderWithProviders(<Harness />);
      expect(
        await screen.findByText("An admin's email can't be changed here."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/didn't finish/)).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      cleanup();

      session.userId = 'auth-1';
      serve({ email: NEW });
      renderWithProviders(<Harness />);
      expect(
        await screen.findByText("You can't change your own email here."),
      ).toBeInTheDocument();
      expect(screen.queryByText(/didn't finish/)).toBeNull();
    });
  });
});
