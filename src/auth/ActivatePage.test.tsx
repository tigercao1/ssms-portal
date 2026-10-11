import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { ActivatePage } from './ActivatePage';
import { SessionProvider } from './SessionProvider';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import { auth, fakeSession, resetAuth, setSession } from '@/test/supabaseAuth';

vi.mock('@/lib/supabase', () => import('@/test/supabaseAuth'));

const API = 'http://localhost:3000';

function renderActivate(route: string) {
  renderWithProviders(
    <SessionProvider>
      <Routes>
        <Route path="/activate" element={<ActivatePage />} />
        <Route path="/activate/password" element={<p>Password step</p>} />
      </Routes>
    </SessionProvider>,
    { route },
  );
}

function captureRedeem(response: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/activation/redeem`, async ({ request }) => {
      bodies.push(await request.json());
      return response();
    }),
  );
  return bodies;
}

function captureResend() {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/activation/resend`, async ({ request }) => {
      bodies.push(await request.json());
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return bodies;
}

describe('ActivatePage', () => {
  beforeEach(() => resetAuth());

  it('redeems the token, verifies the magic link, then asks for a password', async () => {
    const redeemed = captureRedeem(() =>
      HttpResponse.json({ email: 'Jane@example.com', tokenHash: 'hash-1' }),
    );
    auth.verifyOtp.mockImplementation(async () => {
      setSession(fakeSession('jane@example.com'));
      return { data: {}, error: null };
    });

    renderActivate('/activate?t=tok-123');

    expect(
      screen.getByRole('heading', { name: 'Activating your account…' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Password step')).toBeInTheDocument();
    expect(redeemed).toEqual([{ token: 'tok-123' }]);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      type: 'magiclink',
      token_hash: 'hash-1',
    });
  });

  it('offers a new link when the invite has expired, pre-filling a known email', async () => {
    captureRedeem(() =>
      HttpResponse.json({ email: 'jane@example.com' }, { status: 410 }),
    );
    const resent = captureResend();

    renderActivate('/activate?t=old');

    expect(
      await screen.findByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toHaveValue('jane@example.com');
    expect(auth.verifyOtp).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('button', { name: 'Send me a new link' }),
    );

    expect(
      await screen.findByText(/a new activation link is on its way/),
    ).toBeInTheDocument();
    expect(resent).toEqual([{ email: 'jane@example.com' }]);
  });

  it('treats an unknown token as expired and lets the user type their email', async () => {
    captureRedeem(() =>
      HttpResponse.json({ message: 'Not found' }, { status: 404 }),
    );
    const resent = captureResend();

    renderActivate('/activate?t=nope');

    const input = await screen.findByLabelText(/Email/);
    expect(input).toHaveValue('');
    await userEvent.type(input, ' sam@example.com ');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send me a new link' }),
    );

    await waitFor(() => expect(resent).toEqual([{ email: 'sam@example.com' }]));
  });

  it('shows the expired form without calling the API when the token is missing', async () => {
    const redeemed = captureRedeem(() => HttpResponse.json({}));

    renderActivate('/activate');

    expect(
      screen.getByRole('heading', { name: 'This link has expired' }),
    ).toBeInTheDocument();
    expect(redeemed).toEqual([]);
  });

  it('shows a network error with a working retry', async () => {
    let calls = 0;
    captureRedeem(() => {
      calls += 1;
      return calls === 1
        ? HttpResponse.error()
        : HttpResponse.json({ email: 'jane@example.com', tokenHash: 'h2' });
    });
    auth.verifyOtp.mockImplementation(async () => {
      setSession(fakeSession('jane@example.com'));
      return { data: {}, error: null };
    });

    renderActivate('/activate?t=tok');

    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t reach the server',
      }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Password step')).toBeInTheDocument();
  });

  it('shows a generic error when the magic-link verification fails', async () => {
    captureRedeem(() =>
      HttpResponse.json({ email: 'jane@example.com', tokenHash: 'h' }),
    );
    auth.verifyOtp.mockResolvedValue({
      data: {},
      error: { status: 403, message: 'Token has expired' },
    });

    renderActivate('/activate?t=tok');

    expect(
      await screen.findByRole('heading', {
        name: 'Something went wrong. Please try again.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Password step')).not.toBeInTheDocument();
  });
});
