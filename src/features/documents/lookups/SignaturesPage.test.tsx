import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createLookupsState,
  lookupsHandlers,
  type LookupsMockState,
} from './fixtures';
import { SignaturesPage } from './SignaturesPage';

const API = 'http://localhost:3000';

let state: LookupsMockState;

beforeEach(() => {
  state = createLookupsState();
  server.use(...lookupsHandlers(state));
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function search(text: string) {
  const user = userEvent.setup();
  renderWithProviders(<SignaturesPage />);
  await user.type(
    screen.getByRole('searchbox', { name: 'Name or email' }),
    text,
  );
  return user;
}

function person(name: string) {
  return within(screen.getByRole('list', { name: 'Search results' })).getByRole(
    'listitem',
    { name },
  );
}

describe('SignaturesPage', () => {
  it('asks for a search before calling the API', async () => {
    renderWithProviders(<SignaturesPage />);
    expect(
      screen.getByRole('heading', { name: 'Signatures' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Search to see who signed what.')).toBeVisible();
    expect(state.signatureQueries).toEqual([]);
  });

  it('waits for at least 2 characters', async () => {
    await search('j');
    expect(
      await screen.findByText('Type at least 2 characters.'),
    ).toBeVisible();
    expect(state.signatureQueries).toEqual([]);
  });

  it('sends one debounced request for a typed query', async () => {
    await search('  jan ');
    expect(
      await screen.findByRole('list', { name: 'Search results' }),
    ).toBeInTheDocument();
    expect(state.signatureQueries).toEqual(['jan']);
  });

  it('groups what each instructor and customer signed', async () => {
    await search('jan');
    const jane = await waitFor(() => person('Jane Snow'));
    expect(within(jane).getByText('Instructor')).toBeVisible();
    expect(within(jane).getByText('jane@example.com')).toBeVisible();
    expect(within(jane).getByText('Code of conduct')).toBeVisible();
    expect(
      within(jane).getByText('English · Signed Oct 7, 2026'),
    ).toBeVisible();
    expect(within(jane).getByText('Instructor handbook')).toBeVisible();
    expect(within(jane).getByText('Acknowledged Oct 6, 2026')).toBeVisible();
    expect(within(jane).getAllByRole('button')).toHaveLength(1);

    const janet = person('Janet Park');
    expect(within(janet).getByText('Customer')).toBeVisible();
    expect(within(janet).getByText('No signed documents yet.')).toBeVisible();
  });

  it('shows the signed date in Toronto time with language and version', async () => {
    await search('lily');
    const lily = await waitFor(() => person('Lily Chen'));
    expect(within(lily).getByText('Customer')).toBeVisible();
    expect(
      within(lily).getByText('Chinese · Version 2 · Signed Nov 7, 2026'),
    ).toBeVisible();
  });

  it('downloads a signed copy through the signed-url request', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    });
    const user = await search('lily');
    await user.click(
      await screen.findByRole('button', {
        name: 'Download Liability waiver signed by Lily Chen',
      }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://storage.mock/signed/asg-waiver-lily.pdf?sig=mock',
      ),
    );
  });

  it('says when a download fails', async () => {
    server.use(
      http.get(`${API}/admin/documents/assignments/:id/signed-url`, () =>
        HttpResponse.json({ message: 'Signed copy missing' }, { status: 404 }),
      ),
    );
    const user = await search('lily');
    await user.click(await screen.findByRole('button', { name: /Download/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not download the PDF: Signed copy missing',
    );
  });

  it('shows a loading state while searching', async () => {
    server.use(
      http.get(`${API}/admin/signatures`, async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    await search('jan');
    expect(
      await screen.findByRole('status', { name: 'Loading' }),
    ).toBeInTheDocument();
  });

  it('says when nobody matches', async () => {
    await search('zzz');
    expect(
      await screen.findByRole('heading', { name: 'No one matches “zzz”' }),
    ).toBeInTheDocument();
  });

  it('shows the API error', async () => {
    server.use(
      http.get(`${API}/admin/signatures`, () =>
        HttpResponse.json({ message: 'Lookup failed' }, { status: 500 }),
      ),
    );
    await search('jan');
    expect(await screen.findByText('Lookup failed')).toBeVisible();
  });

  it('shows titles and labels in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<SignaturesPage />);
    await user.type(
      screen.getByRole('searchbox', { name: '姓名或邮箱' }),
      'lily',
    );
    const lily = await screen.findByRole('listitem', { name: 'Lily Chen' });
    expect(within(lily).getByText('免责声明')).toBeVisible();
    expect(within(lily).getByText('客户')).toBeVisible();
    expect(
      within(lily).getByRole('button', {
        name: '下载 Lily Chen 签署的 免责声明',
      }),
    ).toHaveTextContent('下载 PDF');
  });
});
