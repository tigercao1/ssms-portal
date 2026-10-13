import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminInstructorRecord } from '@/lib/types';
import { DocumentsListPage } from './DocumentsListPage';
import { seasonFor } from './AssignDialog';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { buildSamplePdf } from '../api/samplePdf';

const API = 'http://localhost:3000';

let state: DocumentsMockState;
let patches: { id: string; body: unknown }[];
let assignBodies: unknown[];

beforeEach(() => {
  state = createDocumentsState({ instructorIds: ['inst-1', 'inst-2'] });
  patches = [];
  assignBodies = [];
  const li: AdminInstructorRecord = {
    ...(fakeAdminList[0] as AdminInstructorRecord),
    id: 'inst-2',
    email: 'li@example.com',
    displayNameEn: 'Li Wei',
    approvalStatus: 'approved',
  };
  server.use(
    http.patch(
      `${API}/admin/documents/templates/:id`,
      async ({ request, params }) => {
        patches.push({
          id: String(params.id),
          body: await request.clone().json(),
        });
        return undefined;
      },
    ),
    http.post(`${API}/admin/documents/assignments`, async ({ request }) => {
      assignBodies.push(await request.clone().json());
      return undefined;
    }),
    http.get(`${API}/admin/instructors`, () =>
      HttpResponse.json([...fakeAdminList, li]),
    ),
    ...documentsHandlers(state),
  );
});

function row(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('DocumentsListPage', () => {
  it('lists templates in sort order with kind, pages and state', async () => {
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    const titles = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0]?.textContent);
    expect(titles).toEqual([
      'Instructor handbook教练手册',
      'Code of conduct行为准则',
      'Liability waiver免责声明',
      'Uniform policy',
    ]);
    expect(
      within(row('Instructor handbook')).getByText('Read'),
    ).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).getByText('1 page'),
    ).toBeInTheDocument();
    expect(
      within(row('Uniform policy')).getByText('No PDF yet'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Assign Uniform policy' }),
    ).toBeDisabled();
    expect(
      within(row('Code of conduct')).getByRole('link', {
        name: 'Open editor for Code of conduct',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-conduct/edit');
  });

  it('toggles required and active with PATCH', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('switch', { name: 'Required: Code of conduct' }),
    );
    await user.click(
      screen.getByRole('switch', { name: 'Active: Uniform policy' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        { id: 'tpl-conduct', body: { required: false } },
        { id: 'tpl-draft', body: { isActive: true } },
      ]),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: 'Active: Uniform policy' }),
      ).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('edits metadata and only sends changed keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Liability waiver' }),
    );
    const editor = screen.getByText('Edit document').parentElement!;
    expect(within(editor).getByLabelText('Type')).toBeDisabled();
    const zh = within(editor).getByLabelText('Title (Chinese)');
    await user.clear(zh);
    await user.type(zh, '责任豁免');
    await user.type(
      within(editor).getByLabelText('Description (English)'),
      'Sign once',
    );
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patches).toEqual([
        {
          id: 'tpl-waiver',
          body: { titleZh: '责任豁免', descriptionEn: 'Sign once' },
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByText('Edit document')).not.toBeInTheDocument(),
    );
  });

  it('closes the editor without a request when nothing changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Edit Liability waiver' }),
    );
    await user.click(screen.getAllByRole('button', { name: 'Save' })[0]!);
    expect(patches).toEqual([]);
    expect(screen.queryByText('Edit document')).not.toBeInTheDocument();
  });

  it('creates a template and validates the title', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    const form = screen
      .getByText('New document')
      .closest('div')!.parentElement!;
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    expect(
      within(form).getByText('This field is required.'),
    ).toBeInTheDocument();
    await user.type(
      within(form).getByLabelText(/Title \(English\)/),
      'Handbook 2',
    );
    await user.selectOptions(within(form).getByLabelText('Type'), 'read');
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    expect(
      await screen.findByText('Created “Handbook 2”. Upload its PDF next.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Handbook 2', { selector: 'div' }),
    ).toBeInTheDocument();
    expect(state.templates.at(-1)).toMatchObject({
      titleEn: 'Handbook 2',
      kind: 'read',
      audience: 'instructor',
      required: true,
    });
  });

  it('uploads a PDF through the presigned URL then confirms', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const input = await screen.findByLabelText('Upload PDF for Uniform policy');
    const file = new File(
      [buildSamplePdf([{ width: 612, height: 792 }])],
      'policy.pdf',
      {
        type: 'application/pdf',
      },
    );
    await user.upload(input, file);
    expect(
      await screen.findByText('Uploaded the PDF for Uniform policy (1 page).'),
    ).toBeInTheDocument();
    expect(state.uploadedSources.has('tpl-draft')).toBe(true);
    await waitFor(() =>
      expect(
        within(row('Uniform policy')).getByText('1 page'),
      ).toBeInTheDocument(),
    );
  });

  it('warns when replacing a PDF cleared the fields', async () => {
    server.use(
      http.post(`${API}/admin/documents/templates/:id/source/confirm`, () =>
        HttpResponse.json({
          ...state.templates[0],
          fields: [],
          fieldsCleared: true,
        }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const input = await screen.findByLabelText(
      'Upload PDF for Code of conduct',
    );
    await user.upload(
      input,
      new File(['%PDF'], 'c.pdf', { type: 'application/pdf' }),
    );
    expect(
      await screen.findByText(/its placed fields were cleared/),
    ).toBeInTheDocument();
  });

  it('rejects non-PDF and oversize files before uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderWithProviders(<DocumentsListPage />);
    const input = await screen.findByLabelText(
      'Upload PDF for Code of conduct',
    );
    await user.upload(input, new File(['x'], 'a.png', { type: 'image/png' }));
    expect(await screen.findByText('Choose a PDF file.')).toBeInTheDocument();
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    await user.upload(input, big);
    expect(
      await screen.findByText('The PDF must be 20 MB or smaller.'),
    ).toBeInTheDocument();
    expect(state.uploadedSources.size).toBe(0);
  });

  it('shows the server reason when the upload fails', async () => {
    server.use(
      http.post(`${API}/admin/documents/templates/:id/source/upload-url`, () =>
        HttpResponse.json({ message: 'Storage offline' }, { status: 503 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const input = await screen.findByLabelText(
      'Upload PDF for Code of conduct',
    );
    await user.upload(
      input,
      new File(['%PDF'], 'c.pdf', { type: 'application/pdf' }),
    );
    expect(
      await screen.findByText('Upload failed: Storage offline'),
    ).toBeInTheDocument();
  });

  it('assigns to all active instructors for a season', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Assign Code of conduct' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Assign “Code of conduct”',
    });
    const season = within(dialog).getByLabelText(/Season/);
    expect(season).toHaveValue(seasonFor());
    await user.clear(season);
    await user.type(season, '2027');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      within(dialog).getByText('Use the form 2026-27.'),
    ).toBeInTheDocument();
    await user.clear(season);
    await user.type(season, '2027-28');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      await within(dialog).findByText(
        'Assigned to 2. Skipped 0 who already had it for this season.',
      ),
    ).toBeInTheDocument();
    expect(assignBodies).toEqual([
      {
        templateId: 'tpl-conduct',
        season: '2027-28',
        allActiveInstructors: true,
      },
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('assigns to picked instructors and requires a pick', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Assign Liability waiver' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Pick instructors'));
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      within(dialog).getByText('Pick at least one instructor.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Search instructors'), 'li');
    expect(within(dialog).queryByText('Jane Snow')).not.toBeInTheDocument();
    await user.click(await within(dialog).findByRole('checkbox'));
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    await within(dialog).findByText(/Assigned to 1/);
    expect(assignBodies).toEqual([
      {
        templateId: 'tpl-waiver',
        season: seasonFor(),
        instructorIds: ['inst-2'],
      },
    ]);
  });

  it('closes the dialog with Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Assign Code of conduct' }),
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an empty state and load errors', async () => {
    state.templates = [];
    const { unmount } = renderWithProviders(<DocumentsListPage />);
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    unmount();
    server.use(
      http.get(`${API}/admin/documents/templates`, () =>
        HttpResponse.json({ message: 'Nope' }, { status: 500 }),
      ),
    );
    renderWithProviders(<DocumentsListPage />);
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});

describe('seasonFor', () => {
  it('rolls over in August', () => {
    expect(seasonFor(new Date(2026, 6, 31))).toBe('2025-26');
    expect(seasonFor(new Date(2026, 7, 1))).toBe('2026-27');
    expect(seasonFor(new Date(2099, 9, 1))).toBe('2099-00');
  });
});
