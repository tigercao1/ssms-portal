import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { PagesListPage } from './PagesListPage';
import { renderWithProviders } from '@/test/render';
import { fakePage, server } from '@/test/msw';
import type { PublicPage } from '@/lib/types';

const API = 'http://localhost:3000';

const pages: PublicPage[] = [
  fakePage({ id: 'p1', title: 'Draft guide', slug: 'draft-guide' }),
  fakePage({
    id: 'p2',
    title: 'Live guide',
    slug: 'live-guide',
    status: 'published',
    hasContent: true,
    publishedAt: '2026-10-03T10:00:00Z',
  }),
  fakePage({
    id: 'p3',
    title: 'Changed guide',
    slug: 'changed-guide',
    status: 'published',
    hasContent: true,
    hasUnpublishedChanges: true,
  }),
];

function serve(list: PublicPage[] = pages) {
  const created: unknown[] = [];
  server.use(
    http.get(`${API}/admin/pages`, () => HttpResponse.json(list)),
    http.post(`${API}/admin/pages`, async ({ request }) => {
      const body = (await request.json()) as { slug: string; title: string };
      created.push(body);
      if (body.slug === 'taken')
        return HttpResponse.json(
          { message: 'Slug already exists' },
          { status: 409 },
        );
      return HttpResponse.json(fakePage({ id: 'new-1', ...body }), {
        status: 201,
      });
    }),
  );
  return { created };
}

function renderList() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/pages" element={<PagesListPage />} />
      <Route path="/admin/pages/:id" element={<p>Editor page</p>} />
    </Routes>,
    { route: '/admin/pages' },
  );
}

function rowFor(title: string) {
  return screen.getByRole('link', { name: title }).closest('tr')!;
}

describe('PagesListPage list', () => {
  it('renders each page with its status and public link', async () => {
    serve();
    renderList();

    await screen.findByRole('link', { name: 'Draft guide' });
    const draft = within(rowFor('Draft guide'));
    expect(draft.getByText('Draft')).toBeInTheDocument();
    expect(draft.getByText('draft-guide')).toBeInTheDocument();
    expect(draft.queryByRole('button', { name: /Copy link/ })).toBeNull();

    const live = within(rowFor('Live guide'));
    expect(live.getByText('Published')).toBeInTheDocument();
    expect(
      live.getByRole('link', { name: 'https://docs.ssnow.club/live-guide' }),
    ).toHaveAttribute('href', 'https://docs.ssnow.club/live-guide');

    const changed = within(rowFor('Changed guide'));
    expect(changed.getByText('Published · unpublished changes')).toHaveClass(
      'whitespace-nowrap',
    );
    expect(screen.getByRole('link', { name: 'Draft guide' })).toHaveAttribute(
      'href',
      '/admin/pages/p1',
    );
  });

  it('copies the public link', async () => {
    serve();
    const user = userEvent.setup();
    renderList();

    const copy = await screen.findByRole('button', {
      name: 'Copy link for Live guide',
    });
    await user.click(copy);

    expect(copy).toHaveTextContent('Copied');
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://docs.ssnow.club/live-guide',
    );
  });

  it('shows an empty state', async () => {
    serve([]);
    renderList();
    expect(await screen.findByText('No pages yet.')).toBeInTheDocument();
  });

  it('shows an error when the list fails to load', async () => {
    server.use(
      http.get(`${API}/admin/pages`, () =>
        HttpResponse.json({ message: 'Pages unavailable' }, { status: 503 }),
      ),
    );
    renderList();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pages unavailable',
    );
  });
});

describe('PagesListPage create', () => {
  function fields() {
    return {
      title: screen.getByRole('textbox', { name: /Title/ }),
      slug: screen.getByRole('textbox', { name: /Slug/ }),
      submit: screen.getByRole('button', { name: 'Create page' }),
    };
  }

  it('suggests a slug from the title and opens the new page', async () => {
    const { created } = serve();
    const user = userEvent.setup();
    renderList();
    await screen.findByRole('link', { name: 'Draft guide' });
    const { title, slug, submit } = fields();

    await user.type(title, 'Lesson Plan: Week 1');
    expect(slug).toHaveValue('lesson-plan-week-1');
    await user.click(submit);

    expect(await screen.findByText('Editor page')).toBeInTheDocument();
    expect(created).toEqual([
      { slug: 'lesson-plan-week-1', title: 'Lesson Plan: Week 1' },
    ]);
  });

  it('keeps an edited slug and requires one for Chinese-only titles', async () => {
    const { created } = serve();
    const user = userEvent.setup();
    renderList();
    await screen.findByRole('link', { name: 'Draft guide' });
    const { title, slug, submit } = fields();

    await user.type(title, '滑雪指南');
    expect(slug).toHaveValue('');
    await user.click(submit);
    expect(
      screen.getByText(/Use lowercase letters and digits/),
    ).toBeInTheDocument();
    expect(slug).toHaveAttribute('aria-invalid', 'true');

    await user.type(slug, 'ski-guide');
    await user.type(title, '（新）');
    expect(slug).toHaveValue('ski-guide');
    await user.click(submit);

    expect(await screen.findByText('Editor page')).toBeInTheDocument();
    expect(created).toEqual([{ slug: 'ski-guide', title: '滑雪指南（新）' }]);
  });

  it('rejects malformed slugs and empty titles without a request', async () => {
    const { created } = serve();
    const user = userEvent.setup();
    renderList();
    await screen.findByRole('link', { name: 'Draft guide' });
    const { title, slug, submit } = fields();

    await user.type(slug, 'Bad Slug');
    expect(
      screen.getByText(/Use lowercase letters and digits/),
    ).toBeInTheDocument();
    await user.click(submit);
    expect(
      screen.getByText('Enter a title of up to 200 characters.'),
    ).toBeInTheDocument();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(created).toEqual([]);
  });

  it('shows a slug error on 409', async () => {
    serve();
    const user = userEvent.setup();
    renderList();
    await screen.findByRole('link', { name: 'Draft guide' });
    const { title, slug, submit } = fields();

    await user.type(title, 'Taken');
    expect(slug).toHaveValue('taken');
    await user.click(submit);

    expect(
      await screen.findByText('That slug is already taken.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Editor page')).not.toBeInTheDocument();

    await user.type(slug, '-2');
    expect(
      screen.queryByText('That slug is already taken.'),
    ).not.toBeInTheDocument();
  });

  it('shows other create errors in a banner', async () => {
    serve();
    server.use(
      http.post(`${API}/admin/pages`, () =>
        HttpResponse.json({ message: 'title too long' }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderList();
    await screen.findByRole('link', { name: 'Draft guide' });
    const { title, submit } = fields();

    await user.type(title, 'Guide');
    await user.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'title too long',
    );
  });
});
