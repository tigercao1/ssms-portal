import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Customer } from '@/lib/types';
import { fakeCustomer, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { CustomerPicker, type PickedCustomer } from './BookingParts';

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

function Picker({ onPick }: { onPick?: (next: PickedCustomer[]) => void }) {
  const [selected, setSelected] = useState<PickedCustomer[]>([]);
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
