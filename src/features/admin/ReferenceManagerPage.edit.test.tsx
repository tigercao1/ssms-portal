import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ReferenceManagerPage } from './ReferenceManagerPage';
import type { ReferenceRecord } from '@/lib/types';

const API = 'http://localhost:3000';
const BASE = `${API}/admin/reference/teaching-locations`;

const whistler: ReferenceRecord = {
  id: 'r1',
  key: 'loc.whistler',
  name: 'Whistler',
  nameZh: '惠斯勒',
  nameEnTranslatedBy: null,
  nameZhTranslatedBy: 'gemini-2.5-flash',
  sortOrder: 0,
  isActive: true,
};

const cypress: ReferenceRecord = {
  id: 'r2',
  key: 'loc.cypress',
  name: 'Cypress',
  nameZh: null,
  nameEnTranslatedBy: null,
  nameZhTranslatedBy: null,
  sortOrder: 1,
  isActive: false,
};

function serve(initial: ReferenceRecord[]) {
  let rows = initial;
  const patches: unknown[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json(rows)),
    http.get(`${API}/admin/reference/languages`, () => HttpResponse.json([])),
    http.patch(`${BASE}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<ReferenceRecord>;
      patches.push({ id: params.id, ...body });
      rows = rows.map((r) =>
        r.id === params.id ? { ...r, ...body, nameZhTranslatedBy: null } : r,
      );
      return HttpResponse.json(rows.find((r) => r.id === params.id));
    }),
  );
  return { patches };
}

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

async function startEditing(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(await screen.findByRole('button', { name: `Edit ${name}` }));
}

function panel() {
  return screen
    .getByRole('heading', { name: 'Edit row' })
    .closest('tr') as HTMLElement;
}

function editShown() {
  return screen.queryByRole('heading', { name: 'Edit row' }) !== null;
}

describe('ReferenceManagerPage edit panel', () => {
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('expands the edit form beneath the row, highlights it and focuses the Chinese name', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');

    expect(
      screen.getByRole('heading', { name: 'Edit row' }),
    ).toBeInTheDocument();
    expect(rowFor('Whistler').nextElementSibling).toBe(panel());
    expect(screen.getAllByRole('heading', { name: 'Edit row' })).toHaveLength(
      1,
    );
    expect(
      screen.getByRole('heading', { name: 'Add row' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Editing Whistler')).toBeInTheDocument();
    expect(screen.getByText('Key: loc.whistler')).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Name')).toHaveValue('Whistler');
    expect(within(panel()).getByLabelText('Chinese name')).toHaveValue(
      '惠斯勒',
    );
    expect(within(panel()).getByLabelText('Chinese name')).toHaveFocus();
    expect(within(panel()).getByLabelText('Sort order')).toHaveValue(0);
    expect(
      within(panel()).getByRole('switch', { name: 'Active' }),
    ).toBeChecked();
    expect(
      screen.getByText(/Editing this text replaces the machine translation/),
    ).toBeInTheDocument();
    expect(rowFor('Whistler')).toHaveAttribute('aria-current', 'true');
    expect(rowFor('Cypress')).not.toHaveAttribute('aria-current');
    expect(
      within(panel()).getByRole('button', { name: 'Save' }),
    ).toBeDisabled();
  });

  it('scrolls the panel into view smoothly', async () => {
    serve([whistler]);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');

    expect(scroll).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    });
  });

  it('saves only the changed fields and closes the edit row', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    const nameZh = within(panel()).getByLabelText('Chinese name');
    await user.clear(nameZh);
    await user.type(nameZh, '威斯勒');
    await user.click(within(panel()).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r1', nameZh: '威斯勒' }]),
    );
    await waitFor(() => expect(editShown()).toBe(false));
    expect(
      await within(rowFor('Whistler')).findByText('威斯勒'),
    ).toBeInTheDocument();
    expect(rowFor('Whistler')).not.toHaveAttribute('aria-current');
  });

  it('saves with Enter, clearing the Chinese name with null and sending sort order', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.clear(within(panel()).getByLabelText('Chinese name'));
    const sort = within(panel()).getByLabelText('Sort order');
    await user.clear(sort);
    await user.type(sort, '5{Enter}');

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r1', nameZh: null, sortOrder: 5 }]),
    );
  });

  it('sends isActive from the toggle', async () => {
    const api = serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Cypress');
    expect(
      within(panel()).getByRole('switch', { name: 'Active' }),
    ).not.toBeChecked();
    await user.click(within(panel()).getByRole('switch', { name: 'Active' }));
    await user.click(within(panel()).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r2', isActive: true }]),
    );
    expect(
      await within(rowFor('Cypress')).findByText('Active'),
    ).toBeInTheDocument();
  });

  it('Cancel and Escape close the edit row without saving', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.type(within(panel()).getByLabelText('Name'), ' Resort');
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(editShown()).toBe(false);
    expect(rowFor('Whistler')).not.toHaveAttribute('aria-current');

    await startEditing(user, 'Whistler');
    expect(within(panel()).getByLabelText('Name')).toHaveValue('Whistler');
    await user.keyboard('{Escape}');
    expect(editShown()).toBe(false);
    expect(api.patches).toHaveLength(0);
  });

  it('wires the Edit button to the panel with aria-expanded and aria-controls', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    const edit = await screen.findByRole('button', { name: 'Edit Whistler' });
    const other = screen.getByRole('button', { name: 'Edit Cypress' });
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(edit).toHaveAttribute('aria-controls', 'ref-edit-r1');
    expect(other).toHaveAttribute('aria-controls', 'ref-edit-r2');

    await user.click(edit);
    expect(edit).toHaveAttribute('aria-expanded', 'true');
    expect(other).toHaveAttribute('aria-expanded', 'false');
    expect(panel()).toHaveAttribute('id', 'ref-edit-r1');

    await user.click(other);
    expect(edit).toHaveAttribute('aria-expanded', 'false');
    expect(other).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).toHaveAttribute('id', 'ref-edit-r2');

    await user.keyboard('{Escape}');
    expect(other).toHaveAttribute('aria-expanded', 'false');
  });

  it('returns focus to the row Edit button after Cancel, Escape and Save', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);
    const editButton = (name: string) =>
      screen.getByRole('button', { name: `Edit ${name}` });

    await startEditing(user, 'Cypress');
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(editButton('Cypress')).toHaveFocus();

    await startEditing(user, 'Whistler');
    await user.keyboard('{Escape}');
    expect(editButton('Whistler')).toHaveFocus();

    await startEditing(user, 'Whistler');
    await user.type(within(panel()).getByLabelText('Chinese name'), '!');
    await user.click(within(panel()).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(editShown()).toBe(false));
    expect(editButton('Whistler')).toHaveFocus();
  });

  it('shows translation badges on a contrasting background in the selected row', async () => {
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await screen.findByText('Whistler');
    const badge = within(rowFor('Whistler')).getByText(/gemini-2\.5-flash/);
    expect(badge).toHaveClass('bg-navy-tint');

    await startEditing(user, 'Whistler');
    const selectedBadge = within(rowFor('Whistler')).getByText(
      /gemini-2\.5-flash/,
    );
    expect(selectedBadge).toHaveClass('bg-surface');
    expect(selectedBadge).not.toHaveClass('bg-navy-tint');
  });

  it('switching tabs closes the edit row', async () => {
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.click(screen.getByRole('button', { name: 'Languages' }));
    expect(editShown()).toBe(false);
  });

  it('switches to another row when Edit is clicked while editing', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.type(within(panel()).getByLabelText('Chinese name'), '!');
    await startEditing(user, 'Cypress');

    expect(screen.getByText('Editing Cypress')).toBeInTheDocument();
    expect(within(panel()).getByLabelText('Name')).toHaveValue('Cypress');
    expect(within(panel()).getByLabelText('Chinese name')).toHaveValue('');
    expect(within(panel()).getByLabelText('Chinese name')).toHaveFocus();
    expect(rowFor('Cypress')).toHaveAttribute('aria-current', 'true');
    expect(rowFor('Cypress').nextElementSibling).toBe(panel());
    expect(screen.getAllByRole('heading', { name: 'Edit row' })).toHaveLength(
      1,
    );
    expect(rowFor('Whistler')).not.toHaveAttribute('aria-current');
  });

  it('shows the English-name-required message on 422', async () => {
    serve([whistler]);
    server.use(
      http.patch(`${BASE}/:id`, () =>
        HttpResponse.json(
          { message: 'English name required (translation unavailable)' },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.type(within(panel()).getByLabelText('Chinese name'), '村');
    await user.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        /English name required \(translation unavailable\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Edit row' }),
    ).toBeInTheDocument();
  });

  it('shows a generic error for other failures', async () => {
    serve([whistler]);
    server.use(
      http.patch(`${BASE}/:id`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.click(within(panel()).getByRole('switch', { name: 'Active' }));
    await user.click(within(panel()).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/English name required/)).not.toBeInTheDocument();
  });

  it('does not save an empty English name', async () => {
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.clear(within(panel()).getByLabelText('Name'));
    expect(
      within(panel()).getByRole('button', { name: 'Save' }),
    ).toBeDisabled();
  });

  it('closes the edit row when that row is removed', async () => {
    serve([whistler]);
    server.use(
      http.get(`${BASE}/r1/usage`, () =>
        HttpResponse.json({ instructorCount: 0 }),
      ),
      http.delete(`${BASE}/r1`, () =>
        HttpResponse.json({ ...whistler, removedLinkCount: 0 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.click(
      within(rowFor('Whistler')).getByRole('button', { name: 'Remove' }),
    );
    const confirm = within(screen.getByRole('alertdialog')).getByRole(
      'button',
      {
        name: 'Remove permanently',
      },
    );
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);

    await waitFor(() => expect(editShown()).toBe(false));
  });

  it('shows Chinese wording for the edit panel', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await user.click(
      await screen.findByRole('button', { name: '编辑 Whistler' }),
    );
    expect(
      screen.getByRole('heading', { name: '编辑条目' }),
    ).toBeInTheDocument();
    expect(screen.getByText('正在编辑 Whistler')).toBeInTheDocument();
  });
});
