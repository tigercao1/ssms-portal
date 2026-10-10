import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { ReferenceManagerPage } from './ReferenceManagerPage';
import type { ReferenceRecord } from '@/lib/types';

const API = 'http://localhost:3000';
const BASE = `${API}/admin/reference/teaching-locations`;

function serve(initial: ReferenceRecord[]) {
  let rows = initial;
  const posts: unknown[] = [];
  const patches: unknown[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json(rows)),
    http.patch(`${BASE}/:id`, async ({ request, params }) => {
      const body = (await request.json()) as Partial<ReferenceRecord>;
      patches.push({ id: params.id, ...body });
      rows = rows.map((r) =>
        r.id === params.id ? { ...r, ...body, nameZhTranslatedBy: null } : r,
      );
      return HttpResponse.json(rows.find((r) => r.id === params.id));
    }),
  );
  return {
    posts,
    patches,
    onPost(respond: (body: Record<string, unknown>) => Response) {
      server.use(
        http.post(BASE, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          posts.push(body);
          return respond(body);
        }),
      );
    },
  };
}

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

function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('ReferenceManagerPage Chinese names', () => {
  it('shows each row’s Chinese name with the model badge when machine-translated', async () => {
    serve([
      whistler,
      {
        id: 'r2',
        key: 'loc.cypress',
        name: 'Cypress',
        nameZh: '赛普拉斯',
        nameEnTranslatedBy: null,
        nameZhTranslatedBy: null,
        sortOrder: 1,
        isActive: true,
      },
      {
        id: 'r3',
        key: 'loc.beimen',
        name: 'North Gate',
        nameZh: '北门',
        nameEnTranslatedBy: 'gemini-2.5-flash',
        nameZhTranslatedBy: null,
        sortOrder: 2,
        isActive: true,
      },
    ]);
    renderWithProviders(<ReferenceManagerPage />);

    expect(await screen.findByText('惠斯勒')).toBeInTheDocument();
    expect(
      within(rowFor('Whistler')).getByText('Translated by gemini-2.5-flash'),
    ).toBeInTheDocument();
    expect(
      within(rowFor('Cypress')).queryByText(/Translated by/),
    ).not.toBeInTheDocument();
    expect(
      within(rowFor('North Gate')).getByText('Translated by gemini-2.5-flash'),
    ).toBeInTheDocument();
  });

  it('edits a row’s Chinese name and drops the badge once saved', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Edit Chinese name for Whistler',
      }),
    );
    const input = screen.getByRole('textbox', {
      name: 'Edit Chinese name for Whistler',
    });
    await user.clear(input);
    await user.type(input, '威斯勒');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r1', nameZh: '威斯勒' }]),
    );
    expect(await screen.findByText('威斯勒')).toBeInTheDocument();
    expect(screen.queryByText(/Translated by/)).not.toBeInTheDocument();
  });

  it('clears a Chinese name with null and can cancel an edit', async () => {
    const api = serve([whistler]);
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);
    const edit = await screen.findByRole('button', {
      name: 'Edit Chinese name for Whistler',
    });

    await user.click(edit);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('惠斯勒')).toBeInTheDocument();
    expect(api.patches).toHaveLength(0);

    await user.click(
      screen.getByRole('button', { name: 'Edit Chinese name for Whistler' }),
    );
    await user.clear(
      screen.getByRole('textbox', { name: 'Edit Chinese name for Whistler' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.patches).toEqual([{ id: 'r1', nameZh: null }]),
    );
  });

  it('shows the English-name-required message when a row update returns 422', async () => {
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
    await user.click(
      await screen.findByRole('button', {
        name: 'Edit Chinese name for Whistler',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        /English name required \(translation unavailable\)/,
      ),
    ).toBeInTheDocument();
  });

  it('adds a row with only a Chinese name', async () => {
    const api = serve([]);
    api.onPost((body) =>
      HttpResponse.json(
        {
          ...whistler,
          id: 'r9',
          key: body.key,
          nameEnTranslatedBy: 'gemini-2.5-flash',
        },
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);

    const add = screen.getByRole('button', { name: 'Add' });
    await user.type(screen.getByLabelText(/^Key/), 'loc.beimen');
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Chinese name'), ' 北门 ');
    expect(add).toBeEnabled();
    await user.click(add);

    await waitFor(() =>
      expect(api.posts).toEqual([
        { key: 'loc.beimen', nameZh: '北门', sortOrder: 0, isActive: true },
      ]),
    );
    expect(await screen.findByText('Row added.')).toBeInTheDocument();
    expect(screen.getByLabelText('Chinese name')).toHaveValue('');
  });

  it('sends both names when both are entered', async () => {
    const api = serve([]);
    api.onPost(() => HttpResponse.json(whistler, { status: 201 }));
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);
    await user.type(screen.getByLabelText(/^Key/), 'loc.whistler');
    await user.type(screen.getByLabelText(/^Name/), 'Whistler');
    await user.type(screen.getByLabelText('Chinese name'), '惠斯勒');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(api.posts).toEqual([
        {
          key: 'loc.whistler',
          name: 'Whistler',
          nameZh: '惠斯勒',
          sortOrder: 0,
          isActive: true,
        },
      ]),
    );
  });

  it('asks for the English name when translation is unavailable (422)', async () => {
    const api = serve([]);
    api.onPost(() =>
      HttpResponse.json(
        { message: 'English name required (translation unavailable)' },
        { status: 422 },
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<ReferenceManagerPage />);
    await user.type(screen.getByLabelText(/^Key/), 'loc.beimen');
    await user.type(screen.getByLabelText('Chinese name'), '北门');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const nameInput = screen.getByLabelText(/^Name/);
    await waitFor(() =>
      expect(nameInput).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(nameInput).toHaveAccessibleDescription(
      /English name required \(translation unavailable\)/,
    );
    expect(screen.getByLabelText('Chinese name')).toHaveValue('北门');
  });

  it('shows the Chinese labels in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    serve([whistler]);
    renderWithProviders(<ReferenceManagerPage />);
    expect(
      await screen.findByText('由 gemini-2.5-flash 翻译'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('中文名称').length).toBeGreaterThan(0);
  });
});
