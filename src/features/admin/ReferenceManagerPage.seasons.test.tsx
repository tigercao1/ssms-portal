import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeSeasons, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminSeason } from '@/features/reference/api';
import { ReferenceManagerPage } from './ReferenceManagerPage';

const API = 'http://localhost:3000';

let seasons: AdminSeason[];
let requests: { method: string; path: string; body?: unknown }[];
let inUse: Set<string>;

beforeEach(() => {
  inUse = new Set(['2026/27']);
  seasons = fakeSeasons.map((s) => ({ ...s, inUse: inUse.has(s.key) }));
  requests = [];
  server.use(
    http.get(`${API}/admin/reference/seasons`, () =>
      HttpResponse.json(seasons),
    ),
    http.post(`${API}/admin/reference/seasons`, async ({ request }) => {
      const body = (await request.json()) as Omit<
        AdminSeason,
        'isCurrent' | 'inUse'
      >;
      requests.push({ method: 'POST', path: '/', body });
      if (seasons.some((s) => s.key === body.key))
        return HttpResponse.json({ message: 'Season exists' }, { status: 409 });
      const created = { ...body, isCurrent: false, inUse: false };
      seasons = [created, ...seasons];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.patch(
      `${API}/admin/reference/seasons/:key`,
      async ({ request, params }) => {
        const key = String(params.key);
        const body = (await request.json()) as Partial<AdminSeason>;
        requests.push({
          method: 'PATCH',
          path: new URL(request.url).pathname,
          body,
        });
        seasons = seasons.map((s) => (s.key === key ? { ...s, ...body } : s));
        return HttpResponse.json(seasons.find((s) => s.key === key));
      },
    ),
    http.delete(
      `${API}/admin/reference/seasons/:key`,
      ({ request, params }) => {
        const key = String(params.key);
        requests.push({
          method: 'DELETE',
          path: new URL(request.url).pathname,
        });
        if (inUse.has(key))
          return HttpResponse.json(
            { message: 'Season in use' },
            { status: 409 },
          );
        const deleted = seasons.find((s) => s.key === key);
        seasons = seasons.filter((s) => s.key !== key);
        return HttpResponse.json(deleted);
      },
    ),
  );
});

async function openSeasons(locale: 'en' | 'zh-CN' = 'en') {
  if (locale === 'zh-CN') localStorage.setItem('ssms.locale', 'zh-CN');
  const user = userEvent.setup();
  renderWithProviders(<ReferenceManagerPage />);
  await user.click(
    screen.getByRole('button', { name: locale === 'en' ? 'Seasons' : '雪季' }),
  );
  return user;
}

function seasonRow(key: string) {
  return screen.getByRole('cell', { name: key }).closest('tr') as HTMLElement;
}

async function seasonAction(
  user: ReturnType<typeof userEvent.setup>,
  key: string,
  name: string,
) {
  await user.click(
    screen.getByRole('button', { name: `More actions for ${key}` }),
  );
  await user.click(screen.getByRole('menuitem', { name }));
}

describe('ReferenceManagerPage seasons', () => {
  it('lists seasons newest first with dates and the current one marked', async () => {
    await openSeasons();
    const table = await screen.findByRole('table', { name: 'Seasons' });
    const rows = within(table).getAllByRole('row');
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Season', 'First day', 'Last day', 'Status', 'Actions']);
    expect(rows[1]).toHaveTextContent('2027/28Nov 1, 2027Apr 30, 2028');
    expect(rows[2]).toHaveTextContent('2026/27Nov 1, 2026Apr 30, 2027Current');
    expect(rows[3]).not.toHaveTextContent('Current');
  });

  it('adds a season, prefilling Nov 1 to Apr 30 from the key', async () => {
    const user = await openSeasons();
    await screen.findByRole('table', { name: 'Seasons' });
    const key = screen.getByRole('textbox', { name: /^Season/ });
    await user.type(key, '2028');
    expect(screen.getByText('Use the form 2027/28.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(key, '/29');
    expect(screen.getByLabelText(/First day/)).toHaveValue('2028-11-01');
    expect(screen.getByLabelText(/Last day/)).toHaveValue('2029-04-30');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Season added.')).toBeInTheDocument();
    expect(requests).toEqual([
      {
        method: 'POST',
        path: '/',
        body: { key: '2028/29', startsOn: '2028-11-01', endsOn: '2029-04-30' },
      },
    ]);
    expect(
      await screen.findByRole('cell', { name: '2028/29' }),
    ).toBeInTheDocument();
    expect(key).toHaveValue('');
  });

  it('rejects an end before the start and shows a duplicate as a conflict', async () => {
    const user = await openSeasons();
    await screen.findByRole('table', { name: 'Seasons' });
    await user.type(
      screen.getByRole('textbox', { name: /^Season/ }),
      '2027/28',
    );
    const ends = screen.getByLabelText(/Last day/);
    await user.clear(ends);
    await user.type(ends, '2027-10-01');
    expect(
      screen.getByText('The last day must be after the first day.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.clear(ends);
    await user.type(ends, '2028-04-30');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      await screen.findByText(
        'That season already exists, or its dates overlap another season.',
      ),
    ).toBeInTheDocument();
  });

  it('edits only the dates of a season and sends the key encoded', async () => {
    const user = await openSeasons();
    await screen.findByRole('table', { name: 'Seasons' });
    await seasonAction(user, '2026/27', 'Edit season 2026/27');
    expect(
      screen.getByRole('heading', { name: 'Edit 2026/27' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The season name can't change. You can change its dates.",
      ),
    ).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const [starts] = screen.getAllByLabelText(/First day/);
    await user.clear(starts!);
    await user.type(starts!, '2026-10-15');
    await user.click(save);
    await waitFor(() =>
      expect(requests).toEqual([
        {
          method: 'PATCH',
          path: '/admin/reference/seasons/2026%2F27',
          body: { startsOn: '2026-10-15' },
        },
      ]),
    );
    expect(
      await within(seasonRow('2026/27')).findByText('Oct 15, 2026'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit 2026/27' })).toBeNull();
  });

  it('deletes an unused season and explains when one is in use', async () => {
    inUse = new Set(['2025/26', '2027/28']);
    seasons = fakeSeasons.map((s) => ({ ...s, inUse: s.key === '2025/26' }));
    const user = await openSeasons();
    await screen.findByRole('table', { name: 'Seasons' });
    await user.click(
      screen.getByRole('button', { name: 'More actions for 2025/26' }),
    );
    const inUseItem = screen.getByRole('menuitem', {
      name: 'Remove season 2025/26',
    });
    expect(inUseItem).toHaveAttribute('aria-disabled', 'true');
    expect(inUseItem).toHaveAccessibleDescription(
      "Documents or invites use this season, so it can't be removed.",
    );
    await user.click(inUseItem);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.keyboard('{Escape}');
    expect(
      within(seasonRow('2025/26')).getByText('In use'),
    ).toBeInTheDocument();
    await seasonAction(user, '2027/28', 'Remove season 2027/28');
    const confirm = screen.getByRole('alertdialog', {
      name: 'Remove season 2027/28?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Remove permanently' }),
    );
    expect(
      await within(confirm).findByText(
        "Documents or invites use this season, so it can't be removed.",
      ),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByRole('button', { name: 'Remove permanently' }),
    ).toBeDisabled();
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    await seasonAction(user, '2026/27', 'Remove season 2026/27');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Remove permanently',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('cell', { name: '2026/27' })).toBeNull(),
    );
    expect(requests.map((r) => r.path)).toEqual([
      '/admin/reference/seasons/2027%2F28',
      '/admin/reference/seasons/2026%2F27',
    ]);
  });

  it('shows an empty list', async () => {
    seasons = [];
    await openSeasons();
    expect(
      await screen.findByText('No seasons yet. Add the first one below.'),
    ).toBeInTheDocument();
  });

  it('shows the seasons section in Chinese', async () => {
    await openSeasons('zh-CN');
    const table = await screen.findByRole('table', { name: '雪季' });
    expect(
      within(within(table).getAllByRole('row')[0] as HTMLElement)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['雪季', '开始日期', '结束日期', '状态', '操作']);
    expect(within(table).getByText('当前')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '添加雪季' }),
    ).toBeInTheDocument();
  });
});
