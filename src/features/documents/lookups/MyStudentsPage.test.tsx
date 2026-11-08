import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createLookupsState,
  lookupsHandlers,
  type LookupsMockState,
} from './fixtures';
import { MyStudentsPage } from './MyStudentsPage';

const API = 'http://localhost:3000';

let state: LookupsMockState;

function setup(overrides: Partial<LookupsMockState> = {}) {
  state = createLookupsState(overrides);
  server.use(...lookupsHandlers(state));
  renderWithProviders(<MyStudentsPage />);
}

function student(name: string) {
  return within(screen.getByRole('list', { name: 'Students' })).getByRole(
    'listitem',
    { name },
  );
}

beforeEach(() => {
  state = createLookupsState();
});

describe('MyStudentsPage', () => {
  it('lists students with a Signed or Not signed badge and the signed date', async () => {
    setup();
    expect(
      await screen.findByRole('list', { name: 'Students' }),
    ).toBeInTheDocument();
    const lily = student('Lily Chen');
    expect(within(lily).getByText('Signed')).toBeVisible();
    expect(within(lily).getByText('Nov 7, 2026')).toBeVisible();
    const max = student('Max Müller');
    expect(within(max).getByText('Not signed')).toBeVisible();
    expect(within(max).queryByText(/2026/)).toBeNull();
    expect(state.studentQueries).toEqual([null]);
  });

  it('shows no emails or download links', async () => {
    setup();
    await screen.findByRole('list', { name: 'Students' });
    expect(screen.queryByText(/@/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it('searches by name after typing stops', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('list', { name: 'Students' });
    await user.type(
      screen.getByRole('searchbox', { name: 'Search by name' }),
      'wang',
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Students' })).getAllByRole(
          'listitem',
        ),
      ).toHaveLength(1),
    );
    expect(student('Wang Fang')).toBeVisible();
    expect(state.studentQueries).toEqual([null, 'wang']);
  });

  it('says when no student matches the search', async () => {
    const user = userEvent.setup();
    setup();
    await screen.findByRole('list', { name: 'Students' });
    await user.type(
      screen.getByRole('searchbox', { name: 'Search by name' }),
      'zzz',
    );
    expect(
      await screen.findByRole('heading', { name: 'No students match “zzz”' }),
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no students', async () => {
    setup({ students: [] });
    expect(
      await screen.findByRole('heading', { name: 'No students yet' }),
    ).toBeInTheDocument();
  });

  it('says the list is capped at 100 students', async () => {
    setup({
      students: Array.from({ length: 100 }, (_, i) => ({
        name: `Student ${i + 1}`,
        signed: false,
        signedAt: null,
      })),
    });
    expect(
      await screen.findByText(
        'Showing the first 100 students. Search by name to find others.',
      ),
    ).toBeVisible();
  });

  it('shows the review lock while the profile is pending approval', async () => {
    setup({ meStatus: 'pending' });
    expect(
      await screen.findByText('Your profile is being reviewed'),
    ).toBeVisible();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('shows the review lock when there is no instructor profile', async () => {
    setup({ meStatus: 'none' });
    expect(
      await screen.findByText('Your profile is being reviewed', undefined, {
        timeout: 3000,
      }),
    ).toBeVisible();
  });

  it('says a rejected profile cannot see students', async () => {
    setup({ meStatus: 'rejected' });
    expect(
      await screen.findByText("Your profile wasn't approved"),
    ).toBeVisible();
  });

  it('offers a retry when loading fails', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/me/students/signatures`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<MyStudentsPage />);
    expect(
      await screen.findByText('Could not load your students.'),
    ).toBeVisible();
    server.use(...lookupsHandlers(state));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('list', { name: 'Students' }),
    ).toBeInTheDocument();
  });

  it('shows the badges in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    setup();
    const list = await screen.findByRole('list', { name: '学员' });
    expect(within(list).getAllByText('已签署')).toHaveLength(2);
    expect(within(list).getByText('未签署')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: '我的学员与免责声明' }),
    ).toBeInTheDocument();
  });
});
