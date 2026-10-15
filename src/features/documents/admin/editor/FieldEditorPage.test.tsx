import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  createEvent,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { fakePdfLoad, stubClientWidth } from '@/test/pdfMock';
import { loadPdf } from '../../pdf/pdfjs';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../../api/handlers';
import type { Field } from '../../api';
import { fakeAssignment } from '../../api/fixtures';
import { FieldEditorPage } from './FieldEditorPage';

vi.mock('../../pdf/pdfjs', () => ({ loadPdf: vi.fn() }));

interface RndProps {
  size: { width: number; height: number };
  position: { x: number; y: number };
  onDragStart?: () => void;
  onDragStop?: (e: unknown, d: { x: number; y: number }) => void;
  onResizeStop?: (
    e: unknown,
    dir: string,
    el: HTMLElement,
    delta: unknown,
    pos: { x: number; y: number },
  ) => void;
  children: ReactNode;
}

vi.mock('react-rnd', () => ({
  Rnd: ({
    size,
    position,
    onDragStart,
    onDragStop,
    onResizeStop,
    children,
  }: RndProps) => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetWidth', { value: size.width + 20 });
    Object.defineProperty(el, 'offsetHeight', { value: size.height + 10 });
    return (
      <div
        data-testid="rnd"
        data-rect={`${position.x},${position.y},${size.width},${size.height}`}
        onMouseDown={() => onDragStart?.()}
      >
        {children}
        <button
          type="button"
          onClick={() => {
            onDragStart?.();
            onDragStop?.(null, { x: position.x + 10, y: position.y - 20 });
          }}
        >
          drag
        </button>
        <button
          type="button"
          onClick={() =>
            onResizeStop?.(null, 'bottomRight', el, null, position)
          }
        >
          resize
        </button>
      </div>
    );
  },
}));

const API = 'http://localhost:3000';
let state: DocumentsMockState;
let puts: Field[][];
let restoreWidth: () => void;

beforeEach(() => {
  restoreWidth = stubClientWidth(612);
  state = createDocumentsState();
  state.assignments = state.assignments.filter(
    (a) => a.templateId !== 'tpl-conduct',
  );
  puts = [];
  vi.mocked(loadPdf).mockImplementation(() => fakePdfLoad([{}, {}]));
  server.use(
    http.put(
      `${API}/admin/documents/templates/:id/fields`,
      async ({ request }) => {
        puts.push(
          ((await request.clone().json()) as { fields: Field[] }).fields,
        );
        return undefined;
      },
    ),
    ...documentsHandlers(state),
  );
});

afterEach(() => restoreWidth());

function renderEditor(id = 'tpl-conduct') {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/documents/:id/edit" element={<FieldEditorPage />} />
    </Routes>,
    { route: `/admin/documents/${id}/edit` },
  );
}

const fieldButton = (label: string) =>
  screen.getByRole('button', { name: new RegExp(`field “${label}”`) });

const rectOf = (label: string) =>
  fieldButton(label).closest<HTMLElement>('[data-testid="rnd"]')!.dataset.rect;

describe('FieldEditorPage', () => {
  it('places saved fields at their PDF-point rects', async () => {
    renderEditor();
    await screen.findByText('Code of conduct');
    await screen.findByTestId('page-overlay-1');
    const rects = screen.getAllByTestId('rnd').map((r) => r.dataset.rect);
    expect(rects).toContain(`72,${792 - 120 - 36},180,36`);
    expect(screen.getByText('4 fields placed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save fields' })).toBeDisabled();
  });

  it('puts the field actions and size inputs ahead of the label inputs', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(fieldButton('Signature'));
    const panel = screen.getByText('Properties').parentElement!;
    const labelEn = within(panel).getByLabelText(/Label \(English\)/);
    for (const control of [
      within(panel).getByRole('button', { name: 'Duplicate' }),
      within(panel).getByRole('button', { name: 'Delete' }),
      within(panel).getByLabelText('w'),
      within(panel).getByLabelText('h'),
    ])
      expect(
        control.compareDocumentPosition(labelEn) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  it('edits properties of the selected field and saves via PUT', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(fieldButton('Signature'));
    const panel = screen.getByText('Properties').parentElement!;
    expect(within(panel).getByLabelText('x')).toHaveValue('72');
    await user.clear(within(panel).getByLabelText(/Label \(English\)/));
    expect(
      within(panel).getByText('This field is required.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save fields' })).toBeDisabled();
    await user.type(
      within(panel).getByLabelText(/Label \(English\)/),
      'Sign here',
    );
    await user.selectOptions(within(panel).getByLabelText('Type'), 'text');
    await user.selectOptions(within(panel).getByLabelText('Prefill'), 'email');
    await user.click(within(panel).getByLabelText('Required'));
    const y = within(panel).getByLabelText('y');
    await user.clear(y);
    await user.type(y, '5000{Enter}');
    const w = within(panel).getByLabelText('w');
    await user.clear(w);
    await user.type(w, 'abc');
    fireEvent.blur(w);
    expect(w).toHaveValue('180');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save fields' }));
    expect(await screen.findByText('Saved 4 fields.')).toBeInTheDocument();
    const saved = puts[0]!.find((f) => f.id === 'f_sig')!;
    expect(saved).toEqual({
      id: 'f_sig',
      type: 'text',
      page: 1,
      x: 72,
      y: 792 - 36,
      w: 180,
      h: 36,
      required: false,
      labelEn: 'Sign here',
      labelZh: '文本',
      prefill: 'email',
    });
    expect(state.templates[0]!.fields).toEqual(puts[0]);
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('keeps a committed position on its own field when another field is selected', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(fieldButton('Date'));
    const panel = () => screen.getByText('Properties').parentElement!;
    const y = within(panel()).getByLabelText('y');
    await user.clear(y);
    await user.type(y, '480{Enter}');
    await user.click(fieldButton('Signature'));
    expect(within(panel()).getByLabelText('y')).toHaveValue('120');
    expect(rectOf('Signature')).toBe('72,636,180,36');
    expect(rectOf('Date')).toBe('340,288,120,24');
    await user.click(fieldButton('Date'));
    expect(within(panel()).getByLabelText('y')).toHaveValue('480');
  });

  it('commits a typed position to its own field when focus leaves for another field', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(fieldButton('Date'));
    const panel = () => screen.getByText('Properties').parentElement!;
    const x = within(panel()).getByLabelText('x');
    await user.clear(x);
    await user.type(x, '300');
    await user.click(fieldButton('Signature'));
    expect(within(panel()).getByLabelText('x')).toHaveValue('72');
    expect(rectOf('Signature')).toBe('72,636,180,36');
    expect(rectOf('Date')).toBe('300,568,120,24');
    await user.type(within(panel()).getByLabelText(/Label \(English\)/), '!');
    await user.click(fieldButton('Date'));
    expect(within(panel()).getByLabelText('x')).toHaveValue('300');
    expect(within(panel()).getByLabelText(/Label \(English\)/)).toHaveValue(
      'Date',
    );
    expect(fieldButton('Signature!')).toBeInTheDocument();
  });

  it('adds a field from the palette and supports keyboard nudge, duplicate and delete', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(
      screen.getByRole('button', { name: 'Add Initials field' }),
    );
    expect(screen.getByText('5 fields placed')).toBeInTheDocument();
    const panel = screen.getByText('Properties').parentElement!;
    expect(within(panel).getByLabelText('x')).toHaveValue(String(306 - 30));
    expect(within(panel).getByLabelText('y')).toHaveValue(String(396 - 15));
    const initials = fieldButton('Initials');
    initials.focus();
    await user.keyboard('{ArrowRight}{Shift>}{ArrowUp}{/Shift}');
    expect(within(panel).getByLabelText('x')).toHaveValue(String(277));
    expect(within(panel).getByLabelText('y')).toHaveValue(String(391));
    await user.keyboard('{ArrowLeft}{ArrowDown}');
    expect(within(panel).getByLabelText('x')).toHaveValue(String(276));
    await user.keyboard('{Control>}d{/Control}');
    expect(screen.getByText('6 fields placed')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /field “Initials”/ }),
    ).toHaveLength(2);
    await user.keyboard('{Delete}');
    expect(screen.getByText('5 fields placed')).toBeInTheDocument();
    await user.click(fieldButton('Initials'));
    await user.keyboard('{Escape}');
    expect(screen.getByText('Select a field to edit it.')).toBeInTheDocument();
    await user.click(fieldButton('Initials'));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(screen.getByText('6 fields placed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('5 fields placed')).toBeInTheDocument();
  });

  it('drops a palette item where it lands on the page', async () => {
    renderEditor();
    const overlay = await screen.findByTestId('page-overlay-2');
    const data = new Map<string, string>();
    const dataTransfer = {
      types: ['application/x-ssms-field-type'],
      getData: (k: string) => data.get(k) ?? '',
      setData: (k: string, v: string) => data.set(k, v),
      effectAllowed: '',
    };
    fireEvent.dragStart(
      screen.getByRole('button', { name: 'Add Checkbox field' }),
      {
        dataTransfer,
      },
    );
    fireEvent.dragOver(overlay, { dataTransfer });
    const drop = createEvent.drop(overlay, { dataTransfer });
    Object.defineProperties(drop, {
      clientX: { value: 100 },
      clientY: { value: 700 },
    });
    fireEvent(overlay, drop);
    const panel = screen.getByText('Properties').parentElement!;
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(within(panel).getByLabelText('x')).toHaveValue('92');
    expect(within(panel).getByLabelText('y')).toHaveValue('84');
    fireEvent.drop(overlay, {
      dataTransfer: { ...dataTransfer, getData: () => 'bogus' },
    });
    expect(screen.getByText('5 fields placed')).toBeInTheDocument();
  });

  it('applies drag and resize results from react-rnd', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    const sig = fieldButton('Signature').parentElement!;
    await user.click(within(sig).getByRole('button', { name: 'drag' }));
    const panel = screen.getByText('Properties').parentElement!;
    expect(within(panel).getByLabelText('x')).toHaveValue('82');
    expect(within(panel).getByLabelText('y')).toHaveValue('140');
    await user.click(within(sig).getByRole('button', { name: 'resize' }));
    expect(within(panel).getByLabelText('w')).toHaveValue('200');
    expect(within(panel).getByLabelText('h')).toHaveValue('46');
    expect(within(panel).getByLabelText('y')).toHaveValue('130');
  });

  it('shows the API error when saving fails', async () => {
    server.use(
      http.put(`${API}/admin/documents/templates/:id/fields`, () =>
        HttpResponse.json(
          { message: 'Field f_sig is off the page' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(screen.getByRole('button', { name: 'Add Date field' }));
    await user.click(screen.getByRole('button', { name: 'Save fields' }));
    expect(
      await screen.findByText(
        'Couldn’t save fields: Field f_sig is off the page',
      ),
    ).toBeInTheDocument();
  });

  it('previews fields as the signer sees them', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(screen.getByRole('button', { name: 'Preview as signer' }));
    expect(screen.queryAllByTestId('rnd')).toHaveLength(0);
    expect(screen.getByTestId('preview-f_name')).toHaveTextContent(
      'Alex Sample',
    );
    expect(screen.getByTestId('preview-f_date')).toHaveTextContent(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(screen.getByTestId('preview-f_sig')).toHaveTextContent(
      'Signature — tap to sign',
    );
    expect(
      screen.queryByRole('button', { name: 'Add Text field' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to editing' }));
    expect(screen.getAllByTestId('rnd')).toHaveLength(4);
  });

  it('opens the assign dialog', async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId('page-overlay-1');
    await user.click(screen.getByRole('button', { name: 'Assign…' }));
    expect(
      screen.getByRole('dialog', { name: 'Assign “Code of conduct”' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains read documents and missing PDFs', async () => {
    const { unmount } = renderEditor('tpl-handbook');
    expect(
      await screen.findByText(/Read documents have no fields/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save fields' }),
    ).not.toBeInTheDocument();
    unmount();
    renderEditor('tpl-draft');
    expect(
      await screen.findByText(
        /Upload this document’s PDF from the documents list/,
      ),
    ).toBeInTheDocument();
  });

  it('locks field placement once a copy has been signed', async () => {
    renderEditor('tpl-waiver');
    await screen.findByText('Liability waiver');
    expect(
      screen.getByRole('button', { name: 'Save fields' }),
    ).toBeInTheDocument();
    state.assignments.push(
      fakeAssignment({
        id: 'asg-w-done',
        templateId: 'tpl-waiver',
        status: 'completed',
      }),
    );
    cleanup();
    renderEditor('tpl-waiver');
    expect(
      await screen.findByText(/Someone has completed this document/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save fields' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add Signature field' }),
    ).not.toBeInTheDocument();
  });

  it('shows an error for an unknown template', async () => {
    renderEditor('nope');
    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  it('places a new field on the page last clicked', async () => {
    const user = userEvent.setup();
    renderEditor();
    const second = await screen.findByTestId('page-overlay-2');
    fireEvent.mouseDown(second);
    await user.click(
      screen.getByRole('button', { name: 'Add Signature field' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument(),
    );
    fireEvent.mouseDown(screen.getByTestId('page-overlay-1'));
    expect(screen.getByText('Select a field to edit it.')).toBeInTheDocument();
  });
});
