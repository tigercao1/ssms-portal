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
import { SEARCH_QUERY_MAX } from './api';
import { SignaturesPage } from './SignaturesPage';

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { id: 'auth-1' } }),
}));

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

  it('caps the search at the API maximum length', async () => {
    await search('j'.repeat(SEARCH_QUERY_MAX + 5));
    expect(
      screen.getByRole('searchbox', { name: 'Name or email' }),
    ).toHaveValue('j'.repeat(SEARCH_QUERY_MAX));
    await waitFor(() =>
      expect(state.signatureQueries).toEqual(['j'.repeat(SEARCH_QUERY_MAX)]),
    );
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

describe('Waiver status for this waiver year', () => {
  it('shows each person’s status with the date and marks each signature valid or expired', async () => {
    await search('lily');
    const lily = await waitFor(() => person('Lily Chen'));
    expect(within(lily).getByText('Waiver signed Nov 7, 2026')).toBeVisible();
    expect(within(lily).getAllByText('Valid this waiver year')).toHaveLength(2);
  });

  it('asks for a re-sign when the only waiver is from an earlier year', async () => {
    await search('max');
    const max = await waitFor(() => person('Max Müller'));
    expect(
      within(max).getByText('Signed last year (Jan 10, 2026), needs re-sign'),
    ).toBeVisible();
    expect(within(max).getByText('Expired')).toBeVisible();
  });

  it('says when a customer has no waiver on file', async () => {
    await search('janet');
    const janet = await waitFor(() => person('Janet Park'));
    expect(within(janet).getByText('No waiver on file')).toBeVisible();
  });

  it('checks a searched email in the check-by-email box too', async () => {
    await search('Max@Example.com');
    expect(
      await screen.findByText(
        'max@example.com last signed on Jan 10, 2026, before this waiver year. Needs re-sign.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'max@example.com',
    );
    expect(state.checkEmails).toEqual(['max@example.com']);
  });

  it('shows the status chips in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<SignaturesPage />);
    await user.type(
      screen.getByRole('searchbox', { name: '姓名或邮箱' }),
      'max',
    );
    const max = await screen.findByRole('listitem', { name: 'Max Müller' });
    expect(
      within(max).getByText('去年已签署（2026年1月10日），需重新签署'),
    ).toBeVisible();
    expect(within(max).getByText('已过期')).toBeVisible();
    expect(
      within(max).getByRole('button', {
        name: '将 Max Müller 签署的 免责声明 关联到客户',
      }),
    ).toHaveTextContent('关联到客户');
  });
});

describe('Link a signature to a customer', () => {
  async function openLink() {
    const user = await search('fang');
    await user.click(
      await screen.findByRole('button', {
        name: 'Link Liability waiver signed by Fang Wang to a customer',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Link signature to a customer',
    });
    return { user, dialog };
  }

  async function pickWangFang(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
  ) {
    await user.type(within(dialog).getByLabelText('Find a customer'), 'wang');
    const option = await within(dialog).findByRole('option', {
      name: /Wang Fang/,
    });
    expect(option).toHaveTextContent('No waiver on file');
    await user.click(option);
  }

  it('offers the link only on customer signatures', async () => {
    await search('jan');
    await waitFor(() => person('Jane Snow'));
    expect(
      screen.queryByRole('button', { name: /to a customer/ }),
    ).not.toBeInTheDocument();
  });

  it('offers the link on customer form and sign waivers but not on read acknowledgements', async () => {
    const user = await search('lily');
    const lily = await waitFor(() => person('Lily Chen'));
    expect(within(lily).getByText('Hill safety rules')).toBeVisible();
    expect(
      within(lily).getByRole('button', {
        name: 'Link Liability waiver signed by Lily Chen to a customer',
      }),
    ).toBeVisible();
    expect(
      within(lily).queryByRole('button', { name: /^Link Hill safety rules/ }),
    ).not.toBeInTheDocument();

    const box = screen.getByRole('searchbox', { name: 'Name or email' });
    await user.clear(box);
    await user.type(box, 'max');
    const max = await waitFor(() => person('Max Müller'));
    expect(
      within(max).getByRole('button', {
        name: 'Link Liability waiver signed by Max Müller to a customer',
      }),
    ).toBeVisible();
  });

  it('links after a confirmation naming both customers, then refreshes the list', async () => {
    const { user, dialog } = await openLink();
    expect(dialog).toHaveTextContent(
      'Liability waiver, signed by Fang Wang on Oct 30, 2026.',
    );
    expect(
      within(dialog).queryByRole('button', { name: 'New customer' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Link signature' }),
    ).toBeDisabled();

    await pickWangFang(user, dialog);
    expect(
      within(dialog).getByText(
        'Link the Liability waiver signed by Fang Wang to Wang Fang? It will count as Wang Fang’s signature.',
      ),
    ).toBeVisible();
    expect(within(dialog).queryByText(/You can still book/)).toBeNull();
    await user.click(
      within(dialog).getByRole('button', { name: 'Link signature' }),
    );

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(state.links).toEqual([
      { assignmentId: 'asg-waiver-fang', customerId: 'cu-wang' },
    ]);
    const done = screen.getByText('Linked Liability waiver to Wang Fang.');
    expect(done.parentElement).toHaveTextContent('Waiver signed Oct 30, 2026');
    await waitFor(() =>
      expect(
        within(person('Fang Wang')).getByText('No signed documents yet.'),
      ).toBeVisible(),
    );
    const wang = person('Wang Fang');
    expect(within(wang).getByText('Liability waiver')).toBeVisible();
    expect(within(wang).getByText('Waiver signed Oct 30, 2026')).toBeVisible();
  });

  it.each([
    [
      400,
      'Not a completed customer signature',
      'This is not a completed customer signature, so it cannot be linked.',
    ],
    [
      404,
      'Not found',
      'That signature or customer no longer exists. Search again and retry.',
    ],
    [500, 'Database down', 'Could not link: Database down'],
  ])(
    'keeps the dialog open and explains a %i',
    async (status, message, shown) => {
      server.use(
        http.post(`${API}/admin/signatures/:id/link`, () =>
          HttpResponse.json({ message }, { status }),
        ),
      );
      const { user, dialog } = await openLink();
      await pickWangFang(user, dialog);
      await user.click(
        within(dialog).getByRole('button', { name: 'Link signature' }),
      );

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(shown);
      expect(screen.queryByText(/^Linked /)).not.toBeInTheDocument();
    },
  );

  it('locks the target customer and the button while a link is pending', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const posted: string[] = [];
    server.use(
      http.post(`${API}/admin/signatures/:id/link`, async ({ request }) => {
        posted.push(
          ((await request.clone().json()) as { customerId: string }).customerId,
        );
        await held;
      }),
    );
    const { user, dialog } = await openLink();
    await pickWangFang(user, dialog);
    const button = within(dialog).getByRole('button', {
      name: 'Link signature',
    });
    await user.click(button);
    await waitFor(() => expect(posted).toEqual(['cu-wang']));

    const remove = within(dialog).getByRole('button', {
      name: 'Remove Wang Fang',
    });
    expect(remove).toBeDisabled();
    expect(within(dialog).getByLabelText('Find a customer')).toBeDisabled();
    expect(button).toBeDisabled();
    await user.click(remove);
    await user.click(button);
    expect(
      within(dialog).getByRole('list', { name: 'Selected customers' }),
    ).toHaveTextContent('Wang Fang');

    release();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(posted).toEqual(['cu-wang']);
    expect(state.links).toEqual([
      { assignmentId: 'asg-waiver-fang', customerId: 'cu-wang' },
    ]);
  });

  it('closes without linking on Cancel', async () => {
    const { user, dialog } = await openLink();
    await pickWangFang(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.links).toEqual([]);
  });
});

describe('Check by email', () => {
  it('says when the latest signature is from an earlier waiver year', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignaturesPage />);
    await user.type(screen.getByLabelText('Email address'), 'max@example.com');
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(
      await screen.findByText(
        'max@example.com last signed on Jan 10, 2026, before this waiver year. Needs re-sign.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('list', { name: 'Signed documents' }),
    ).not.toBeInTheDocument();
  });

  async function check(email: string) {
    const user = userEvent.setup();
    renderWithProviders(<SignaturesPage />);
    await user.type(screen.getByLabelText('Email address'), email);
    await user.click(screen.getByRole('button', { name: 'Check' }));
  }

  it('shows whether an exact email signed, when, and the document titles', async () => {
    await check('  Lily@Example.com ');

    expect(
      await screen.findByText(
        'lily@example.com signed this waiver year, on Nov 7, 2026.',
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Signed documents' })).getByText(
        'Liability waiver',
      ),
    ).toBeVisible();
    expect(state.checkEmails).toEqual(['lily@example.com']);
    expect(state.signatureQueries).toEqual([]);
  });

  it('says so when nothing was signed with that email', async () => {
    await check('janet.park@example.com');
    expect(
      await screen.findByText('Nothing signed with janet.park@example.com.'),
    ).toBeVisible();
  });

  it('asks for a full email before calling the API', async () => {
    await check('lily@');
    expect(screen.getByText('Enter a full email address.')).toBeVisible();
    expect(state.checkEmails).toEqual([]);
  });

  it('checks the same email again on a second click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignaturesPage />);
    await user.type(
      screen.getByLabelText('Email address'),
      'janet.park@example.com',
    );
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(
      await screen.findByText('Nothing signed with janet.park@example.com.'),
    ).toBeVisible();

    state.signers.find((s) => s.email === 'lily@example.com')!.email =
      'janet.park@example.com';
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(
      await screen.findByText(
        /janet\.park@example\.com signed this waiver year/,
      ),
    ).toBeVisible();
    expect(state.checkEmails).toEqual([
      'janet.park@example.com',
      'janet.park@example.com',
    ]);
  });

  it('retries a failed check for the same email', async () => {
    server.use(
      http.get(
        `${API}/admin/signatures/check`,
        () =>
          HttpResponse.json({ message: 'Too many requests' }, { status: 429 }),
        { once: true },
      ),
    );
    await check('lily@example.com');
    expect(
      await screen.findByText('Could not check: Too many requests'),
    ).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Check' }));

    expect(
      await screen.findByText(
        'lily@example.com signed this waiver year, on Nov 7, 2026.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Could not check/)).not.toBeInTheDocument();
  });

  it('shows the API error', async () => {
    server.use(
      http.get(`${API}/admin/signatures/check`, () =>
        HttpResponse.json({ message: 'Too many requests' }, { status: 429 }),
      ),
    );
    await check('lily@example.com');
    expect(
      await screen.findByText('Could not check: Too many requests'),
    ).toBeVisible();
  });
});
