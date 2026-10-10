import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ShopifyInstructorPanel } from './ShopifyInstructorPanel';
import { renderWithProviders } from '@/test/render';
import {
  fakeShopifyInstructorSync,
  fakeShopifySyncStatus,
  server,
} from '@/test/msw';
import type { ShopifyInstructorSync, ShopifySyncStatus } from '@/lib/types';

const API = 'http://localhost:3000';

function serve(
  overrides: Partial<ShopifyInstructorSync> = {},
  statusOverrides: Partial<ShopifySyncStatus> = {},
) {
  let sync: ShopifyInstructorSync = {
    ...fakeShopifyInstructorSync,
    ...overrides,
  };
  const runBodies: unknown[] = [];
  const requestedIds: string[] = [];
  server.use(
    http.get(`${API}/admin/shopify-sync/instructors/:id`, ({ params }) => {
      requestedIds.push(String(params.id));
      return HttpResponse.json(sync);
    }),
    http.get(`${API}/admin/shopify-sync/status`, () =>
      HttpResponse.json({ ...fakeShopifySyncStatus, ...statusOverrides }),
    ),
    http.post(`${API}/admin/shopify-sync/run`, async ({ request }) => {
      runBodies.push(await request.json());
      sync = { ...sync, queued: true, attempts: 0 };
      return HttpResponse.json({ enqueued: 1 });
    }),
  );
  return { runBodies, requestedIds };
}

function renderPanel() {
  return renderWithProviders(<ShopifyInstructorPanel instructorId="inst-1" />);
}

describe('ShopifyInstructorPanel', () => {
  it('shows the Shopify status, handle, last sync and preview link', async () => {
    const { requestedIds } = serve();
    renderPanel();

    expect(await screen.findByText('jane-snow')).toBeInTheDocument();
    expect(requestedIds).toContain('inst-1');
    expect(screen.getByText('Status').nextSibling).toHaveTextContent('Active');
    expect(screen.getByText('Last synced').nextSibling).toHaveTextContent(
      /Oct \d+, 2026/,
    );
    expect(screen.queryByText('Last error')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open preview/ });
    expect(link).toHaveAttribute(
      'href',
      'https://ssnow.club/pages/our-team-preview/jane-snow',
    );
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows a never-synced instructor', async () => {
    serve({
      handle: null,
      metaobjectId: null,
      status: null,
      lastSyncedAt: null,
      previewUrl: null,
    });
    renderPanel();

    expect(await screen.findByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Status').nextSibling).toHaveTextContent(
      'Not synced yet',
    );
    expect(screen.getByText('Last synced').nextSibling).toHaveTextContent(
      'Never',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the last error, queue state and unknown statuses', async () => {
    serve({
      status: 'archived',
      lastError: 'Handle already taken',
      queued: true,
      attempts: 2,
    });
    renderPanel();

    expect(await screen.findByText('Handle already taken')).toBeInTheDocument();
    expect(screen.getByText('Status').nextSibling).toHaveTextContent(
      'archived',
    );
    expect(
      screen.getByText(/Queued for sync · Attempts: 2/),
    ).toBeInTheDocument();
  });

  it.each([
    ['synced', 'Synced'],
    ['draft', 'Draft'],
    ['failed', 'Failed'],
  ])('labels the %s status', async (status, label) => {
    serve({ status });
    renderPanel();

    await waitFor(() =>
      expect(screen.getByText('Status').nextSibling).toHaveTextContent(label),
    );
  });

  it('treats a 404 as not synced yet', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/shopify-sync/instructors/:id`, () =>
        HttpResponse.json({ message: 'Not Found' }, { status: 404 }),
      ),
    );
    renderPanel();

    expect(await screen.findByText('Not synced yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error when the sync state fails to load', async () => {
    serve();
    server.use(
      http.get(`${API}/admin/shopify-sync/instructors/:id`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderPanel();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong.',
    );
  });

  it('queues this instructor and notes that sync is off', async () => {
    const user = userEvent.setup();
    const { runBodies } = serve();
    renderPanel();
    await screen.findByText('jane-snow');

    await user.click(
      screen.getByRole('button', { name: 'Sync this instructor now' }),
    );

    expect(await screen.findByText('Queued for sync.')).toBeInTheDocument();
    expect(runBodies).toEqual([{ instructorId: 'inst-1' }]);
    expect(screen.getByText(/Sync is off/)).toBeInTheDocument();
    expect(await screen.findByText(/Attempts: 0/)).toBeInTheDocument();
  });

  it('omits the off note when sync is running', async () => {
    const user = userEvent.setup();
    serve({}, { enabled: true });
    renderPanel();
    await screen.findByText('jane-snow');

    await user.click(
      screen.getByRole('button', { name: 'Sync this instructor now' }),
    );

    expect(await screen.findByText('Queued for sync.')).toBeInTheDocument();
    expect(screen.queryByText(/Sync is off/)).not.toBeInTheDocument();
  });

  it('shows the error when queueing fails', async () => {
    const user = userEvent.setup();
    serve();
    server.use(
      http.post(`${API}/admin/shopify-sync/run`, () =>
        HttpResponse.json({ message: 'Instructor not found' }, { status: 404 }),
      ),
    );
    renderPanel();
    await screen.findByText('jane-snow');

    await user.click(
      screen.getByRole('button', { name: 'Sync this instructor now' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Instructor not found',
    );
  });
});
