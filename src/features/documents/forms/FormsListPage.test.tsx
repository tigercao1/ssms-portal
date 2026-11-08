import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { formatDateTime } from '@/lib/date';
import {
  createFormsState,
  fakeFormVersion,
  formsHandlers,
  type FormsMockState,
} from './fixtures';
import { FormsListPage } from './FormsListPage';

let state: FormsMockState;

beforeEach(() => {
  state = createFormsState();
  server.use(...formsHandlers(state));
});

function row(title: string) {
  return within(screen.getByRole('list', { name: 'Signing forms' })).getByRole(
    'listitem',
    { name: title },
  );
}

describe('FormsListPage', () => {
  it('lists every form with its languages, email copy and link', async () => {
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    const waiver = row('Liability waiver');
    expect(within(waiver).getByText('免责声明')).toBeVisible();
    expect(within(waiver).getByText('waiver')).toBeVisible();
    expect(within(waiver).getByText('English v1')).toBeVisible();
    expect(within(waiver).getByText('Chinese draft')).toBeVisible();
    expect(within(waiver).getByText('On')).toBeVisible();
    expect(
      within(waiver).getByRole('link', {
        name: 'https://sign.ssnow.club/w/waiver',
      }),
    ).toHaveAttribute('href', 'https://sign.ssnow.club/w/waiver');
    expect(
      within(waiver).getByRole('link', { name: 'Edit Liability waiver' }),
    ).toHaveAttribute('href', '/admin/signing-forms/form-waiver');

    const rental = row('Equipment rental agreement');
    expect(within(rental).getByText('English · Not published')).toBeVisible();
    expect(within(rental).getByText('Off')).toBeVisible();
    expect(
      within(rental).getByText('Works once a language is published.'),
    ).toBeVisible();
  });

  it('marks a published language that has a newer draft', async () => {
    state.forms[0]!.languages.en.draft = fakeFormVersion({
      version: 2,
      publishedAt: null,
    });
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });
    expect(
      within(row('Liability waiver')).getByText('English v1 · new draft'),
    ).toBeVisible();
  });

  it('shows which published languages have an original PDF and the last change, from the list alone', async () => {
    let detailRequests = 0;
    server.use(
      http.get('http://localhost:3000/admin/documents/forms/:id', () => {
        detailRequests += 1;
        return HttpResponse.json(
          { message: 'Form not found' },
          { status: 404 },
        );
      }),
    );
    state.forms[0]!.languages.en.published!.originalPdf = {
      sha256: 'c'.repeat(64),
      sizeBytes: 120_000,
      pageCount: 2,
      pages: [],
      url: 'https://storage.mock/forms/waiver-en.pdf',
      urlExpiresAt: '2026-11-08T20:00:00Z',
    };
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    const waiver = row('Liability waiver');
    expect(within(waiver).getByText('English')).toBeVisible();
    expect(
      within(waiver).getByText(formatDateTime('2026-11-07T18:30:00Z', 'en')),
    ).toBeVisible();
    expect(
      within(row('Equipment rental agreement')).getByText('None'),
    ).toBeVisible();
    expect(detailRequests).toBe(0);
  });

  it('copies the public link of a form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    const copy = within(row('Liability waiver')).getByRole('button', {
      name: 'Copy the public link to Liability waiver',
    });
    await user.click(copy);

    expect(copy).toHaveTextContent('Copied');
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://sign.ssnow.club/w/waiver',
    );
  });

  it('creates a form and links to its editor', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    await user.type(screen.getByLabelText(/Link name/), 'Ski-Lesson');
    expect(
      screen.getByText('https://sign.ssnow.club/w/ski-lesson'),
    ).toBeVisible();
    await user.type(screen.getByLabelText(/English title/), 'Lesson waiver');
    await user.type(
      screen.getByLabelText('Chinese title (optional)'),
      '课程免责声明',
    );
    await user.click(screen.getByRole('button', { name: 'Create form' }));

    expect(await screen.findByText(/Created Lesson waiver/)).toBeVisible();
    expect(state.requests).toContainEqual({
      method: 'POST',
      path: '/admin/documents/forms',
      body: {
        slug: 'ski-lesson',
        titleEn: 'Lesson waiver',
        titleZh: '课程免责声明',
      },
    });
    expect(
      await within(row('Lesson waiver')).findByText('ski-lesson'),
    ).toBeVisible();
    expect(screen.getByLabelText(/Link name/)).toHaveValue('');
  });

  it('checks the link name and title before creating', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    await user.type(screen.getByLabelText(/Link name/), 'ski--waiver');
    await user.click(screen.getByRole('button', { name: 'Create form' }));

    expect(
      screen.getByText(
        'Use lower-case letters, numbers and single hyphens only.',
      ),
    ).toBeVisible();
    expect(screen.getByText('This field is required.')).toBeVisible();
    expect(state.requests).toEqual([]);
  });

  it('shows the API message when the link name is taken', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FormsListPage />);
    await screen.findByRole('list', { name: 'Signing forms' });

    await user.type(screen.getByLabelText(/Link name/), 'waiver');
    await user.type(screen.getByLabelText(/English title/), 'Second waiver');
    await user.click(screen.getByRole('button', { name: 'Create form' }));

    expect(
      await screen.findByText('Another document already uses this link name'),
    ).toBeVisible();
  });

  it('shows an empty state', async () => {
    server.use(
      http.get('http://localhost:3000/admin/documents/forms', () =>
        HttpResponse.json([]),
      ),
    );
    renderWithProviders(<FormsListPage />);
    expect(await screen.findByText('No signing forms yet')).toBeVisible();
  });
});
