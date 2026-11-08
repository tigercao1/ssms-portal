import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { fakePdf } from '../testing/fakePdfPages';
import {
  createFormsState,
  fakeOriginalPdf,
  formsHandlers,
  type FormsMockState,
} from './fixtures';
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
    { route: '/admin/signing-forms/form-waiver?lang=zh' },
  );
  await screen.findByRole('tab', { name: 'Chinese' });
  return userEvent.setup({ applyAccept: false });
}

const publish = () => screen.getByRole('button', { name: 'Publish' });

function attachPdf() {
  state.forms[0]!.languages.zh.draft!.originalPdf = fakeOriginalPdf();
}

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
    expect(screen.getByRole('tab', { name: 'English' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save positions' }));
    expect(await screen.findByText('Field positions saved.')).toBeVisible();
    const put = state.requests.find((r) => r.path.endsWith('/placements'));
    expect(put?.body).toEqual({
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

  it('shows a published PDF read-only until there is a draft', async () => {
    state.forms[0]!.languages.en.published!.originalPdf = fakeOriginalPdf();
    state.forms[0]!.languages.en.published!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    renderWithProviders(
      <Routes>
        <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
      </Routes>,
      { route: '/admin/signing-forms/form-waiver' },
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
});
