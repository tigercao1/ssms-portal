import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Customer } from '@/lib/types';
import { customersByIds, fakeCustomer, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { CustomerPicker, type PickedCustomer } from './BookingParts';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'admin-1' } }),
}));

const API = 'http://localhost:3000';

const lily = fakeCustomer();
const lin = fakeCustomer({
  id: 'cu2',
  firstName: 'Lin',
  lastName: 'Wu',
  email: 'lin@example.com',
  phone: null,
});

function serveSearch(respond: (q: string) => Customer[] | Promise<Customer[]>) {
  const queries: string[] = [];
  server.use(
    http.get(`${API}/admin/customers`, async ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? '';
      queries.push(q);
      return HttpResponse.json(await respond(q));
    }),
  );
  return queries;
}

function deferred() {
  let resolve: (value: Customer[]) => void = () => {};
  const promise = new Promise<Customer[]>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Picker({
  onPick,
  initial = [],
}: {
  onPick?: (next: PickedCustomer[]) => void;
  initial?: PickedCustomer[];
}) {
  const [selected, setSelected] = useState<PickedCustomer[]>(initial);
  return (
    <CustomerPicker
      selected={selected}
      onChange={(next) => {
        setSelected(next);
        onPick?.(next);
      }}
    />
  );
}

describe('CustomerPicker typeahead', () => {
  it('shows Searching… until the first results, then keeps them while the next query loads', async () => {
    const pending = new Map<string, ReturnType<typeof deferred>>();
    serveSearch((q) => {
      const gate = deferred();
      pending.set(q, gate);
      return gate.promise;
    });
    const user = userEvent.setup();
    renderWithProviders(<Picker />);

    await user.type(screen.getByLabelText('Find a customer'), 'li');
    expect(await screen.findByRole('status')).toHaveTextContent('Searching…');
    await waitFor(() => expect(pending.has('li')).toBe(true));
    pending.get('li')?.resolve([lily, lin]);
    expect(
      await screen.findByRole('option', { name: /Lily Chen/ }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Find a customer'), 'l');
    await waitFor(() => expect(pending.has('lil')).toBe(true));
    expect(screen.getByRole('option', { name: /Lin Wu/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();

    pending.get('lil')?.resolve([lily]);
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: /Lin Wu/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('option', { name: /Lily Chen/ }),
    ).toBeInTheDocument();
  });

  it('says nothing matched once the latest query has answered', async () => {
    serveSearch(() => []);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'zz');
    expect(
      await screen.findByText('No customer matches. Create a new one instead.'),
    ).toBeInTheDocument();
  });

  it('debounces typing into one request', async () => {
    const queries = serveSearch(() => [lily]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'lily');
    await screen.findByRole('option', { name: /Lily Chen/ });
    expect(queries).toEqual(['lily']);
  });

  it('asks to keep typing when the first 20 results come back', async () => {
    serveSearch(() =>
      Array.from({ length: 20 }, (_, i) =>
        fakeCustomer({ id: `c${i}`, firstName: 'Lee', lastName: `No${i}` }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'lee');
    expect(
      await screen.findByText(
        'Showing the first 20 — keep typing to narrow down',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(20);
  });

  it('does not ask to keep typing for fewer than 20 results', async () => {
    serveSearch(() => [lily, lin]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');
    await screen.findByRole('option', { name: /Lily Chen/ });
    expect(screen.queryByText(/keep typing/)).not.toBeInTheDocument();
  });

  it('picks a result with the arrow keys and Enter', async () => {
    serveSearch(() => [lily, lin]);
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Picker onPick={onPick} />);
    const input = screen.getByRole('combobox', { name: 'Find a customer' });
    await user.type(input, 'li');
    const list = await screen.findByRole('listbox', {
      name: 'Matching customers',
    });
    expect(input).toHaveAttribute('aria-expanded', 'true');

    await user.keyboard('{ArrowDown}');
    expect(
      within(list).getByRole('option', { name: /Lily Chen/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(
      within(list).getByRole('option', { name: /Lily Chen/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}');
    const linOption = within(list).getByRole('option', { name: /Lin Wu/ });
    expect(linOption).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', linOption.id);

    await user.keyboard('{Enter}');
    expect(onPick).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'cu2' }),
    ]);
    expect(input).toHaveValue('');
    expect(
      within(
        screen.getByRole('list', { name: 'Selected customers' }),
      ).getByText('Lin Wu'),
    ).toBeInTheDocument();
  });

  it('closes the results with Escape, reopens on typing, and clears on a second Escape', async () => {
    serveSearch(() => [lily, lin]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    const input = screen.getByRole('combobox', { name: 'Find a customer' });
    await user.type(input, 'li');
    await screen.findByRole('listbox', { name: 'Matching customers' });

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('listbox', { name: 'Matching customers' }),
    ).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('li');

    await user.type(input, 'l');
    await user.keyboard('{Backspace}');
    await screen.findByRole('listbox', { name: 'Matching customers' });

    await user.keyboard('{Escape}{Escape}');
    expect(input).toHaveValue('');
  });

  it('starts from the last result with ArrowUp and ignores Enter with nothing highlighted', async () => {
    serveSearch(() => [lily, lin]);
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Picker onPick={onPick} />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');
    await screen.findByRole('option', { name: /Lily Chen/ });
    await user.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('option', { name: /Lin Wu/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows an error when the search fails', async () => {
    server.use(
      http.get(`${API}/admin/customers`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('CustomerPicker waiver status', () => {
  const signed = fakeCustomer({
    waiver: {
      status: 'signed',
      signedAt: '2026-11-08T03:30:00Z',
      year: '2026/27',
    },
  });
  const expired = fakeCustomer({
    id: 'cu2',
    firstName: 'Lin',
    lastName: 'Wu',
    email: 'lin@example.com',
    waiver: {
      status: 'expired',
      signedAt: '2026-01-10T15:00:00Z',
      year: '2026/27',
    },
  });
  const none = fakeCustomer({
    id: 'cu3',
    firstName: 'Lia',
    lastName: 'Park',
    email: 'lia@example.com',
    waiver: { status: 'none', signedAt: null, year: '2026/27' },
  });

  it('shows each match’s waiver status for this waiver year', async () => {
    serveSearch(() => [signed, expired, none]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');

    expect(
      await screen.findByRole('option', { name: /Lily Chen/ }),
    ).toHaveTextContent('Waiver signed Nov 7, 2026');
    expect(screen.getByRole('option', { name: /Lin Wu/ })).toHaveTextContent(
      'Signed last year (Jan 10, 2026), needs re-sign',
    );
    expect(screen.getByRole('option', { name: /Lia Park/ })).toHaveTextContent(
      'No waiver on file',
    );
  });

  it('keeps the badge on a picked customer and adds no note when they signed this year', async () => {
    serveSearch(() => [signed]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');
    await user.click(await screen.findByRole('option', { name: /Lily Chen/ }));

    expect(
      within(
        screen.getByRole('list', { name: 'Selected customers' }),
      ).getByText('Waiver signed Nov 7, 2026'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No signed waiver/)).not.toBeInTheDocument();
  });

  it('still lets the admin pick customers without a waiver this year and names them in a note', async () => {
    serveSearch(() => [signed, expired, none]);
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Picker onPick={onPick} />);
    const input = screen.getByLabelText('Find a customer');
    await user.type(input, 'li');
    await user.click(await screen.findByRole('option', { name: /Lin Wu/ }));
    await user.type(input, 'li');
    await user.click(await screen.findByRole('option', { name: /Lia Park/ }));

    expect(onPick).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'cu2' }),
      expect.objectContaining({ id: 'cu3' }),
    ]);
    const selected = screen.getByRole('list', { name: 'Selected customers' });
    expect(
      within(selected).getByText(
        'Signed last year (Jan 10, 2026), needs re-sign',
      ),
    ).toBeInTheDocument();
    expect(within(selected).getByText('No waiver on file')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No signed waiver for 2026/27: Lin Wu, Lia Park. You can still book.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the waiver status and note in Chinese', async () => {
    serveSearch(() => [none]);
    const user = userEvent.setup();
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<Picker />);
    await user.type(screen.getByRole('combobox'), 'li');
    const option = await screen.findByRole('option', { name: /Lia/ });
    expect(option).toHaveTextContent('没有免责声明记录');
    await user.click(option);
    expect(
      screen.getByText(
        '以下客户没有 2026/27 年度已签署的免责声明：Lia Park。仍可预约。',
      ),
    ).toBeInTheDocument();
  });

  it('shows no badge or note when the API sends no waiver status', async () => {
    serveSearch(() => [lily]);
    const user = userEvent.setup();
    renderWithProviders(<Picker />);
    await user.type(screen.getByLabelText('Find a customer'), 'li');
    await user.click(await screen.findByRole('option', { name: /Lily Chen/ }));
    expect(screen.queryByText(/waiver/i)).not.toBeInTheDocument();
  });
});

describe('CustomerPicker waiver lookup by id', () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const withWaiver = (c: Customer): Customer => ({
    ...c,
    waiver: { status: 'none', signedAt: null, year: '2026/27' },
  });

  function serveCustomers(stored: Customer[], search: Customer[] = []) {
    const lookups: string[][] = [];
    server.use(
      http.get(`${API}/admin/customers`, ({ request }) => {
        const ids = new URL(request.url).searchParams.get('ids');
        if (ids === null) return HttpResponse.json(search);
        lookups.push(ids.split(','));
        return customersByIds(stored, ids);
      }),
    );
    return lookups;
  }

  it('looks up 51 picked customers in two requests of at most 50 ids', async () => {
    const picked = Array.from({ length: 51 }, (_, i) =>
      fakeCustomer({ id: uuid(i), firstName: `Kid${i}`, email: null }),
    );
    const lookups = serveCustomers(picked.map(withWaiver));
    renderWithProviders(<Picker initial={picked} />);

    await waitFor(() =>
      expect(screen.getAllByText('No waiver on file')).toHaveLength(51),
    );
    expect(lookups.map((ids) => ids.length)).toEqual([50, 1]);
    expect(lookups.flat()).toEqual(picked.map((c) => c.id));
  });

  it('looks up only the newly picked customer and never repeats a lookup that found nothing', async () => {
    const known = fakeCustomer({ id: uuid(1), email: null, phone: null });
    const missing = fakeCustomer({
      id: uuid(2),
      firstName: 'Gone',
      lastName: 'Away',
      email: null,
      phone: null,
    });
    const added = fakeCustomer({
      id: uuid(3),
      firstName: 'Lin',
      lastName: 'Wu',
      email: 'lin@example.com',
    });
    const lookups = serveCustomers(
      [withWaiver(known), withWaiver(added)],
      [added],
    );
    const user = userEvent.setup();
    renderWithProviders(<Picker initial={[known, missing]} />);

    expect(await screen.findByText('No waiver on file')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Find a customer'), 'lin');
    await user.click(await screen.findByRole('option', { name: /Lin Wu/ }));

    await waitFor(() =>
      expect(screen.getAllByText('No waiver on file')).toHaveLength(2),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lookups).toEqual([[known.id, missing.id], [added.id]]);
  });

  it('makes no lookup when every picked customer already has a waiver status', async () => {
    const lookups = serveCustomers([]);
    renderWithProviders(<Picker initial={[withWaiver(lily)]} />);

    expect(await screen.findByText('No waiver on file')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lookups).toEqual([]);
  });
});
