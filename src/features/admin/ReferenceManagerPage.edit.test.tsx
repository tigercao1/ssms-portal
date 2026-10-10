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

function addRowShown() {
  return screen.queryByRole('heading', { name: 'Add row' }) !== null;
}

describe('ReferenceManagerPage edit panel', () => {
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it('loads the row into the panel, highlights it and focuses the Chinese name', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');

    expect(
      screen.getByRole('heading', { name: 'Edit row' }),
    ).toBeInTheDocument();
    expect(addRowShown()).toBe(false);
    expect(screen.getByText('Editing Whistler')).toBeInTheDocument();
    expect(screen.getByText('Key: loc.whistler')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Whistler');
    expect(screen.getByLabelText('Chinese name')).toHaveValue('惠斯勒');
    expect(screen.getByLabelText('Chinese name')).toHaveFocus();
    expect(screen.getByLabelText('Sort order')).toHaveValue(0);
    expect(screen.getByRole('switch', { name: 'Active' })).toBeChecked();
    expect(
      screen.getByText(/Editing this text replaces the machine translation/),
    ).toBeInTheDocument();
    expect(rowFor('Whistler')).toHaveAttribute('aria-current', 'true');
    expect(rowFor('Cypress')).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
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

  it('saves only the changed fields and returns to Add row', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    const nameZh = screen.getByLabelText('Chinese name');
    await user.clear(nameZh);
    await user.type(nameZh, '威斯勒');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r1', nameZh: '威斯勒' }]),
    );
    await waitFor(() => expect(addRowShown()).toBe(true));
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
    await user.clear(screen.getByLabelText('Chinese name'));
    const sort = screen.getByLabelText('Sort order');
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
    expect(screen.getByRole('switch', { name: 'Active' })).not.toBeChecked();
    await user.click(screen.getByRole('switch', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r2', isActive: true }]),
    );
    expect(
      await within(rowFor('Cypress')).findByText('Active'),
    ).toBeInTheDocument();
  });

  it('Cancel and Escape restore Add row without saving', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.type(screen.getByLabelText('Name'), ' Resort');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addRowShown()).toBe(true);
    expect(rowFor('Whistler')).not.toHaveAttribute('aria-current');

    await startEditing(user, 'Whistler');
    expect(screen.getByLabelText('Name')).toHaveValue('Whistler');
    await user.keyboard('{Escape}');
    expect(addRowShown()).toBe(true);
    expect(api.patches).toHaveLength(0);
  });

  it('switching tabs returns the card to Add row', async () => {
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.click(screen.getByRole('button', { name: 'Languages' }));
    expect(addRowShown()).toBe(true);
  });

  it('switches to another row when Edit is clicked while editing', async () => {
    serve([whistler, cypress]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.type(screen.getByLabelText('Chinese name'), '!');
    await startEditing(user, 'Cypress');

    expect(screen.getByText('Editing Cypress')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Cypress');
    expect(screen.getByLabelText('Chinese name')).toHaveValue('');
    expect(screen.getByLabelText('Chinese name')).toHaveFocus();
    expect(rowFor('Cypress')).toHaveAttribute('aria-current', 'true');
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
    await user.type(screen.getByLabelText('Chinese name'), '村');
    await user.click(screen.getByRole('button', { name: 'Save' }));

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
    await user.click(screen.getByRole('switch', { name: 'Active' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/English name required/)).not.toBeInTheDocument();
  });

  it('does not save an empty English name', async () => {
    serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await startEditing(user, 'Whistler');
    await user.clear(screen.getByLabelText('Name'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('returns to Add row when the edited row is removed', async () => {
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

    await waitFor(() => expect(addRowShown()).toBe(true));
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
