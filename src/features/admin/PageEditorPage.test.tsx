import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { PageEditorPage } from './PageEditorPage';
import { MAX_PAGE_BYTES } from './pageRules';
import { renderWithProviders } from '@/test/render';
import { fakePage, server } from '@/test/msw';
import type { PublicPage } from '@/lib/types';

const API = 'http://localhost:3000';
const HTML = '<!doctype html><h1>Guide</h1><script>alert(1)</script>';

interface Calls {
  uploads: { contentType: string | null; body: string }[];
  uploadBytes: number[][];
  actions: string[];
  patches: unknown[];
  contentGets: number;
}

function serve(initial: Partial<PublicPage> = {}) {
  let page = fakePage(initial);
  const calls: Calls = {
    uploads: [],
    uploadBytes: [],
    actions: [],
    patches: [],
    contentGets: 0,
  };
  server.use(
    http.get(`${API}/admin/pages`, () => HttpResponse.json([page])),
    http.get(`${API}/admin/pages/:id/content`, () => {
      calls.contentGets += 1;
      return new HttpResponse(HTML, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }),
    http.put(`${API}/admin/pages/:id/content`, async ({ request }) => {
      const bytes = new Uint8Array(await request.arrayBuffer());
      const body = new TextDecoder().decode(bytes);
      calls.uploads.push({
        contentType: request.headers.get('content-type'),
        body,
      });
      calls.uploadBytes.push(Array.from(bytes));
      page = {
        ...page,
        hasContent: true,
        sizeBytes: body.length,
        hasUnpublishedChanges: page.status === 'published',
      };
      return HttpResponse.json(page);
    }),
    http.patch(`${API}/admin/pages/:id`, async ({ request }) => {
      const body = (await request.json()) as { title: string };
      calls.patches.push(body);
      page = { ...page, title: body.title };
      return HttpResponse.json(page);
    }),
    http.post(`${API}/admin/pages/:id/publish`, () => {
      calls.actions.push('publish');
      page = {
        ...page,
        status: 'published',
        hasUnpublishedChanges: false,
        publishedAt: '2026-10-10T12:00:00Z',
      };
      return HttpResponse.json(page);
    }),
    http.post(`${API}/admin/pages/:id/unpublish`, () => {
      calls.actions.push('unpublish');
      page = { ...page, status: 'draft', hasUnpublishedChanges: false };
      return HttpResponse.json(page);
    }),
    http.delete(`${API}/admin/pages/:id`, () => {
      calls.actions.push('delete');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

function renderEditor(id = 'p1') {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/pages" element={<p>Pages list</p>} />
      <Route path="/admin/pages/:id" element={<PageEditorPage />} />
    </Routes>,
    { route: `/admin/pages/${id}` },
  );
}

function fileInput() {
  return screen.getByLabelText('HTML file to upload') as HTMLInputElement;
}

describe('PageEditorPage upload', () => {
  it('sends the original file bytes, including ones that are not UTF-8', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });
    const latin1 = [
      0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9, 0x3c, 0x2f, 0x70, 0x3e,
    ];

    await user.upload(
      fileInput(),
      new File([new Uint8Array(latin1)], 'latin1.html', { type: 'text/html' }),
    );

    expect(
      await screen.findByText('Uploaded latin1.html.'),
    ).toBeInTheDocument();
    expect(calls.uploadBytes).toEqual([latin1]);
  });

  it('sends the file as raw text/html and refreshes the preview', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });
    expect(screen.getByText('No HTML uploaded yet.')).toBeInTheDocument();
    expect(fileInput()).toHaveAttribute('accept', 'text/html,.html,.htm');

    await user.upload(
      fileInput(),
      new File([HTML], 'guide.html', { type: 'text/html' }),
    );

    expect(await screen.findByText('Uploaded guide.html.')).toBeInTheDocument();
    expect(calls.uploads).toEqual([{ contentType: 'text/html', body: HTML }]);
    expect(
      await screen.findByTitle('Preview of Winter guide'),
    ).toBeInTheDocument();
    expect(screen.getByText('Replace HTML')).toBeInTheDocument();
    expect(screen.getByLabelText('HTML file to upload')).toBeEnabled();
    expect(
      screen.getByText(`Draft size: ${HTML.length} B`),
    ).toBeInTheDocument();
  });

  it('rejects files over 2 MiB without a request', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });

    await user.upload(
      fileInput(),
      new File([new Uint8Array(MAX_PAGE_BYTES + 1)], 'big.html', {
        type: 'text/html',
      }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'That file is 2.0 MB. The limit is 2 MB.',
    );
    expect(calls.uploads).toEqual([]);
  });

  it('rejects non-HTML files without a request', async () => {
    const calls = serve();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });

    fireEvent.change(fileInput(), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Choose an .html or .htm file.',
    );
    expect(calls.uploads).toEqual([]);
  });

  it('shows the size message when the API returns 413', async () => {
    serve();
    server.use(
      http.put(`${API}/admin/pages/:id/content`, () =>
        HttpResponse.json({ message: 'Payload too large' }, { status: 413 }),
      ),
    );
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });

    await user.upload(fileInput(), new File([HTML], 'guide.htm'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /The limit is 2 MB/,
    );
  });

  it('shows other upload errors', async () => {
    serve();
    server.use(
      http.put(`${API}/admin/pages/:id/content`, () =>
        HttpResponse.json(
          { message: 'Docs storage unavailable' },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });

    await user.upload(fileInput(), new File([HTML], 'guide.html'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Docs storage unavailable',
    );
  });
});

describe('PageEditorPage preview', () => {
  it('renders the draft in a sandboxed iframe via srcdoc', async () => {
    serve({ hasContent: true, sizeBytes: HTML.length });
    renderEditor();

    const frame = (await screen.findByTitle(
      'Preview of Winter guide',
    )) as HTMLIFrameElement;
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toBe(HTML);
    expect(frame).not.toHaveAttribute('src');
    expect(document.querySelector('h1')).toHaveTextContent('Winter guide');
    expect(document.querySelectorAll('script')).toHaveLength(0);
  });

  it('does not fetch content when nothing is uploaded', async () => {
    const calls = serve();
    renderEditor();
    expect(
      await screen.findByText('No HTML uploaded yet.'),
    ).toBeInTheDocument();
    expect(calls.contentGets).toBe(0);
  });

  it('shows an error when the content cannot be loaded', async () => {
    serve({ hasContent: true });
    server.use(
      http.get(`${API}/admin/pages/:id/content`, () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );
    renderEditor();
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
  });
});

describe('PageEditorPage download', () => {
  it('hides Download HTML until a file is uploaded', async () => {
    serve();
    renderEditor();
    expect(
      await screen.findByText('No HTML uploaded yet.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Download HTML' }),
    ).not.toBeInTheDocument();
  });

  it('saves the uploaded bytes as <slug>.html', async () => {
    serve({ hasContent: true, sizeBytes: 7 });
    const latin1 = [0x3c, 0x70, 0x3e, 0x63, 0x61, 0x66, 0xe9];
    const requested: string[] = [];
    server.use(
      http.get(`${API}/admin/pages/:id/download`, ({ params }) => {
        requested.push(String(params.id));
        return new HttpResponse(new Uint8Array(latin1), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': 'attachment; filename="winter-guide.html"',
          },
        });
      }),
    );
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:page';
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const saved: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(`${this.download} ${this.href}`);
      });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Download HTML' }),
    );

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(requested).toEqual(['p1']);
    expect(saved).toEqual(['winter-guide.html blob:page']);
    expect([...new Uint8Array(await (blobs[0] as Blob).arrayBuffer())]).toEqual(
      latin1,
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:page');
    click.mockRestore();
  });

  it('shows an error when the download fails', async () => {
    serve({ hasContent: true });
    server.use(
      http.get(`${API}/admin/pages/:id/download`, () =>
        HttpResponse.json(
          { message: 'Docs storage is unavailable' },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Download HTML' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t download the HTML file. Try again.',
    );
  });
});

describe('PageEditorPage publishing', () => {
  it('disables publishing until content is uploaded', async () => {
    serve();
    renderEditor();
    expect(
      await screen.findByRole('button', { name: 'Publish' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Upload an HTML file before publishing.'),
    ).toBeInTheDocument();
  });

  it('publishes after confirming and shows the public link', async () => {
    const calls = serve({ hasContent: true });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('alertdialog', {
      name: 'Publish “Winter guide”?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(calls.actions).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Publish',
      }),
    );

    expect(await screen.findByText('Published.')).toBeInTheDocument();
    expect(calls.actions).toEqual(['publish']);
    expect(screen.getByRole('link', { name: /View live/ })).toHaveAttribute(
      'href',
      'https://docs.ssnow.club/winter-guide',
    );
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(
      screen.getByText('Published', { selector: 'span' }),
    ).toBeInTheDocument();
  });

  it('offers to publish unpublished changes', async () => {
    serve({
      status: 'published',
      hasContent: true,
      hasUnpublishedChanges: true,
    });
    renderEditor();
    expect(
      await screen.findByText('Published · unpublished changes'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Publish changes' }),
    ).toBeEnabled();
  });

  it('unpublishes after confirming', async () => {
    const calls = serve({
      status: 'published',
      hasContent: true,
      publishedAt: '2026-10-03T10:00:00Z',
    });
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Unpublish' }));
    const dialog = screen.getByRole('alertdialog', {
      name: 'Unpublish “Winter guide”?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Unpublish' }));

    expect(await screen.findByText('Unpublished.')).toBeInTheDocument();
    expect(calls.actions).toEqual(['unpublish']);
    expect(screen.queryByRole('link', { name: /View live/ })).toBeNull();
  });

  it('copies the public link', async () => {
    serve({ status: 'published', hasContent: true });
    const user = userEvent.setup();
    renderEditor();

    const copy = await screen.findByRole('button', { name: 'Copy link' });
    await user.click(copy);

    expect(copy).toHaveTextContent('Copied');
    await expect(navigator.clipboard.readText()).resolves.toBe(
      'https://docs.ssnow.club/winter-guide',
    );
  });

  it('reports a failed copy', async () => {
    serve({ status: 'published', hasContent: true });
    const user = userEvent.setup();
    renderEditor();
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: () => Promise.reject(new Error('denied')),
    });

    await user.click(copy);
    expect(copy).toHaveTextContent('Copy failed');
  });

  it('deletes after confirming and returns to the list', async () => {
    const calls = serve({ hasContent: true });
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      await screen.findByRole('button', { name: 'Delete page' }),
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Delete “Winter guide”?',
    });
    expect(calls.actions).toEqual([]);
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete permanently' }),
    );

    expect(await screen.findByText('Pages list')).toBeInTheDocument();
    expect(calls.actions).toEqual(['delete']);
  });

  it('keeps the confirm open and shows the error when an action fails', async () => {
    serve({ hasContent: true });
    server.use(
      http.post(`${API}/admin/pages/:id/publish`, () =>
        HttpResponse.json(
          { message: 'Docs storage unavailable' },
          { status: 502 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor();

    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Docs storage unavailable',
    );
  });
});

describe('PageEditorPage details', () => {
  it('shows the slug read-only and saves a new title', async () => {
    const calls = serve();
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole('heading', { name: 'Winter guide' });

    expect(screen.getByText('winter-guide')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Slug/ })).toBeNull();
    const title = screen.getByRole('textbox', { name: /Title/ });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.clear(title);
    expect(
      screen.getByText('Enter a title of up to 200 characters.'),
    ).toBeInTheDocument();
    await user.type(title, 'Winter guide 2026');
    await user.click(save);

    expect(await screen.findByText('Title saved.')).toBeInTheDocument();
    expect(calls.patches).toEqual([{ title: 'Winter guide 2026' }]);
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Winter guide 2026' }),
      ).toBeInTheDocument(),
    );
  });

  it('shows not found for an unknown id', async () => {
    serve();
    renderEditor('missing');
    expect(await screen.findByText('Page not found.')).toBeInTheDocument();
  });

  it('shows an error when pages fail to load', async () => {
    server.use(
      http.get(`${API}/admin/pages`, () =>
        HttpResponse.json({ message: 'Pages unavailable' }, { status: 503 }),
      ),
    );
    renderEditor();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pages unavailable',
    );
  });
});
