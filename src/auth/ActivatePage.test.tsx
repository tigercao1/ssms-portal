import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

function captureResend(
  response: () => Response | Promise<Response> = () =>
    new HttpResponse(null, { status: 202 }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${API}/activation/resend`, async ({ request }) => {
      bodies.push(await request.json());
      return response();
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

  it('asks the user to wait when too many new links were requested', async () => {
    captureRedeem(() =>
      HttpResponse.json({ email: 'jane@example.com' }, { status: 410 }),
    );
    captureResend(() =>
      HttpResponse.json({ message: 'Too Many Requests' }, { status: 429 }),
    );

    renderActivate('/activate?t=old');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Send me a new link' }),
    );

    expect(
      await screen.findByText(
        'You’ve requested too many links. Please wait a while and try again later.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Something went wrong/)).toBeNull();
  });

  it('shows the rate-limit message in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    captureRedeem(() =>
      HttpResponse.json({ email: 'jane@example.com' }, { status: 410 }),
    );
    captureResend(() =>
      HttpResponse.json({ message: 'Too Many Requests' }, { status: 429 }),
    );

    renderActivate('/activate?t=old');

    await userEvent.click(
      await screen.findByRole('button', { name: '发送新链接' }),
    );

    expect(
      await screen.findByText('请求新链接的次数过多，请稍后再试。'),
    ).toBeInTheDocument();
  });

  it('keeps the generic error for other resend failures', async () => {
    captureRedeem(() =>
      HttpResponse.json({ email: 'jane@example.com' }, { status: 410 }),
    );
    captureResend(() =>
      HttpResponse.json({ message: 'Boom' }, { status: 500 }),
    );

    renderActivate('/activate?t=old');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Send me a new link' }),
    );

    expect(await screen.findByText(/Something went wrong/)).toBeInTheDocument();
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

  describe('resend cooldown', () => {
    function renderExpired() {
      captureRedeem(() =>
        HttpResponse.json({ email: 'jane@example.com' }, { status: 410 }),
      );
      renderActivate('/activate?t=old');
    }

    async function openExpired() {
      renderExpired();
      return screen.findByRole('button', { name: 'Send me a new link' });
    }

    it('sends one request for a burst of taps, then counts down', async () => {
      let release = () => {};
      const answered = new Promise<void>((resolve) => (release = resolve));
      const resent = captureResend(async () => {
        await answered;
        return new HttpResponse(null, { status: 202 });
      });
      const button = await openExpired();

      for (let i = 0; i < 4; i++) fireEvent.click(button);
      await waitFor(() => expect(resent).toHaveLength(1));
      release();

      const countdown = await screen.findByRole('button', {
        name: /^Resend in (60|59)s$/,
      });
      expect(countdown).toBeDisabled();
      fireEvent.click(countdown);
      await new Promise((r) => setTimeout(r, 50));
      expect(resent).toHaveLength(1);
    });

    it('keeps counting down after a reload', async () => {
      captureResend();
      await userEvent.click(await openExpired());
      await screen.findByRole('button', { name: /^Resend in \d+s$/ });

      cleanup();
      renderExpired();
      expect(
        await screen.findByRole('button', { name: /^Resend in \d+s$/ }),
      ).toBeDisabled();
    });

    it('starts the countdown when the API says too many requests', async () => {
      captureResend(() =>
        HttpResponse.json({ message: 'Too Many Requests' }, { status: 429 }),
      );
      await userEvent.click(await openExpired());
      expect(
        await screen.findByRole('button', { name: /^Resend in \d+s$/ }),
      ).toBeDisabled();
    });

    it('lets the user retry straight away after a server error', async () => {
      const resent = captureResend(() =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      );
      await userEvent.click(await openExpired());
      await screen.findByText(/Something went wrong/);
      await userEvent.click(
        screen.getByRole('button', { name: 'Send me a new link' }),
      );
      await waitFor(() => expect(resent).toHaveLength(2));
    });

    it('re-enables the button once the minute is up', async () => {
      localStorage.setItem(
        'ssms.resendCooldown.activation:jane@example.com',
        String(Date.now() + 1_200),
      );
      renderExpired();
      expect(
        await screen.findByRole('button', { name: /^Resend in [12]s$/ }),
      ).toBeDisabled();
      expect(
        await screen.findByRole(
          'button',
          { name: 'Send me a new link' },
          { timeout: 3_000 },
        ),
      ).toBeEnabled();
    });

    it('shows the countdown in Chinese', async () => {
      localStorage.setItem('ssms.locale', 'zh-CN');
      captureResend();
      renderExpired();
      await userEvent.click(
        await screen.findByRole('button', { name: '发送新链接' }),
      );
      expect(
        await screen.findByRole('button', { name: /^\d+ 秒后可重新发送$/ }),
      ).toBeDisabled();
    });
  });
});
