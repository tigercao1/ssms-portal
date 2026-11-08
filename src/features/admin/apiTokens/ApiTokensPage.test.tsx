import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { expectMaskedInReplay } from '@/test/replayPrivacy';
import { ApiTokensPage } from './ApiTokensPage';
import {
  apiTokensHandlers,
  createApiTokensState,
  fakeApiToken,
  type ApiTokensMockState,
} from './fixtures';

const API = 'http://localhost:3000';
const NOW = new Date('2026-11-08T17:00:00Z');
const DAY_MS = 86_400_000;

let state: ApiTokensMockState;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  state = createApiTokensState();
  server.use(...apiTokensHandlers(state));
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  const user = userEvent.setup();
  renderWithProviders(<ApiTokensPage />);
  return user;
}

function tokenItem(name: string) {
  return screen.getByRole('listitem', { name });
}

async function openCreate(user: UserEvent) {
  await user.click(await screen.findByRole('button', { name: 'Create token' }));
  return screen.getByRole('dialog', { name: 'Create API token' });
}

async function createToken(
  user: UserEvent,
  {
    name = 'My laptop',
    expiry,
    date,
  }: { name?: string; expiry?: string; date?: string } = {},
) {
  const dialog = await openCreate(user);
  await user.type(within(dialog).getByLabelText(/Name/), name);
  if (expiry)
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Expires' }),
      expiry,
    );
  if (date) {
    const input = within(dialog).getByLabelText(/Expiry date/);
    await user.clear(input);
    await user.type(input, date);
  }
  await user.click(
    within(dialog).getByRole('button', { name: 'Create token' }),
  );
  return dialog;
}

describe('ApiTokensPage list', () => {
  it('shows each token with its status, masked value and dates', async () => {
    renderPage();

    const laptop = await screen.findByRole('listitem', {
      name: 'Claude Code laptop',
    });
    expect(within(laptop).getByText('Active')).toBeInTheDocument();
    expect(within(laptop).getByText('ssms_pat_Ab3d…x9Qz')).toBeInTheDocument();
    expect(within(laptop).getByText('Created').nextSibling).toHaveTextContent(
      'Nov 1, 2026',
    );
    expect(within(laptop).getByText('Expires').nextSibling).toHaveTextContent(
      'Jan 30, 2027',
    );
    expect(within(laptop).getByText('Last used').nextSibling).toHaveTextContent(
      /Nov 7, 2026/,
    );

    const nightly = tokenItem('Nightly export');
    expect(within(nightly).getByText('Expires').nextSibling).toHaveTextContent(
      'Never',
    );
    expect(within(nightly).getByText('Never used')).toBeInTheDocument();

    expect(within(tokenItem('Old script')).getByText('Expired')).toBeVisible();
    expect(
      within(tokenItem('Leaked token')).getByText('Revoked'),
    ).toBeVisible();
    expect(within(tokenItem('CI runner')).getByText('Rotating')).toBeVisible();
  });

  it('offers rotate and revoke only where they still apply', async () => {
    renderPage();
    await screen.findByRole('listitem', { name: 'Claude Code laptop' });

    const actions = (name: string) =>
      within(tokenItem(name))
        .queryAllByRole('button')
        .map((b) => b.textContent);

    expect(actions('Claude Code laptop')).toEqual(['Rotate', 'Revoke']);
    expect(actions('CI runner')).toEqual(['Revoke']);
    expect(actions('Old script')).toEqual([]);
    expect(actions('Leaked token')).toEqual([]);
  });

  it('shows an empty state', async () => {
    state.tokens = [];
    renderPage();

    expect(await screen.findByText('No API tokens yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('explains a 403 as needing a signed-in session', async () => {
    server.use(
      http.get(`${API}/admin/api-tokens`, () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    );
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Managing API tokens needs your own signed-in admin session.',
    );
  });
});

describe('ApiTokensPage create', () => {
  it('shows the secret once with the env snippet, then clears it on close', async () => {
    const user = renderPage();
    const form = await createToken(user);

    const dialog = await screen.findByRole('dialog', {
      name: 'Copy your new token',
    });
    expect(form).not.toBeInTheDocument();
    const secret = state.tokens[0]!;
    expect(state.creates).toHaveLength(1);

    const secretText = within(dialog).getByTestId('api-token-secret');
    expect(secretText.textContent).toMatch(/^ssms_pat_[A-Za-z0-9_-]{43}$/);
    expectMaskedInReplay(secretText);
    const value = secretText.textContent!;
    expect(within(dialog).getByTestId('api-token-snippet').textContent).toBe(
      `export SSMS_API_URL=https://api.ssnow.club\nexport SSMS_ADMIN_TOKEN=${value}`,
    );
    expect(
      within(dialog).getByText('You won’t see this token again'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Copy token' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(value);
    await user.click(
      within(dialog).getByRole('button', { name: 'Copy snippet' }),
    );
    await expect(navigator.clipboard.readText()).resolves.toBe(
      `export SSMS_API_URL=https://api.ssnow.club\nexport SSMS_ADMIN_TOKEN=${value}`,
    );

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(value)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(value);
    const created = await screen.findByRole('listitem', { name: 'My laptop' });
    expect(
      within(created).getByText(`${secret.prefix}…${secret.last4}`),
    ).toBeInTheDocument();

    const reopened = await openCreate(user);
    expect(within(reopened).getByLabelText(/Name/)).toHaveValue('');
    expect(document.body.textContent).not.toContain(value);
  });

  it('clears the secret when the dialog is dismissed with Escape', async () => {
    const user = renderPage();
    await createToken(user);
    const dialog = await screen.findByRole('dialog', {
      name: 'Copy your new token',
    });
    const value = within(dialog).getByTestId('api-token-secret').textContent!;

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(value);
  });

  it.each([
    ['In 30 days', 30],
    ['In 90 days', 90],
    ['In 365 days', 365],
  ])('sends %s as an ISO expiry', async (label, days) => {
    const user = renderPage();
    await createToken(user, { expiry: label });

    await screen.findByRole('dialog', { name: 'Copy your new token' });
    expect(state.creates).toEqual([
      {
        name: 'My laptop',
        expiresAt: new Date(NOW.getTime() + days * DAY_MS).toISOString(),
      },
    ]);
  });

  it('defaults to 90 days', async () => {
    const user = renderPage();
    await createToken(user);

    await screen.findByRole('dialog', { name: 'Copy your new token' });
    expect(state.creates[0]?.expiresAt).toBe(
      new Date(NOW.getTime() + 90 * DAY_MS).toISOString(),
    );
  });

  it('sends the end of a custom date', async () => {
    const user = renderPage();
    await createToken(user, { expiry: 'On a date', date: '2027-03-01' });

    await screen.findByRole('dialog', { name: 'Copy your new token' });
    expect(state.creates[0]?.expiresAt).toBe(
      new Date('2027-03-01T23:59:59').toISOString(),
    );
  });

  it('warns about a token that never expires and sends null', async () => {
    const user = renderPage();
    const dialog = await openCreate(user);
    const expiry = within(dialog).getByRole('combobox', { name: 'Expires' });

    await user.selectOptions(expiry, 'Never');
    expect(
      within(dialog).getByText('This token never expires'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/keeps full admin access until you revoke it/),
    ).toBeInTheDocument();

    await user.selectOptions(expiry, 'In 30 days');
    expect(
      within(dialog).queryByText('This token never expires'),
    ).not.toBeInTheDocument();

    await user.selectOptions(expiry, 'Never');
    await user.type(within(dialog).getByLabelText(/Name/), 'Forever');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create token' }),
    );

    await screen.findByRole('dialog', { name: 'Copy your new token' });
    expect(state.creates).toEqual([{ name: 'Forever', expiresAt: null }]);
  });

  it('requires a name', async () => {
    const user = renderPage();
    const dialog = await openCreate(user);

    await user.click(
      within(dialog).getByRole('button', { name: 'Create token' }),
    );

    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Name/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(state.creates).toEqual([]);
  });

  it.each([
    ['today', '2026-11-08'],
    ['more than 3 years away', '2029-11-09'],
  ])('rejects a custom date %s', async (_, date) => {
    const user = renderPage();
    const dialog = await createToken(user, { expiry: 'On a date', date });

    expect(
      within(dialog).getByText(
        'Choose a date between tomorrow and 3 years from now.',
      ),
    ).toBeInTheDocument();
    expect(state.creates).toEqual([]);
  });

  it.each([
    [403, { message: 'Forbidden' }, 'needs your own signed-in admin session'],
    [429, { message: 'ThrottlerException' }, 'Too many requests'],
    [400, { message: 'expiresAt must be in the future' }, 'expiresAt must be'],
  ])('keeps the form open with the %s error', async (status, body, message) => {
    server.use(
      http.post(`${API}/admin/api-tokens`, () =>
        HttpResponse.json(body, { status }),
      ),
    );
    const user = renderPage();
    const dialog = await createToken(user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(within(dialog).getByLabelText(/Name/)).toHaveValue('My laptop');
    expect(screen.queryByTestId('api-token-secret')).not.toBeInTheDocument();
  });
});

describe('ApiTokensPage rotate', () => {
  it('rotates with a 10 minute grace by default and shows the new secret', async () => {
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Rotate Claude Code laptop' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Rotate Claude Code laptop?',
    });
    expect(
      within(dialog).getByRole('combobox', {
        name: 'Old token keeps working for',
      }),
    ).toHaveDisplayValue('10 minutes (default)');

    await user.click(
      within(dialog).getByRole('button', { name: 'Rotate token' }),
    );

    const secret = await screen.findByRole('dialog', {
      name: 'Copy your rotated token',
    });
    expect(state.rotations).toEqual([
      { id: 'tok-1', body: { graceMinutes: 10 } },
    ]);
    const value = within(secret).getByTestId('api-token-secret').textContent!;
    expect(value).toMatch(/^ssms_pat_/);

    await user.click(within(secret).getByRole('button', { name: 'Done' }));
    expect(document.body.textContent).not.toContain(value);
    await waitFor(() =>
      expect(
        within(
          screen.getAllByRole('listitem', { name: 'Claude Code laptop' })[1]!,
        ).getByText('Rotating'),
      ).toBeInTheDocument(),
    );
  });

  it('sends the chosen grace period', async () => {
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Rotate Claude Code laptop' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(
      within(dialog).getByRole('combobox', {
        name: 'Old token keeps working for',
      }),
      'No grace, stop it now',
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Rotate token' }),
    );

    await screen.findByRole('dialog', { name: 'Copy your rotated token' });
    expect(state.rotations).toEqual([
      { id: 'tok-1', body: { graceMinutes: 0 } },
    ]);
  });

  it('shows a rate limit error and no secret', async () => {
    server.use(
      http.post(`${API}/admin/api-tokens/:id/rotate`, () =>
        HttpResponse.json({ message: 'Too Many Requests' }, { status: 429 }),
      ),
    );
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Rotate Claude Code laptop' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Rotate token' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many requests. Wait a minute and try again.',
    );
    expect(screen.queryByTestId('api-token-secret')).not.toBeInTheDocument();
  });
});

describe('ApiTokensPage revoke', () => {
  it('does nothing when the confirmation is cancelled', async () => {
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Revoke Claude Code laptop' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Revoke Claude Code laptop?',
    });
    expect(
      within(dialog).getByText(/stop working right away/),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.revocations).toEqual([]);
  });

  it('revokes after confirming', async () => {
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Revoke Claude Code laptop' }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Revoke token',
      }),
    );

    expect(
      await screen.findByText('Claude Code laptop revoked.'),
    ).toBeInTheDocument();
    expect(state.revocations).toEqual(['tok-1']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(tokenItem('Claude Code laptop')).getByText('Revoked'),
      ).toBeInTheDocument(),
    );
    expect(
      within(tokenItem('Claude Code laptop')).queryAllByRole('button'),
    ).toEqual([]);
  });

  it('keeps the confirmation open with a 403 error', async () => {
    server.use(
      http.delete(`${API}/admin/api-tokens/:id`, () =>
        HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
      ),
    );
    const user = renderPage();
    await user.click(
      await screen.findByRole('button', { name: 'Revoke Claude Code laptop' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Revoke token' }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'needs your own signed-in admin session',
    );
    expect(
      within(tokenItem('Claude Code laptop')).getByText('Active'),
    ).toBeVisible();
  });
});

describe('ApiTokensPage in Chinese', () => {
  it('shows the list and the never-expiry warning in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    state.tokens = [fakeApiToken({ expiresAt: null, lastUsedAt: null })];
    const user = renderPage();

    const item = await screen.findByRole('listitem', {
      name: 'Claude Code laptop',
    });
    expect(screen.getByRole('heading', { name: 'API 令牌' })).toBeVisible();
    expect(within(item).getByText('有效')).toBeInTheDocument();
    expect(within(item).getByText('永不过期')).toBeInTheDocument();
    expect(within(item).getByText('从未使用')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建令牌' }));
    const dialog = screen.getByRole('dialog', { name: '创建 API 令牌' });
    await user.selectOptions(
      within(dialog).getByRole('combobox', { name: '过期' }),
      '永不过期',
    );
    expect(within(dialog).getByText('此令牌永不过期')).toBeInTheDocument();
  });
});
