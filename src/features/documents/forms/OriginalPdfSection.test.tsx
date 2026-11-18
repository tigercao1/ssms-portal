import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  storedPlacement,
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

const draftPuts = (lang = 'zh') =>
  state.requests
    .filter(
      (r) =>
        r.method === 'PUT' &&
        r.path === `/admin/documents/forms/form-waiver/versions/${lang}`,
    )
    .map(
      (r) =>
        r.body as {
          fields: { key: string; type: string; label: string }[];
          placements: FormPlacement[];
        },
    );

const saveDraft = () => screen.getByRole('button', { name: 'Save draft' });
const boxesOnPage = (page: number) =>
  screen.getAllByRole('button', { name: new RegExp(` on page ${page}$`) });
const stackedNote =
  'Fields that were not on the PDF yet were put at the top of page 1. Drag them into place, then save.';
const selectedField = () => within(screen.getByLabelText('Selected field'));

describe('Original PDF on a signing form', () => {
  it('uploads a PDF through the presigned URL and puts the existing fields on page 1', async () => {
    const user = await openChinese();
    expect(publish()).toBeEnabled();
    expect(
      screen.getByText(
        'No original PDF. The signed copy is made from the text.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('list', { name: 'Fields' })).toBeVisible();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());

    expect(await screen.findByText(stackedNote)).toBeVisible();
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
    expect(
      screen.queryByRole('list', { name: 'Fields' }),
    ).not.toBeInTheDocument();
    expect(boxesOnPage(1)).toHaveLength(6);
    expect(screen.getByText('Unsaved changes')).toBeVisible();
    expect(publish()).toBeDisabled();
    await user.click(
      within(screen.getAllByTestId('rnd')[0]!).getByRole('button', {
        name: 'drag',
      }),
    );
    expect(screen.queryByText(stackedNote)).not.toBeInTheDocument();
    expect(screen.queryByText(/^PDF uploaded/)).not.toBeInTheDocument();

    await user.click(saveDraft());
    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    const put = draftPuts().at(-1)!;
    expect(put.placements.map((p) => [p.key, p.page])).toEqual(
      put.fields.map((f) => [f.key, 1]),
    );
    const tops = put.placements.map((p) => p.y + p.h);
    expect(tops).toEqual([...tops].sort((a, b) => b - a));
    expect(screen.queryByText(stackedNote)).not.toBeInTheDocument();
    expect(publish()).toBeEnabled();
  });

  it('saves a draft first when the PDF goes on a language with only a published version', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
      </Routes>,
      { route: '/admin/signing-forms/form-waiver', dataRouter: true },
    );
    await screen.findByRole('tab', { name: 'English' });
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());

    expect(await screen.findByText(stackedNote)).toBeVisible();
    expect(state.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'PUT /admin/documents/forms/form-waiver/versions/en',
      'POST /admin/documents/forms/form-waiver/versions/en/source/upload-url',
      'POST /admin/documents/forms/form-waiver/versions/en/source/confirm',
    ]);
    expect(state.forms[0]!.languages.en.draft!.originalPdf).not.toBeNull();
  });

  it('asks for fields after a PDF goes on a form that has none', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/signing-forms/:id" element={<FormEditorPage />} />
      </Routes>,
      { route: '/admin/signing-forms/form-rental', dataRouter: true },
    );
    await screen.findByRole('tab', { name: 'English' });
    const user = userEvent.setup({ applyAccept: false });

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());

    expect(
      await screen.findByText(
        'PDF uploaded. Use "Add a field" to put fields on it.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(stackedNote)).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Add a Full name field to the PDF' }),
    );
    expect(screen.queryByText(/^PDF uploaded/)).not.toBeInTheDocument();
  });

  it('adds a new field of every type onto the PDF and saves them with the draft', async () => {
    attachPdf();
    const user = await openChinese();

    for (const type of [
      'Text',
      'Full name',
      'Email',
      'Date',
      'Checkbox',
      'Initials',
      'Signature',
    ])
      await user.click(
        screen.getByRole('button', { name: `Add a ${type} field to the PDF` }),
      );
    const key = selectedField().getByLabelText('Key');
    await user.clear(key);
    await user.type(key, 'renter_signature');
    const label = selectedField().getByLabelText('Label');
    await user.clear(label);
    await user.type(label, '租用人签名');
    expect(
      screen.getByRole('button', { name: '租用人签名 on page 1' }),
    ).toBeVisible();
    await user.click(saveDraft());

    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    const put = draftPuts().at(-1)!;
    expect(put.fields.slice(6)).toEqual([
      { key: 'text', type: 'text', label: '文本', required: false },
      { key: 'full_name', type: 'full_name', label: '姓名', required: true },
      { key: 'email_2', type: 'email', label: '电子邮箱', required: true },
      { key: 'date_2', type: 'date', label: '日期', required: true },
      { key: 'checkbox', type: 'checkbox', label: '复选框', required: false },
      {
        key: 'initials_2',
        type: 'initials',
        label: '姓名缩写',
        required: true,
      },
      {
        key: 'renter_signature',
        type: 'signature',
        label: '租用人签名',
        required: true,
      },
    ]);
    expect(put.placements.slice(6).map((p) => [p.key, p.page])).toEqual([
      ['text', 1],
      ['full_name', 1],
      ['email_2', 1],
      ['date_2', 1],
      ['checkbox', 1],
      ['initials_2', 1],
      ['renter_signature', 1],
    ]);
    expect(state.forms[0]!.languages.zh.draft!.placements).toHaveLength(13);
  });

  it('adds a field where its type is dropped on a page', async () => {
    attachPdf();
    await openChinese();

    fireEvent.drop(screen.getByTestId('placement-overlay-2'), {
      dataTransfer: { getData: () => 'checkbox', types: [] },
      clientX: 120,
      clientY: 80,
    });

    expect(
      screen.getByRole('button', { name: '复选框 on page 2' }),
    ).toBeVisible();
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });

  it('moves and deletes fields on the PDF, saves them with the draft and publishes', async () => {
    attachPdf();
    const user = await openChinese();

    expect(publish()).toBeDisabled();
    expect(
      screen.getByText(
        'Save your changes before publishing or changing the PDF.',
      ),
    ).toBeVisible();
    const before = screen
      .getAllByTestId('rnd')[0]!
      .getAttribute('data-rect')!
      .split(',')
      .map(Number);
    await user.click(
      within(screen.getAllByTestId('rnd')[0]!).getByRole('button', {
        name: 'drag',
      }),
    );
    expect(screen.getAllByTestId('rnd')[0]).toHaveAttribute(
      'data-rect',
      `${before[0]! + 10},${before[1]! - 20},${before[2]},${before[3]}`,
    );
    fireEvent.keyDown(
      screen.getByRole('button', { name: '姓名缩写 on page 1' }),
      { key: 'Delete' },
    );
    await user.click(
      screen.getByRole('button', { name: '证件号码 on page 1' }),
    );
    await user.click(
      selectedField().getByRole('button', { name: 'Delete field' }),
    );
    await user.click(saveDraft());

    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    const put = draftPuts().at(-1)!;
    expect(put.fields.map((f) => f.key)).toEqual([
      'participant_name',
      'email',
      'date',
      'participant_signature',
    ]);
    expect(put.placements.map((p) => p.key)).toEqual([
      'participant_name',
      'email',
      'date',
      'participant_signature',
    ]);
    expect(put.placements[0]!.y).toBe(
      put.placements[1]!.y + put.placements[1]!.h + 8 + 20,
    );
    expect(publish()).toBeEnabled();
    await user.click(publish());
    expect(
      await screen.findByText(
        'Published version 1 in Chinese. The public link now shows it.',
      ),
    ).toBeVisible();
  });

  it('edits the type, key, label and required flag of a field from its box', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
    ];
    const user = await openChinese();

    await user.click(screen.getByRole('button', { name: '日期 on page 1' }));
    expect(
      selectedField().queryByRole('button', {
        name: /Place again|Remove from PDF/,
      }),
    ).not.toBeInTheDocument();
    await user.selectOptions(selectedField().getByLabelText('Type'), 'text');
    const key = selectedField().getByLabelText('Key');
    await user.clear(key);
    await user.type(key, 'signed_on');
    const label = selectedField().getByLabelText('Label');
    await user.clear(label);
    await user.type(label, '签署地点');
    await user.click(
      selectedField().getByRole('switch', { name: 'Required: 签署地点' }),
    );
    expect(
      screen.getByRole('button', { name: '签署地点 on page 1' }),
    ).toBeVisible();
    await user.click(saveDraft());

    await screen.findByText('Draft v1 saved.');
    const put = draftPuts().at(-1)!;
    expect(put.fields[2]).toEqual({
      key: 'signed_on',
      type: 'text',
      label: '签署地点',
      required: false,
    });
    expect(put.placements[0]).toMatchObject({
      key: 'signed_on',
      page: 1,
      x: 100,
      y: 600,
    });
  });

  it('marks the boxes of fields with a bad key and names the signer fields', async () => {
    attachPdf();
    const user = await openChinese();

    await user.click(
      screen.getByRole('button', { name: '电子邮箱 on page 1' }),
    );
    expect(selectedField().getByText('Signer email')).toBeVisible();
    const key = selectedField().getByLabelText('Key');
    await user.clear(key);
    await user.type(key, 'date');

    expect(
      screen.getByRole('button', { name: '日期 on page 1' }),
    ).toHaveAttribute('aria-invalid', 'true');
    expect(
      selectedField().getByText('Another field already uses this key.'),
    ).toBeVisible();
    expect(
      screen.getByText('Fix the highlighted fields before saving.'),
    ).toBeVisible();
    expect(saveDraft()).toBeDisabled();
  });

  it('deletes one box of a field placed twice, then the field with its last box', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
      { key: 'date', page: 2, x: 100, y: 600, w: 110, h: 22 },
    ];
    const user = await openChinese();

    await user.click(screen.getByRole('button', { name: '日期 on page 2' }));
    await user.click(
      selectedField().getByRole('button', { name: 'Delete field' }),
    );
    expect(
      screen.queryByRole('button', { name: '日期 on page 2' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '日期 on page 1' }));
    await user.click(
      selectedField().getByRole('button', { name: 'Delete field' }),
    );

    expect(
      screen.queryByRole('button', { name: /^日期 on page/ }),
    ).not.toBeInTheDocument();
    await user.click(saveDraft());
    await screen.findByText('Draft v1 saved.');
    const put = draftPuts().at(-1)!;
    expect(put.fields.map((f) => f.key)).not.toContain('date');
    expect(put.placements.map((p) => p.key)).not.toContain('date');
  });

  it('shows the API message when the saved positions are rejected', async () => {
    attachPdf();
    const user = await openChinese();
    state.forms[0]!.languages.zh.draft!.originalPdf!.pages = [];
    await user.click(saveDraft());

    expect(
      await screen.findByText(
        'Could not save the draft: The field positions are not valid: participant_name is on page 1, but the PDF has 0 page(s)',
      ),
    ).toBeVisible();
  });

  it('asks to save first before the PDF changes', async () => {
    attachPdf();
    const user = await openChinese();
    await user.type(screen.getByLabelText(/Title signers see/), ' 2');

    expect(
      screen.getByText(
        'Save your changes before publishing or changing the PDF.',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Replace PDF')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove PDF' })).toBeDisabled();
  });

  it('edits a published PDF into a new draft', async () => {
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
    const user = userEvent.setup();
    await screen.findByRole('button', { name: 'Date on page 1' });
    expect(screen.getByText(stackedNote)).toBeVisible();
    expect(boxesOnPage(1)).toHaveLength(6);

    await user.click(saveDraft());

    expect(await screen.findByText('Draft v2 saved.')).toBeVisible();
    expect(
      draftPuts('en')
        .at(-1)!
        .placements.map((p) => p.key),
    ).toEqual([
      'date',
      'participant_name',
      'email',
      'id_number',
      'initials',
      'participant_signature',
    ]);
    expect(state.forms[0]!.languages.en.draft!.originalPdf).not.toBeNull();
  });

  it('does not mark positions unsaved when the API returns them in its own key order', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'participant_name', page: 1, x: 100, y: 700, w: 200, h: 22 },
      { key: 'email', page: 1, x: 100, y: 650, w: 200, h: 22 },
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
      { key: 'id_number', page: 1, x: 100, y: 550, w: 200, h: 22 },
      { key: 'initials', page: 1, x: 100, y: 500, w: 60, h: 30 },
      { key: 'participant_signature', page: 2, x: 100, y: 100, w: 180, h: 36 },
    ].map(storedPlacement);
    await openChinese();

    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(saveDraft()).toBeDisabled();
    expect(publish()).toBeEnabled();
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

    expect(await screen.findByText('Published v1')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Remove PDF' }),
    ).not.toBeInTheDocument();
  });

  it('moves the fields to page 1 when a replacement PDF has different pages', async () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = [
      { key: 'date', page: 2, x: 100, y: 600, w: 110, h: 22 },
    ];
    state.nextPageCount = 3;
    const user = await openChinese();
    await user.click(saveDraft());
    await screen.findByText('Draft v1 saved.');

    await user.upload(screen.getByLabelText('Replace PDF'), pdfFile());

    expect(
      await screen.findByText(
        'PDF replaced. The pages changed, so the fields were moved to the top of page 1. Drag them into place, then save.',
      ),
    ).toBeVisible();
    expect(boxesOnPage(1)).toHaveLength(6);
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });

  it('removes the PDF after a confirmation', async () => {
    attachPdf();
    const user = await openChinese();
    expect(publish()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Remove PDF' }));
    expect(
      screen.getByText(
        'Remove the PDF from this draft? The fields stay, without their positions.',
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
    expect(
      within(screen.getByRole('list', { name: 'Fields' })).getAllByRole(
        'group',
      ),
    ).toHaveLength(6);
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

  it('keeps Publish disabled while a PDF upload is in flight', async () => {
    const upload = hold('put', 'https://storage.mock/upload/forms/:id/:file');
    const user = await openChinese();

    await user.upload(screen.getByLabelText('Upload PDF'), pdfFile());
    await waitFor(() => expect(upload.started()).toBe(true));
    expect(publish()).toBeDisabled();

    upload.release();
    expect(await screen.findByText(stackedNote)).toBeVisible();
    expect(state.forms[0]!.languages.zh.published).toBeNull();
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
    await screen.findByText(stackedNote);

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

describe('Signing order on a PDF form', () => {
  const placed = (): FormPlacement[] =>
    [
      { key: 'participant_name', page: 1, x: 100, y: 700, w: 200, h: 22 },
      { key: 'email', page: 1, x: 100, y: 650, w: 200, h: 22 },
      { key: 'date', page: 1, x: 100, y: 600, w: 110, h: 22 },
      { key: 'id_number', page: 1, x: 100, y: 550, w: 200, h: 22 },
      { key: 'initials', page: 2, x: 100, y: 500, w: 60, h: 30 },
      { key: 'participant_signature', page: 2, x: 100, y: 100, w: 180, h: 36 },
    ].map(storedPlacement);
  const placeChinese = () => {
    attachPdf();
    state.forms[0]!.languages.zh.draft!.placements = placed();
  };
  const orderList = () => screen.getByRole('list', { name: 'Signing order' });
  const rows = () =>
    within(orderList())
      .getAllByRole('listitem')
      .map((li) =>
        [...within(li).getAllByRole('button')[0]!.children]
          .filter((c) => !c.hasAttribute('aria-hidden'))
          .map((c) => c.textContent)
          .join(' '),
      );
  const row = (n: number) =>
    within(orderList()).getByRole('button', { name: new RegExp(`^${n}\\.`) });

  it('moves a field up and down with its buttons, keeps focus on them and saves the new order', async () => {
    placeChinese();
    const user = await openChinese();
    expect(rows()).toEqual([
      '1. 参与者姓名 * p. 1',
      '2. 电子邮箱 * p. 1',
      '3. 日期 * p. 1',
      '4. 证件号码 p. 1',
      '5. 姓名缩写 p. 2',
      '6. 参与者签名 * p. 2',
    ]);
    expect(
      screen.getByText(
        'Signers see the fields in this order. It does not change where answers are printed on the PDF.',
      ),
    ).toBeVisible();
    expect(saveDraft()).toBeDisabled();

    const up = screen.getByRole('button', { name: 'Move 电子邮箱 up' });
    await user.click(up);
    expect(rows()[0]).toBe('1. 电子邮箱 * p. 1');
    expect(
      screen.getByRole('button', { name: 'Move 电子邮箱 down' }),
    ).toHaveFocus();
    expect(
      screen.getByText('电子邮箱 moved to position 1 of 6.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Move 证件号码 down' }),
    );
    expect(
      screen.getByRole('button', { name: 'Move 证件号码 down' }),
    ).toHaveFocus();
    await user.click(saveDraft());

    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();
    const put = draftPuts().at(-1)!;
    expect(put.fields.map((f) => f.key)).toEqual([
      'email',
      'participant_name',
      'date',
      'initials',
      'id_number',
      'participant_signature',
    ]);
    expect(
      Object.fromEntries(put.placements.map((p) => [p.key, [p.page, p.y]])),
    ).toEqual(Object.fromEntries(placed().map((p) => [p.key, [p.page, p.y]])));
  });

  it('reorders from the keyboard', async () => {
    placeChinese();
    const user = await openChinese();

    screen.getByRole('button', { name: 'Move 参与者签名 up' }).focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(
      screen.getByRole('button', { name: 'Move 参与者签名 up' }),
    ).toHaveFocus();
    await user.keyboard('{Enter}{Enter}{Enter}');

    expect(rows()[0]).toMatch(/参与者签名/);
    expect(
      screen.getByRole('button', { name: 'Move 参与者签名 down' }),
    ).toHaveFocus();
    expect(
      screen.getByRole('button', { name: 'Move 参与者签名 up' }),
    ).toBeDisabled();
  });

  it('reorders by dragging a row onto another', async () => {
    placeChinese();
    await openChinese();

    const handles = screen.getAllByTestId('signing-order-handle');
    const targets = screen.getAllByTestId('signing-order-row');
    const dataTransfer = {
      setData: vi.fn(),
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(handles[3]!, { dataTransfer });
    fireEvent.dragOver(targets[0]!, { dataTransfer });
    fireEvent.drop(targets[0]!, { dataTransfer });
    fireEvent.dragEnd(handles[3]!, { dataTransfer });

    expect(rows()).toEqual([
      '1. 证件号码 p. 1',
      '2. 参与者姓名 * p. 1',
      '3. 电子邮箱 * p. 1',
      '4. 日期 * p. 1',
      '5. 姓名缩写 p. 2',
      '6. 参与者签名 * p. 2',
    ]);
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  });

  it('selects the field on the PDF when its row is clicked and only edits it in the Selected field panel', async () => {
    placeChinese();
    const user = await openChinese();
    fakePdf.scrollToRect.mockClear();

    await user.click(row(5));

    expect(selectedField().getByLabelText('Label')).toHaveValue('姓名缩写');
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    expect(fakePdf.scrollToRect).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ page: 2, y: 500 }),
    );
    expect(row(5)).toHaveAttribute('aria-current', 'true');
    expect(row(5)).toHaveFocus();
    expect(within(orderList()).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(orderList()).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(orderList()).queryByRole('switch')).not.toBeInTheDocument();
    expect(
      within(orderList()).queryByRole('button', { name: /Delete|Remove/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Add a Text field to the PDF' }),
    );
    expect(rows().at(-1)).toBe('7. 文本 p. 2');
  });

  it('orders each language on its own', async () => {
    placeChinese();
    const en = state.forms[0]!.languages.en.published!;
    en.originalPdf = fakeOriginalPdf();
    en.placements = placed();
    const user = await openChinese();

    await user.click(screen.getByRole('button', { name: 'Move 日期 up' }));
    await user.click(saveDraft());
    expect(await screen.findByText('Draft v1 saved.')).toBeVisible();

    await user.click(screen.getByRole('tab', { name: 'English' }));
    expect(rows()[1]).toBe('2. Email * p. 1');
    await user.click(
      screen.getByRole('button', { name: 'Move Participant signature up' }),
    );
    await user.click(saveDraft());
    expect(await screen.findByText('Draft v2 saved.')).toBeVisible();

    expect(
      draftPuts('zh')
        .at(-1)!
        .fields.map((f) => f.key),
    ).toEqual([
      'participant_name',
      'date',
      'email',
      'id_number',
      'initials',
      'participant_signature',
    ]);
    expect(
      draftPuts('en')
        .at(-1)!
        .fields.map((f) => f.key),
    ).toEqual([
      'participant_name',
      'email',
      'date',
      'id_number',
      'participant_signature',
      'initials',
    ]);
    expect(
      state.forms[0]!.languages.zh.draft!.fields.map((f) => f.key),
    ).toEqual(
      draftPuts('zh')
        .at(-1)!
        .fields.map((f) => f.key),
    );
  });
});
