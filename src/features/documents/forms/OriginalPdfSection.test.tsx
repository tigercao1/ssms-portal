import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { api } from '@/lib/api';
import { fakePdf } from '../testing/fakePdfPages';
import {
  createFormsState,
  fakeOriginalPdf,
  formsHandlers,
  type FormsMockState,
} from './fixtures';
import type { FormPlacement } from './api';
import { FormEditorPage } from './FormEditorPage';

vi.mock('../pdf/PdfPages', async () => {
  const m = await import('../testing/fakePdfPages');
  return { PdfPages: m.FakePdfPages };
});

vi.mock('react-rnd', () => ({
  Rnd: ({
    size,
    position,
    onDragStop,
    children,
  }: {
    size: { width: number; height: number };
    position: { x: number; y: number };
    onDragStop?: (e: unknown, d: { x: number; y: number }) => void;
    children: ReactNode;
  }) => (
    <div
      data-testid="rnd"
      data-rect={`${position.x},${position.y},${size.width},${size.height}`}
    >
      {children}
      <button
        type="button"
        onClick={() =>
          onDragStop?.(null, { x: position.x + 10, y: position.y - 20 })
        }
      >
        drag
      </button>
    </div>
  ),
}));

let state: FormsMockState;

beforeEach(() => {
  fakePdf.pageCount = 2;
  state = createFormsState();
  server.use(...formsHandlers(state));
});

function pdfFile(name = 'waiver.pdf', type = 'application/pdf') {
  return new File(['%PDF-1.7 waiver'], name, { type });
}

async function openChinese() {
  renderWithProviders(
    <Routes>
      <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
    </Routes>,
    { route: '/admin/signing-forms/form-waiver?lang=zh', dataRouter: true },
  );
  await screen.findByRole('tab', { name: 'Chinese' });
  return userEvent.setup({ applyAccept: false });
}

const publish = () => screen.getByRole('button', { name: 'Publish' });

function attachPdf() {
  state.forms[0]!.languages.zh.draft!.originalPdf = fakeOriginalPdf();
}

function hold(method: 'put' | 'post', url: string) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let started = false;
  server.use(
    http[method](
      url,
      async () => {
        started = true;
        await held;
      },
      { once: true },
    ),
  );
  return { release, started: () => started };
}

const PLACEMENTS_URL =
  'http://localhost:3000/admin/documents/forms/:id/versions/zh/placements';
const placementPuts = () =>
  state.requests
    .filter((r) => r.path.endsWith('/placements'))
    .map(
      (r) =>
        r.body as { placements: { key: string }[]; expectedUpdatedAt?: string },
    );

describe('Original PDF on a signing form', () => {
  it('uploads a PDF through the presigned URL and asks for the required fields before publishing', async () => {
    const user = await openChinese();
    expect(publish()).toBeEnabled();
    expect(
      screen.getByText(
        'No original PDF. The signed copy is made from the text.',
      ),
    ).toBeVisible();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());

    expect(
      await screen.findByText('PDF uploaded. Place the fields on it next.'),
    ).toBeVisible();
    expect(state.requests.map((r) => r.path)).toEqual([
      '/admin/documents/forms/form-waiver/versions/zh/source/upload-url',
      '/admin/documents/forms/form-waiver/versions/zh/source/confirm',
    ]);
    expect(state.requests[0]!.body).toEqual({ contentLength: 15 });
    expect(screen.getByTestId('pdf-pages')).toHaveAttribute(
      'data-source',
      'https://storage.mock/forms/form-waiver/zh-v1.pdf?sig=mock',
    );
    expect(screen.getByRole('link', { name: 'Open PDF' })).toBeVisible();
    expect(publish()).toBeDisabled();
    expect(
      screen.getByText(
        'Place these required fields on the PDF before publishing: 参与者姓名, 电子邮箱, 日期, 参与者签名.',
      ),
    ).toBeVisible();
    const palette = screen.getByRole('list', { name: 'Place fields' });
    expect(within(palette).getAllByText('Not placed')).toHaveLength(4);
  });

  it('places every required field, saves the positions and publishes', async () => {
    attachPdf();
    const user = await openChinese();

    for (const label of ['参与者姓名', '电子邮箱', '日期', '参与者签名'])
      await user.click(
        screen.getByRole('button', { name: `Place ${label} on the PDF` }),
      );
    expect(publish()).toBeDisabled();
    expect(
      screen.getByText('Save the field positions before publishing.'),
    ).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'English' }));
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Leave without saving?' }),
      ).getByRole('button', { name: 'Keep editing' }),
    );

    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    const put = state.requests.find((r) => r.path.endsWith('/placements'));
    expect(put?.body).toEqual({
      expectedUpdatedAt: '2026-11-07T18:30:00Z',
      placements: [
        { key: 'participant_name', page: 1, x: 206, y: 385, w: 200, h: 22 },
        { key: 'email', page: 1, x: 206, y: 385, w: 200, h: 22 },
        { key: 'date', page: 1, x: 251, y: 385, w: 110, h: 22 },
        {
          key: 'participant_signature',
          page: 1,
          x: 216,
          y: 378,
          w: 180,
          h: 36,
        },
      ],
    });

    expect(publish()).toBeEnabled();
    await user.click(publish());
    expect(
      await screen.findByText(
        'Published version 1 in Chinese. The public link now shows it.',
      ),
    ).toBeVisible();
  });

  it('moves a placed box by dragging and removes one with the Delete key', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
      { key: 'initials', page: 2, x: 100, y: 100, w: 60, h: 22 },
    ];
    const user = await openChinese();

    await user.click(
      within(screen.getByTestId('placement-overlay-1')).getByRole('button', {
        name: 'drag',
      }),
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: '姓名缩写 on page 2' }),
      {
        key: 'Delete',
      },
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));

    await screen.findByText('Field positions saved.');
    expect(state.forms[0]!.languages.zh.draft!.placements).toEqual([
      { key: 'date', page: 1, x: 110, y: 620, w: 110, h: 22 },
    ]);
  });

  it('shows the API message when the positions are rejected', async () => {
    attachPdf();
    const user = await openChinese();
    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    state.forms[0]!.languages.zh.draft!.originalPdf!.pages = [];
    await user.click(screen.getByRole('button', { name: 'Save positions' }));

    expect(
      await screen.findByText(
        'Could not save the positions: The field positions are not valid: date is on page 1, but the PDF has 0 page(s)',
      ),
    ).toBeVisible();
  });

  it('clears the positions when a replacement PDF has different pages', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    state.nextPageCount = 3;
    const user = await openChinese();

    await user.upload(screen.getByLabelText('Replace PDF'), pdfFile());

    expect(
      await screen.findByText(
        'PDF replaced. The pages changed, so the field positions were cleared; place the fields again.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /on page/ }),
    ).not.toBeInTheDocument();
  });

  it('removes the PDF after a confirmation', async () => {
    attachPdf();
    const user = await openChinese();
    expect(publish()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));
    expect(
      screen.getByText(
        'Remove the PDF and its field positions from this draft?',
      ),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));

    expect(
      await screen.findByText('PDF removed from this draft.'),
    ).toBeVisible();
    expect(state.requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/admin/documents/forms/form-waiver/versions/zh/source',
    });
    expect(screen.queryByTestId('pdf-pages')).not.toBeInTheDocument();
    expect(publish()).toBeEnabled();
  });

  it('refuses files that are not PDFs or are over 10 MB without calling the API', async () => {
    const user = await openChinese();

    await user.upload(
      screen.getByLabelText('Upload PDF'),
      pdfFile('notes.txt', 'text/plain'),
    );
    expect(await screen.findByText('Choose a PDF file.')).toBeVisible();

    const big = pdfFile();
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText('Upload PDF'), big);
    expect(
      await screen.findByText('The PDF must be 10 MB or smaller.'),
    ).toBeVisible();
    expect(state.requests).toEqual([]);
  });

  it('shows the API message when the PDF is refused', async () => {
    server.use(
      http.post(
        'http://localhost:3000/admin/documents/forms/:id/versions/:lang/source/confirm',
        () =>
          HttpResponse.json(
            { statusCode: 400, message: 'The PDF has more than 30 pages' },
            { status: 400 },
          ),
      ),
    );
    const user = await openChinese();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    expect(
      await screen.findByText('Upload failed: The PDF has more than 30 pages'),
    ).toBeVisible();
  });

  it('reloads the form when the draft changed meanwhile', async () => {
    attachPdf();
    const user = await openChinese();
    server.use(
      http.delete(
        'http://localhost:3000/admin/documents/forms/:id/versions/:lang/source',
        () =>
          HttpResponse.json(
            {
              statusCode: 409,
              message:
                'This form was changed by someone else; reload it and try again',
            },
            { status: 409 },
          ),
      ),
    );
    state.forms[0]!.languages.zh.published = state.forms[0]!.languages.zh.draft;
    state.forms[0]!.languages.zh.draft = null;

    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));
    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));

    expect(
      await screen.findByText(
        'Save a draft in this language to attach or change its PDF.',
      ),
    ).toBeVisible();
  });

  it('shows a published PDF read-only until there is a draft', async () => {
    state.forms[0]!.languages.en.published!.originalPdf = fakeOriginalPdf();
    state.forms[0]!.languages.en.published!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    renderWithProviders(
      <Routes>
        <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
      </Routes>,
      { route: '/admin/signing-forms/form-waiver', dataRouter: true },
    );

    expect(
      await screen.findByText(
        'Save a draft in this language to attach or change its PDF.',
      ),
    ).toBeVisible();
    expect(screen.queryByLabelText('Upload PDF')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Date on page 1' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Place Date on the PDF' }),
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save positions' }),
    ).not.toBeInTheDocument();
  });

  it('keeps Publish disabled while a PDF upload is in flight', async () => {
    const upload = hold('put', 'https://storage.mock/upload/forms/:id/:file');
    const user = await openChinese();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    await waitFor(() => expect(upload.started()).toBe(true));
    expect(publish()).toBeDisabled();

    upload.release();
    expect(
      await screen.findByText('PDF uploaded. Place the fields on it next.'),
    ).toBeVisible();
    expect(state.forms[0]!.languages.zh.published).toBeNull();
  });

  it('keeps Publish and PDF changes disabled while positions are saving', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'participant_name', page: 1, x: 100, y: 700, w: 200, h: 22 },
      { key: 'email', page: 1, x: 100, y: 660, w: 200, h: 22 },
      { key: 'participant_signature', page: 1, x: 100, y: 600, w: 180, h: 36 },
    ];
    const save = hold('put', PLACEMENTS_URL);
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    await waitFor(() => expect(save.started()).toBe(true));
    expect(publish()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove PDF' })).toBeDisabled();
    expect(screen.getByLabelText('Replace PDF')).toBeDisabled();

    save.release();
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    expect(publish()).toBeEnabled();
  });

  it('keeps boxes placed while the positions were saving', async () => {
    attachPdf();
    const save = hold('put', PLACEMENTS_URL);
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    await waitFor(() => expect(save.started()).toBe(true));
    await user.click(
      screen.getByRole('button', { name: 'Place 姓名缩写 on the PDF' }),
    );
    save.release();

    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.placements).toHaveLength(1),
    );
    expect(
      screen.getByRole('button', { name: '姓名缩写 on page 1' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: '日期 on page 1' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.placements).toHaveLength(2),
    );
    expect(
      placementPuts()
        .at(-1)!
        .placements.map((p) => p.key),
    ).toEqual(['date', 'initials']);
  });

  it('chains the revision from a positions save into the next draft save', async () => {
    attachPdf();
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    const afterPositions = state.forms[0]!.languages.zh.draft!.updatedAt;
    await user.type(screen.getByLabelText(/Title signers see/), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    expect(placementPuts()[0]!.expectedUpdatedAt).toBe('2026-11-07T18:30:00Z');
    expect(
      state.requests.filter((r) => r.method === 'PUT').at(-1)!.body,
    ).toMatchObject({ expectedUpdatedAt: afterPositions });
  });

  it('reloads the positions another admin changed', async () => {
    attachPdf();
    const user = await openChinese();
    const draft = state.forms[0]!.languages.zh.draft!;
    draft.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    draft.updatedAt = '2026-11-08T10:00:00.000Z';

    await user.click(
      screen.getByRole('button', { name: 'Place 姓名缩写 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: '日期 on page 1' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: '姓名缩写 on page 1' }),
    ).not.toBeInTheDocument();
  });

  it('ignores editing keys on a published-only PDF and keeps the language tabs open', async () => {
    const zh = state.forms[0]!.languages.zh;
    zh.published = zh.draft;
    zh.draft = null;
    zh.published!.originalPdf = fakeOriginalPdf();
    zh.published!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    const user = await openChinese();
    const box = screen.getByRole('button', { name: '日期 on page 1' });

    fireEvent.keyDown(box, { key: 'Delete' });
    fireEvent.keyDown(box, { key: 'ArrowUp' });

    expect(
      screen.getByRole('button', { name: '日期 on page 1' }),
    ).toBeVisible();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'English' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Title signers see/)).toHaveValue(
      'Liability waiver',
    );
  });
});

describe('Original PDF revision across language switches', () => {
  it('saves positions with the revision of an upload that returned after switching language and back', async () => {
    const confirm = hold(
      'post',
      'http://localhost:3000/admin/documents/forms/:id/versions/zh/source/confirm',
    );
    const user = await openChinese();
    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    await waitFor(() => expect(confirm.started()).toBe(true));
    await user.click(screen.getByRole('tab', { name: 'English' }));
    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    confirm.release();
    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.originalPdf).not.toBeNull(),
    );
    const uploaded = state.forms[0]!.languages.zh.draft!.updatedAt;

    await user.click(
      await screen.findByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));

    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    expect(placementPuts()[0]!.expectedUpdatedAt).toBe(uploaded);
  });

  it('refuses a null positions revision, like the API', async () => {
    attachPdf();
    const placed = [{ key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 }];
    state.forms[0]!.languages.zh.draft!.placements = placed;
    await expect(
      api('/admin/documents/forms/form-waiver/versions/zh/placements', {
        method: 'PUT',
        body: { placements: [], expectedUpdatedAt: null },
      }),
    ).rejects.toMatchObject({ status: 500 });
    expect(state.forms[0]!.languages.zh.draft!.placements).toBe(placed);
  });
});

describe('PDF writes that return text changed by another admin', () => {
  const other = 'UNSEEN OTHER ADMIN';
  const otherAdminSaves = () => {
    const draft = state.forms[0]!.languages.zh.draft!;
    draft.title = other;
    draft.updatedAt = '2026-11-08T22:00:00.123456+00:00';
  };
  const title = () => screen.getByLabelText(/Title signers see/);
  const savedTitle = () => state.forms[0]!.languages.zh.draft!.title;
  const removePdf = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));
    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));
    await screen.findByText('PDF removed from this draft.');
  };

  async function expectSaveKeepsTheirText(
    user: ReturnType<typeof userEvent.setup>,
  ) {
    await waitFor(() => expect(title()).toHaveValue(other));
    await user.type(title(), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    expect(savedTitle()).toBe(`${other} 2`);
  }

  it('does not let Save draft overwrite their text after Remove PDF', async () => {
    attachPdf();
    const user = await openChinese();
    otherAdminSaves();

    await removePdf(user);

    await expectSaveKeepsTheirText(user);
  });

  it('does not let Save draft overwrite their text after Upload PDF', async () => {
    const user = await openChinese();
    otherAdminSaves();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    await screen.findByText('PDF uploaded. Place the fields on it next.');

    await expectSaveKeepsTheirText(user);
  });

  it('does not let Save draft overwrite their text after Save positions', async () => {
    attachPdf();
    server.use(
      http.put(
        PLACEMENTS_URL,
        async ({ request }) => {
          const draft = state.forms[0]!.languages.zh.draft!;
          draft.placements = (
            (await request.json()) as { placements: FormPlacement[] }
          ).placements;
          otherAdminSaves();
          return HttpResponse.json(state.forms[0]);
        },
        { once: true },
      ),
    );
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));

    await expectSaveKeepsTheirText(user);
  });

  it('shows their text quietly when nothing was edited', async () => {
    attachPdf();
    const user = await openChinese();
    otherAdminSaves();

    await removePdf(user);

    await waitFor(() => expect(title()).toHaveValue(other));
    expect(
      screen.queryByText(/changed by someone else/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
  });

  it('sets unsaved text aside behind Put my text back', async () => {
    attachPdf();
    const user = await openChinese();
    await user.type(title(), ' mine');
    otherAdminSaves();

    await removePdf(user);

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(title()).toHaveValue(other);
    await user.click(screen.getByRole('button', { name: 'Put my text back' }));
    expect(title()).toHaveValue('免责声明 mine');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    expect(savedTitle()).toBe('免责声明 mine');
  });

  it('keeps boxes placed while a positions save that returns their text was in flight', async () => {
    attachPdf();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    server.use(
      http.put(
        PLACEMENTS_URL,
        async ({ request }) => {
          const draft = state.forms[0]!.languages.zh.draft!;
          draft.placements = (
            (await request.json()) as { placements: FormPlacement[] }
          ).placements;
          await held;
          otherAdminSaves();
          return HttpResponse.json(state.forms[0]);
        },
        { once: true },
      ),
    );
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: 'Place 日期 on the PDF' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.placements).toHaveLength(1),
    );
    await user.click(
      screen.getByRole('button', { name: 'Place 姓名缩写 on the PDF' }),
    );
    release();

    await waitFor(() => expect(title()).toHaveValue(other));
    expect(
      screen.getByRole('button', { name: '姓名缩写 on page 1' }),
    ).toBeVisible();
    expect(publish()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    expect(
      placementPuts()
        .at(-1)!
        .placements.map((p) => p.key),
    ).toEqual(['date', 'initials']);
    expect(placementPuts().at(-1)!.expectedUpdatedAt).toBe(
      '2026-11-08T22:00:00.123456+00:00',
    );
    expect(savedTitle()).toBe(other);
  });

  it('keeps boxes placed while a re-upload of the same PDF that returns their text was in flight', async () => {
    state.forms[0]!.languages.zh.draft!.originalPdf = fakeOriginalPdf({
      sha256: '15'.padStart(64, '0'),
    });
    const confirm = hold(
      'post',
      'http://localhost:3000/admin/documents/forms/:id/versions/zh/source/confirm',
    );
    const user = await openChinese();

    await user.upload(screen.getByLabelText('Replace PDF'), pdfFile());
    await waitFor(() => expect(confirm.started()).toBe(true));
    await user.click(
      screen.getByRole('button', { name: 'Place 姓名缩写 on the PDF' }),
    );
    otherAdminSaves();
    confirm.release();

    await waitFor(() => expect(title()).toHaveValue(other));
    expect(
      screen.getByRole('button', { name: '姓名缩写 on page 1' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    expect(
      placementPuts()
        .at(-1)!
        .placements.map((p) => p.key),
    ).toEqual(['initials']);
    expect(savedTitle()).toBe(other);
  });

  it('reloads instead of saving over their text when an upload returns after switching language and back', async () => {
    const confirm = hold(
      'post',
      'http://localhost:3000/admin/documents/forms/:id/versions/zh/source/confirm',
    );
    const user = await openChinese();
    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    await waitFor(() => expect(confirm.started()).toBe(true));
    await user.click(screen.getByRole('tab', { name: 'English' }));
    await user.click(screen.getByRole('tab', { name: 'Chinese' }));
    otherAdminSaves();
    confirm.release();
    await waitFor(() =>
      expect(state.forms[0]!.languages.zh.draft!.originalPdf).not.toBeNull(),
    );

    await user.type(title(), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText(/changed by someone else, so it was reloaded/),
    ).toBeVisible();
    expect(savedTitle()).toBe(other);
  });
});
