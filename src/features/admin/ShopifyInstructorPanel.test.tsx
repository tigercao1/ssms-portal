import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ShopifyInstructorPanel } from './ShopifyInstructorPanel';
import { renderWithProviders } from '@/test/render';
import {
  fakeGoLive,
  fakeShopifyInstructorSync,
  fakeShopifySyncStatus,
  server,
} from '@/test/msw';
import type {
  GoLiveReadiness,
  ShopifyInstructorSync,
  ShopifySyncStatus,
} from '@/lib/types';

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
      return HttpResponse.json({ enqueued: 1, processing: true });
    }),
  );
  return { runBodies, requestedIds };
}

function renderPanel() {
  return renderWithProviders(
    <ShopifyInstructorPanel instructorId="inst-1" publishedAt={null} />,
  );
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

  it('renders the last error and queue state', async () => {
    serve({
      status: 'draft',
      lastError: 'Handle already taken',
      queued: true,
      attempts: 2,
    });
    renderPanel();

    expect(await screen.findByText('Handle already taken')).toBeInTheDocument();
    expect(screen.getByText('Status').nextSibling).toHaveTextContent(
      'Draft',
    );
    expect(
      screen.getByText(/Queued for sync · Attempts: 2/),
    ).toBeInTheDocument();
  });

  it.each([
    ['active', 'Active'],
    ['draft', 'Draft'],
  ] as const)('labels the %s status', async (status, label) => {
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

describe('ShopifyInstructorPanel go-live check', () => {
  function serveGoLive(goLive: Partial<GoLiveReadiness> = {}) {
    const ids: string[] = [];
    server.use(
      http.get(`${API}/admin/instructors/:id/go-live`, ({ params }) => {
        ids.push(String(params.id));
        return HttpResponse.json({ ...fakeGoLive, ...goLive });
      }),
    );
    return ids;
  }

  it('counts and lists what is missing', async () => {
    serve();
    const ids = serveGoLive();
    renderPanel();
    expect(await screen.findByText('Go-live check')).toBeInTheDocument();
    expect(screen.getByText('3 missing')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: '3 missing' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Main photo',
      'No verified certification yet',
      'Independent contractor agreement',
    ]);
    expect(ids).toEqual(['inst-1']);
  });

  it('lists the missing admin review last as "Not published yet"', async () => {
    serve();
    serveGoLive({ missing: [...fakeGoLive.missing, { group: 'review' }] });
    renderPanel();
    const list = await screen.findByRole('list', { name: '4 missing' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Main photo',
      'No verified certification yet',
      'Independent contractor agreement',
      'Not published yet',
    ]);
  });

  it('lists the missing admin review in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    serveGoLive({ missing: [{ group: 'review' }] });
    renderPanel();
    expect(await screen.findByText('缺少 1 项')).toBeInTheDocument();
    expect(screen.getByText('尚未发布')).toBeInTheDocument();
  });

  it('says Ready when nothing is missing', async () => {
    serve();
    serveGoLive({ ready: true, missing: [] });
    renderPanel();
    expect(await screen.findByText('Go-live check')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText(/missing/)).not.toBeInTheDocument();
  });

  it('explains that a pending or deactivated instructor cannot go live', async () => {
    serve();
    serveGoLive({ ready: false, missing: [] });
    renderPanel();
    expect(
      await screen.findByText('Not approved or deactivated'),
    ).toBeInTheDocument();
  });

  it('shows the check for an instructor never synced to Shopify', async () => {
    server.use(
      http.get(`${API}/admin/shopify-sync/instructors/:id`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );
    serveGoLive();
    renderPanel();
    expect(await screen.findByText('3 missing')).toBeInTheDocument();
    expect(screen.getByText('Not synced yet')).toBeInTheDocument();
  });

  it('shows the check in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve();
    serveGoLive();
    renderPanel();
    expect(await screen.findByText('上线检查')).toBeInTheDocument();
    expect(screen.getByText('缺少 3 项')).toBeInTheDocument();
    expect(screen.getByText('主照片')).toBeInTheDocument();
    expect(screen.getByText('独立承包人协议')).toBeInTheDocument();
  });
});
