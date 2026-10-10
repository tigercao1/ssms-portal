import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ShopifySyncPage } from './ShopifySyncPage';
import { renderWithProviders } from '@/test/render';
import { fakeShopifySyncStatus, server } from '@/test/msw';
import type { ShopifySyncStatus } from '@/lib/types';

const API = 'http://localhost:3000';

function serveStatus(overrides: Partial<ShopifySyncStatus> = {}) {
  let status: ShopifySyncStatus = { ...fakeShopifySyncStatus, ...overrides };
  const patchBodies: unknown[] = [];
  const runBodies: unknown[] = [];
  let statusCalls = 0;
  server.use(
    http.get(`${API}/admin/shopify-sync/status`, () => {
      statusCalls += 1;
      return HttpResponse.json(status);
    }),
    http.patch(`${API}/admin/shopify-sync`, async ({ request }) => {
      const body = (await request.json()) as { enabled: boolean };
      patchBodies.push(body);
      status = { ...status, enabled: body.enabled };
      return HttpResponse.json({ enabled: body.enabled });
    }),
    http.post(`${API}/admin/shopify-sync/run`, async ({ request }) => {
      runBodies.push(await request.json());
      return HttpResponse.json({ enqueued: 14 });
    }),
  );
  return { patchBodies, runBodies, statusCalls: () => statusCalls };
}

function syncSwitch() {
  return screen.getByRole('switch', { name: 'Shopify sync' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ShopifySyncPage status', () => {
  it('shows state, run times, queue and entry counts', async () => {
    serveStatus();
    renderWithProviders(<ShopifySyncPage />);

    expect(await screen.findByTestId('sync-state')).toHaveTextContent('Off');
    expect(syncSwitch()).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Last run')).toBeInTheDocument();
    expect(screen.queryAllByText('Never')).toHaveLength(0);

    const queue = screen.getByRole('region', { name: 'Queue' });
    expect(within(queue).getByText('Pending').nextSibling).toHaveTextContent(
      '3',
    );
    expect(within(queue).getByText('Retrying').nextSibling).toHaveTextContent(
      '1',
    );
    expect(within(queue).getByText(/Oldest queued/)).toBeInTheDocument();

    const entries = screen.getByRole('region', { name: 'Shopify entries' });
    const expected: [string, string][] = [
      ['Synced', '12'],
      ['Active', '9'],
      ['Draft', '3'],
      ['Failed', '2'],
    ];
    for (const [label, value] of expected) {
      expect(within(entries).getByText(label).nextSibling).toHaveTextContent(
        value,
      );
    }
    expect(screen.queryByText('Master switch off')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Shopify not configured'),
    ).not.toBeInTheDocument();
  });

  it('shows "Never" for runs that have not happened', async () => {
    serveStatus({ lastTickAt: null, lastSuccessAt: null });
    renderWithProviders(<ShopifySyncPage />);

    expect(await screen.findAllByText('Never')).toHaveLength(2);
  });

  it('renders the last error with its time', async () => {
    serveStatus({
      lastError: 'Shopify throttled the request',
      lastErrorAt: '2026-10-10T03:01:00Z',
    });
    renderWithProviders(<ShopifySyncPage />);

    expect(
      await screen.findByText('Shopify throttled the request'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/2026/, { selector: 'span.text-xs' }),
    ).toBeInTheDocument();
  });

  it('shows an error when the status cannot be loaded', async () => {
    server.use(
      http.get(`${API}/admin/shopify-sync/status`, () =>
        HttpResponse.json({ message: 'Status unavailable' }, { status: 503 }),
      ),
    );
    renderWithProviders(<ShopifySyncPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Status unavailable',
    );
  });

  it('polls the status every 10 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { statusCalls } = serveStatus();
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');
    expect(statusCalls()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await waitFor(() => expect(statusCalls()).toBe(2));
  });
});

describe('ShopifySyncPage disabled states', () => {
  it('warns when the master switch is off', async () => {
    serveStatus({ enabled: true, masterSwitch: false });
    renderWithProviders(<ShopifySyncPage />);

    expect(await screen.findByText('Master switch off')).toBeInTheDocument();
    expect(screen.getByTestId('sync-state')).toHaveTextContent(
      'On, but not running',
    );
  });

  it('warns when Shopify is not configured', async () => {
    serveStatus({ enabled: true, configured: false });
    renderWithProviders(<ShopifySyncPage />);

    expect(
      await screen.findByText('Shopify not configured'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sync-state')).toHaveTextContent(
      'On, but not running',
    );
  });

  it('shows On when enabled and able to run', async () => {
    serveStatus({ enabled: true });
    renderWithProviders(<ShopifySyncPage />);

    expect(await screen.findByTestId('sync-state')).toHaveTextContent(/^On$/);
    expect(syncSwitch()).toHaveAttribute('aria-checked', 'true');
  });
});

describe('ShopifySyncPage toggle', () => {
  it('turns sync on only after confirming', async () => {
    const user = userEvent.setup();
    const { patchBodies } = serveStatus();
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(syncSwitch());
    const dialog = screen.getByRole('alertdialog', {
      name: 'Turn on Shopify sync?',
    });
    expect(dialog).toHaveTextContent(
      'Approved, online instructors will be published to the Shopify preview list.',
    );
    expect(patchBodies).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(patchBodies).toEqual([]);

    await user.click(syncSwitch());
    await user.click(screen.getByRole('button', { name: 'Turn on' }));

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
    expect(patchBodies).toEqual([{ enabled: true }]);
    await waitFor(() =>
      expect(screen.getByTestId('sync-state')).toHaveTextContent(/^On$/),
    );
  });

  it('turns sync off after confirming', async () => {
    const user = userEvent.setup();
    const { patchBodies } = serveStatus({ enabled: true });
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(syncSwitch());
    expect(
      screen.getByRole('alertdialog', { name: 'Turn off Shopify sync?' }),
    ).toHaveTextContent('Queued changes are kept');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(patchBodies).toEqual([{ enabled: false }]));
    await waitFor(() =>
      expect(screen.getByTestId('sync-state')).toHaveTextContent('Off'),
    );
  });

  it('keeps the dialog open and shows the error when the change fails', async () => {
    const user = userEvent.setup();
    serveStatus();
    server.use(
      http.patch(`${API}/admin/shopify-sync`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(syncSwitch());
    await user.click(screen.getByRole('button', { name: 'Turn on' }));

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Forbidden resource',
    );
    expect(screen.getByTestId('sync-state')).toHaveTextContent('Off');
  });
});

describe('ShopifySyncPage sync all', () => {
  it('queues everyone after confirming and notes that sync is off', async () => {
    const user = userEvent.setup();
    const { runBodies } = serveStatus();
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(screen.getByRole('button', { name: 'Sync all now' }));
    expect(
      screen.getByRole('alertdialog', {
        name: 'Queue every instructor for sync?',
      }),
    ).toBeInTheDocument();
    expect(runBodies).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('Queued 14 instructors.'),
    ).toBeInTheDocument();
    expect(runBodies).toEqual([{}]);
    expect(
      screen.getByText(
        'Sync is off, so they wait in the queue until it is turned on.',
      ),
    ).toBeInTheDocument();
  });

  it('omits the off note when sync is running', async () => {
    const user = userEvent.setup();
    serveStatus({ enabled: true });
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(screen.getByRole('button', { name: 'Sync all now' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText('Queued 14 instructors.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Sync is off/)).not.toBeInTheDocument();
  });

  it('does nothing when the confirm is cancelled', async () => {
    const user = userEvent.setup();
    const { runBodies } = serveStatus();
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(screen.getByRole('button', { name: 'Sync all now' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(runBodies).toEqual([]);
  });

  it('shows the error when queueing fails', async () => {
    const user = userEvent.setup();
    serveStatus();
    server.use(
      http.post(`${API}/admin/shopify-sync/run`, () =>
        HttpResponse.json({ message: 'Queue unavailable' }, { status: 500 }),
      ),
    );
    renderWithProviders(<ShopifySyncPage />);
    await screen.findByTestId('sync-state');

    await user.click(screen.getByRole('button', { name: 'Sync all now' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Queue unavailable',
    );
  });
});

describe('ShopifySyncPage in Chinese', () => {
  it('renders the Chinese copy', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveStatus({ masterSwitch: false });
    renderWithProviders(<ShopifySyncPage />);

    expect(
      await screen.findByRole('heading', { name: 'Shopify 同步' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('总开关已关闭')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '立即全部同步' }),
    ).toBeInTheDocument();
  });
});
