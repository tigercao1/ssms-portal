import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeCustomer, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { CustomersPage } from './CustomersPage';
import type { Customer, CustomerSyncResult } from '@/lib/types';

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

function serveSearch(customers: Customer[] = [lily, max]) {
  const queries: (string | null)[] = [];
  server.use(
    http.get(`${API}/admin/customers`, ({ request }) => {
      const q = new URL(request.url).searchParams.get('q');
      queries.push(q);
      const needle = (q ?? '').toLowerCase();
      return HttpResponse.json(
        customers.filter((c) =>
          [c.firstName, c.lastName, c.email, c.phone]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        ),
      );
    }),
  );
  return queries;
}

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
