import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { fakeCustomer, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { CustomersPage } from './CustomersPage';
import type {
  Customer,
  CustomerSyncResult,
  CustomerSyncStatus,
} from '@/lib/types';

const API = 'http://localhost:3000';

const lily = fakeCustomer();
const max = fakeCustomer({
  id: 'cu2',
  shopifyCustomerId: 7002,
  firstName: 'Max',
  lastName: 'Wong',
  email: null,
  phone: '+14165550199',
});

let requests: {
  q: string | null;
  page: string | null;
  limit: string | null;
}[] = [];

function serveSearch(
  customers: Customer[] = [lily, max],
  { slowPages = [] as number[] } = {},
) {
  const queries: (string | null)[] = [];
  requests = [];
  server.use(
    http.get(`${API}/admin/customers`, async ({ request }) => {
      const params = new URL(request.url).searchParams;
      const q = params.get('q');
      queries.push(q);
      requests.push({
        q,
        page: params.get('page'),
        limit: params.get('limit'),
      });
      const page = Number(params.get('page') ?? 1);
      const limit = Number(params.get('limit') ?? 20);
      if (slowPages.includes(page)) await delay(150);
      const needle = (q ?? '').toLowerCase();
      const matches = customers.filter((c) =>
        [c.firstName, c.lastName, c.email, c.phone]
          .join(' ')
          .toLowerCase()
          .includes(needle),
      );
      return HttpResponse.json(
        matches.slice((page - 1) * limit, page * limit),
        { headers: { 'X-Total-Count': String(matches.length) } },
      );
    }),
  );
  return queries;
}

function manyCustomers(count: number): Customer[] {
  return Array.from({ length: count }, (_, i) =>
    fakeCustomer({
      id: `cu-${i + 1}`,
      shopifyCustomerId: 10_000 + i,
      firstName: `Guest${i + 1}`,
      lastName: 'Skier',
      email: null,
      phone: null,
    }),
  );
}

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function renderPage(route = '/') {
  return renderWithProviders(
    <>
      <CustomersPage />
      <LocationProbe />
    </>,
    { route },
  );
}

const location = () => screen.getByTestId('location').textContent;

describe('CustomersPage search', () => {
  it('lists customers, then searches by the typed query', async () => {
    const queries = serveSearch();
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);

    expect(
      await screen.findByRole('heading', { name: 'Customers' }),
    ).toBeInTheDocument();
    const lilyRow = (await screen.findByText('Lily Chen')).closest(
      'tr',
    ) as HTMLElement;
    expect(within(lilyRow).getByText('lily@example.com')).toBeInTheDocument();
    expect(within(lilyRow).getByText('+16475550100')).toBeInTheDocument();
    expect(within(lilyRow).getByText('7001')).toBeInTheDocument();
    const maxRow = screen.getByText('Max Wong').closest('tr') as HTMLElement;
    expect(within(maxRow).getByText('—')).toBeInTheDocument();
    expect(queries).toEqual([null]);

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by name, email or phone' }),
      '  wong ',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(screen.queryByText('Lily Chen')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Max Wong')).toBeInTheDocument();
    expect(queries.at(-1)).toBe('wong');
  });

  it('shows an empty state with a sync hint, and a plain one for a search', async () => {
    serveSearch([]);
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    expect(await screen.findByText('No customers found.')).toBeInTheDocument();
    expect(
      screen.getByText('Sync from Shopify to load customers.'),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'zzz{Enter}');
    await waitFor(() =>
      expect(
        screen.queryByText('Sync from Shopify to load customers.'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText('No customers found.')).toBeInTheDocument();
  });

  it('shows the API error when search fails', async () => {
    server.use(
      http.get(`${API}/admin/customers`, () =>
        HttpResponse.json({ message: 'Forbidden resource' }, { status: 403 }),
      ),
    );
    renderWithProviders(<CustomersPage />);
    expect(await screen.findByText('Forbidden resource')).toBeInTheDocument();
  });
});

describe('CustomersPage paging and URL state', () => {
  it('pages 50 at a time with Prev/Next and the total, keeping the page in the URL', async () => {
    serveSearch(manyCustomers(1204), { slowPages: [2] });
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText('Showing 1–50 of 1,204'),
    ).toBeInTheDocument();
    expect(screen.getByText('Guest1 Skier')).toBeInTheDocument();
    const prev = screen.getByRole('button', { name: 'Previous' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(prev).toBeDisabled();
    expect(requests[0]).toEqual({ q: null, page: '1', limit: '50' });

    await user.click(next);
    expect(screen.getByText('Guest1 Skier')).toBeInTheDocument();
    expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(
      await screen.findByText('Showing 51–100 of 1,204'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Guest1 Skier')).not.toBeInTheDocument();
    expect(screen.getByText('Guest51 Skier')).toBeInTheDocument();
    expect(location()).toBe('?page=2');

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(
      await screen.findByText('Showing 1–50 of 1,204'),
    ).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('disables Next on the last page', async () => {
    serveSearch(manyCustomers(120));
    renderPage('/?page=3');
    expect(
      await screen.findByText('Showing 101–120 of 120'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('restores the search and page from the URL on load', async () => {
    serveSearch([...manyCustomers(60), max]);
    renderPage('/?q=skier&page=2');
    expect(await screen.findByText('Showing 51–60 of 60')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('skier');
    expect(requests).toEqual([{ q: 'skier', page: '2', limit: '50' }]);
  });

  it('searches as you type after a short pause and goes back to page 1', async () => {
    serveSearch([...manyCustomers(120), max]);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(
      await screen.findByText('Showing 51–100 of 121'),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'wong');
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Max Wong')).toBeInTheDocument();
    expect(requests.slice(1)).toEqual([{ q: 'wong', page: '1', limit: '50' }]);
    expect(location()).toBe('?q=wong');

    await user.clear(screen.getByRole('searchbox'));
    expect(await screen.findByText('Showing 1–50 of 121')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('offers Previous when a page past the end comes back empty', async () => {
    serveSearch(manyCustomers(3));
    const user = userEvent.setup();
    renderPage('/?page=4');
    expect(await screen.findByText('No customers found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Guest1 Skier')).toBeInTheDocument();
  });

  it('falls back to the rows it has when the total header is missing', async () => {
    server.use(
      http.get(`${API}/admin/customers`, () => HttpResponse.json([lily])),
    );
    renderPage();
    expect(await screen.findByText('Showing 1–1 of 1')).toBeInTheDocument();
  });

  it('shows the paging summary in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveSearch(manyCustomers(1204));
    renderPage();
    expect(
      await screen.findByText('第 1–50 位，共 1,204 位'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
  });
});

describe('CustomersPage automatic sync status', () => {
  function serveStatus(status: Partial<CustomerSyncStatus>) {
    server.use(
      http.get(`${API}/admin/customers/sync-status`, () =>
        HttpResponse.json({
          scheduled: true,
          intervalMinutes: 15,
          lastStartedAt: null,
          lastFinishedAt: null,
          lastSuccessAt: null,
          lastFetched: null,
          lastError: null,
          ...status,
        }),
      ),
    );
  }

  const minutesAgo = (n: number) =>
    new Date(Date.now() - n * 60_000 - 5_000).toISOString();

  it('shows when the last automatic sync ran and how often it runs', async () => {
    serveSearch();
    serveStatus({ lastSuccessAt: minutesAgo(3), lastFetched: 4 });
    renderPage();
    expect(
      await screen.findByText('Last synced 3 min ago · auto every 15 min'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      { lastSuccessAt: minutesAgo(0) },
      'Last synced just now · auto every 15 min',
    ],
    [
      { lastSuccessAt: minutesAgo(125) },
      'Last synced 2 h ago · auto every 15 min',
    ],
    [
      { lastSuccessAt: minutesAgo(3 * 24 * 60) },
      'Last synced 3 d ago · auto every 15 min',
    ],
    [{}, 'Not synced automatically yet · auto every 15 min'],
    [
      { scheduled: false, lastSuccessAt: minutesAgo(10) },
      'Last synced 10 min ago · automatic sync off',
    ],
  ])('renders %j as "%s"', async (status, text) => {
    serveSearch();
    serveStatus(status);
    renderPage();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows the last automatic failure', async () => {
    serveSearch();
    serveStatus({
      lastSuccessAt: minutesAgo(20),
      lastError: 'Shopify request failed',
    });
    renderPage();
    expect(
      await screen.findByText(
        'Last automatic sync failed: Shopify request failed',
      ),
    ).toBeInTheDocument();
  });

  it('renders the status in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveSearch();
    serveStatus({ lastSuccessAt: minutesAgo(3) });
    renderPage();
    expect(
      await screen.findByText('上次同步：3 分钟前 · 每 15 分钟自动同步'),
    ).toBeInTheDocument();
  });

  it('stays quiet when the status cannot be loaded', async () => {
    serveSearch();
    server.use(
      http.get(`${API}/admin/customers/sync-status`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 }),
      ),
    );
    renderPage();
    await screen.findByText('Lily Chen');
    expect(
      screen.queryByText(/Last synced|Not synced/),
    ).not.toBeInTheDocument();
  });
});

describe('CustomersPage sync', () => {
  function serveSync(
    response: CustomerSyncResult | { status: number; message: string },
  ) {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/admin/customers/sync`, async ({ request }) => {
        bodies.push(await request.json());
        return 'status' in response
          ? HttpResponse.json(
              { message: response.message },
              { status: response.status },
            )
          : HttpResponse.json(response);
      }),
    );
    return bodies;
  }

  it('shows the sync result and asks to continue when more remain', async () => {
    serveSearch();
    const bodies = serveSync({
      mode: 'backfill',
      updatedSince: null,
      pages: 50,
      fetched: 5000,
      hasMore: true,
      nextCursor: 'abc',
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);

    await user.click(
      await screen.findByRole('button', { name: 'Sync from Shopify' }),
    );
    const result = await screen.findByText('Full import');
    const banner = result.closest('[role="status"]') as HTMLElement;
    expect(banner).toHaveTextContent('Fetched 5000 customers in 50 pages.');
    expect(banner).toHaveTextContent(
      'More customers remain. Sync again to continue.',
    );
    expect(bodies).toEqual([{}]);
  });

  it('shows an incremental run without the continue note', async () => {
    serveSearch();
    serveSync({
      mode: 'incremental',
      updatedSince: '2026-10-10T00:00:00Z',
      pages: 1,
      fetched: 3,
      hasMore: false,
      nextCursor: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Sync from Shopify' }),
    );
    expect(await screen.findByText('Incremental sync')).toBeInTheDocument();
    expect(
      screen.getByText('Fetched 3 customers in 1 pages.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/More customers remain/)).not.toBeInTheDocument();
  });

  it('shows the API error when sync is switched off', async () => {
    serveSearch();
    serveSync({
      status: 503,
      message:
        'Shopify customer sync is off; set CUSTOMER_SYNC_ENABLED=true to enable it.',
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Sync from Shopify' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sync failed');
    expect(alert).toHaveTextContent(
      'Shopify customer sync is off; set CUSTOMER_SYNC_ENABLED=true to enable it.',
    );
  });
});

describe('CustomersPage create', () => {
  function serveCreate(error?: { status: number; message: string }) {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${API}/admin/customers`, async ({ request }) => {
        const body = (await request.json()) as Partial<Customer>;
        bodies.push(body);
        if (error) {
          return HttpResponse.json(
            { message: error.message },
            { status: error.status },
          );
        }
        return HttpResponse.json(
          fakeCustomer({ id: 'cu9', email: null, phone: null, ...body }),
          { status: 201 },
        );
      }),
    );
    return bodies;
  }

  function form() {
    return within(
      screen
        .getByRole('heading', { name: 'New customer' })
        .closest('form') as HTMLElement,
    );
  }

  it('creates a customer with trimmed fields and omits empty ones', async () => {
    serveSearch();
    const bodies = serveCreate();
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Lily Chen');

    const f = form();
    expect(f.getByRole('button', { name: 'Create customer' })).toBeDisabled();
    await user.type(f.getByLabelText('First name', { exact: false }), ' Ada ');
    await user.type(f.getByLabelText('Last name', { exact: false }), 'Ng');
    await user.type(f.getByLabelText('Phone'), '+16475550123');
    await user.click(f.getByRole('button', { name: 'Create customer' }));

    await waitFor(() =>
      expect(bodies).toEqual([
        { firstName: 'Ada', lastName: 'Ng', phone: '+16475550123' },
      ]),
    );
    expect(
      await f.findByText('Created Ada Ng in Shopify.'),
    ).toBeInTheDocument();
    expect(f.getByLabelText('First name', { exact: false })).toHaveValue('');
  });

  it('shows the 409 duplicate email message on the email field', async () => {
    serveSearch();
    serveCreate({
      status: 409,
      message: 'A Shopify customer with this email already exists',
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Lily Chen');

    const f = form();
    await user.type(f.getByLabelText('First name', { exact: false }), 'Lily');
    await user.type(f.getByLabelText('Last name', { exact: false }), 'Chen');
    await user.type(f.getByLabelText('Email'), 'lily@example.com');
    await user.click(f.getByRole('button', { name: 'Create customer' }));

    const alert = await f.findByRole('alert');
    expect(alert).toHaveTextContent('Could not create the customer');
    expect(alert).toHaveTextContent(
      'A Shopify customer with this email already exists.',
    );
    expect(f.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(f.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'false');

    await user.type(f.getByLabelText('Email'), 'x');
    expect(f.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the 409 duplicate phone message on the phone field', async () => {
    serveSearch();
    serveCreate({
      status: 409,
      message: 'A Shopify customer with this phone number already exists',
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Lily Chen');

    const f = form();
    await user.type(f.getByLabelText('First name', { exact: false }), 'Lily');
    await user.type(f.getByLabelText('Last name', { exact: false }), 'Chen');
    await user.type(f.getByLabelText('Phone'), '+16475550100');
    await user.click(f.getByRole('button', { name: 'Create customer' }));

    expect(await f.findByRole('alert')).toHaveTextContent(
      'A Shopify customer with this phone number already exists.',
    );
    expect(f.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows other API errors such as the flag being off', async () => {
    serveSearch();
    serveCreate({
      status: 503,
      message:
        'Shopify customer sync is off; set CUSTOMER_SYNC_ENABLED=true to enable it.',
    });
    const user = userEvent.setup();
    renderWithProviders(<CustomersPage />);
    await screen.findByText('Lily Chen');

    const f = form();
    await user.type(f.getByLabelText('First name', { exact: false }), 'A');
    await user.type(f.getByLabelText('Last name', { exact: false }), 'B');
    await user.click(f.getByRole('button', { name: 'Create customer' }));
    expect(await f.findByRole('alert')).toHaveTextContent(
      'CUSTOMER_SYNC_ENABLED=true',
    );
  });

  it('renders Chinese labels', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serveSearch();
    renderWithProviders(<CustomersPage />);
    expect(
      await screen.findByRole('heading', { name: '客户' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '从 Shopify 同步' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '新客户' })).toBeInTheDocument();
  });
});
