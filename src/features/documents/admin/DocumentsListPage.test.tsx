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
import { fakeField } from '../api/fixtures';

const API = 'http://localhost:3000';

let state: DocumentsMockState;
let patches: { id: string; body: unknown }[];
let assignBodies: unknown[];
let publishBodies: { id: string; body: unknown }[];

beforeEach(() => {
  state = createDocumentsState({
    instructorIds: ['inst-1', 'inst-2'],
    pendingInstructorIds: ['inst-3', 'inst-4', 'inst-5'],
  });
  patches = [];
  assignBodies = [];
  publishBodies = [];
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
    http.post(
      `${API}/admin/documents/templates/:id/publish`,
      async ({ request, params }) => {
        publishBodies.push({
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

async function openEdit(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
) {
  await user.click(
    await screen.findByRole('button', { name: `Edit ${title}` }),
  );
  return screen.getByText('Edit document').closest('div')!
    .parentElement as HTMLElement;
}

function makePublishable(id = 'tpl-draft') {
  const tpl = state.templates.find((x) => x.id === id)!;
  Object.assign(tpl, {
    sourceSha256: 'ab'.repeat(32),
    sourceUrl: 'https://storage.mock/templates/tpl-draft/source.pdf',
    pageCount: 1,
    pages: [{ x: 0, y: 0, width: 612, height: 792, rotate: 0 }],
    fields: [fakeField()],
  });
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
      within(row('Uniform policy')).getByText('Draft'),
    ).toBeInTheDocument();
    expect(within(row('Uniform policy')).getByText('—')).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).getByText('Live'),
    ).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).getByText('All instructors'),
    ).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).getByText('Selected'),
    ).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).getByText(
        '1 of 2 approved assigned · 1 signed',
      ),
    ).toBeInTheDocument();
    expect(
      within(row('Instructor handbook')).getByText(
        '1 of 2 approved assigned · 1 acknowledged',
      ),
    ).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).getByText('1 instructors'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /Active/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Assign Uniform policy' }),
    ).not.toBeInTheDocument();
    const publish = screen.getByRole('button', {
      name: 'Publish Uniform policy',
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Upload a PDF before publishing.',
    );
    expect(publish.parentElement).toHaveAttribute(
      'title',
      'Upload a PDF before publishing.',
    );
    expect(
      within(row('Uniform policy')).getByRole('button', { name: 'Upload PDF' }),
    ).toBeEnabled();
    expect(
      within(row('Code of conduct')).getByRole('button', {
        name: 'Assign Code of conduct',
      }),
    ).toHaveTextContent('Assign more');
    expect(
      within(row('Liability waiver')).getByRole('button', {
        name: 'Assign Liability waiver',
      }),
    ).toHaveTextContent(/^Assign$/);
    expect(
      within(row('Code of conduct')).getByRole('button', {
        name: 'Retire Code of conduct',
      }),
    ).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).queryByRole('button', {
        name: 'Replace PDF',
      }),
    ).not.toBeInTheDocument();
  });

  it('explains why a sign document without fields cannot be published', async () => {
    const tpl = state.templates.find((x) => x.id === 'tpl-draft')!;
    makePublishable();
    tpl.fields = [];
    renderWithProviders(<DocumentsListPage />);
    const publish = await screen.findByRole('button', {
      name: 'Publish Uniform policy',
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Place at least one field before publishing.',
    );
    expect(
      within(row('Uniform policy')).getByRole('link', {
        name: 'Open editor for Uniform policy',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-draft/edit');
  });

  it('publishes to all instructors with the counts from publish-preview', async () => {
    makePublishable();
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Publish Uniform policy' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Publish “Uniform policy”',
    });
    expect(
      within(dialog).getByText(
        "Instructors can see and sign it once it's published.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/All instructors/)).toBeChecked();
    expect(await within(dialog).findByLabelText(/Season/)).toHaveValue(
      '2026/27',
    );
    const summary = await within(dialog).findByTestId('publish-summary');
    expect(summary).toHaveTextContent(
      'Assigns now to 2 approved instructors and emails them.',
    );
    expect(summary).toHaveTextContent(
      '3 pending instructors get it automatically when you approve them.',
    );
    await user.click(within(dialog).getByLabelText(/Selected instructors/));
    expect(within(dialog).queryByTestId('publish-summary')).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Publish' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/All instructors/));
    await user.click(
      within(dialog).getByRole('button', { name: 'Publish and email 2' }),
    );
    expect(
      await screen.findByText(
        'Uniform policy is live. Assigned to 2 instructors.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(publishBodies).toEqual([
      { id: 'tpl-draft', body: { assignTo: 'all', season: '2026/27' } },
    ]);
    await waitFor(() =>
      expect(
        within(row('Uniform policy')).getByText('Live'),
      ).toBeInTheDocument(),
    );
    expect(
      within(row('Uniform policy')).getByText(
        '2 of 2 approved assigned · 0 signed',
      ),
    ).toBeInTheDocument();
  });

  it('publishes for selected instructors and a different season', async () => {
    makePublishable();
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Publish Uniform policy' }),
    );
    const dialog = screen.getByRole('dialog');
    const season = await within(dialog).findByLabelText(/Season/);
    await waitFor(() => expect(season).toHaveValue('2026/27'));
    await user.clear(season);
    await user.type(season, '2027');
    expect(
      within(dialog).getByText('Use the form 2026/27.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /^Publish/ }),
    ).toBeDisabled();
    await user.type(season, '/28');
    await user.click(within(dialog).getByLabelText(/Selected instructors/));
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(publishBodies).toEqual([
        { id: 'tpl-draft', body: { assignTo: 'selected', season: '2027/28' } },
      ]),
    );
    expect(
      await screen.findByText(
        'Uniform policy is live. Assigned to 0 instructors.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row('Uniform policy')).getByText('Selected'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the API error when publishing fails', async () => {
    makePublishable();
    server.use(
      http.post(`${API}/admin/documents/templates/:id/publish`, () =>
        HttpResponse.json({ message: 'Already live' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Publish Uniform policy' }),
    );
    const dialog = screen.getByRole('dialog');
    await user.click(
      await within(dialog).findByRole('button', {
        name: 'Publish and email 2',
      }),
    );
    expect(await within(dialog).findByText('Already live')).toBeInTheDocument();
  });

  it('retires a live document and re-publishes it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Retire Liability waiver' }),
    );
    expect(
      await screen.findByText(
        'Liability waiver is retired. Existing assignments are kept.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row('Liability waiver')).getByText('Retired'),
      ).toBeInTheDocument(),
    );
    expect(within(row('Liability waiver')).getByText('—')).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).queryByRole('button', {
        name: 'Assign Liability waiver',
      }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Re-publish Liability waiver' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Publish “Liability waiver”',
    });
    const summary = await within(dialog).findByTestId('publish-summary');
    expect(summary).toHaveTextContent(
      'Assigns now to 1 approved instructors and emails them.',
    );
    expect(summary).toHaveTextContent(
      "1 already have it and won't be emailed again.",
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Publish and email 1' }),
    );
    expect(
      await screen.findByText(
        'Liability waiver is live. Assigned to 1 instructors.',
      ),
    ).toBeInTheDocument();
    expect(publishBodies).toEqual([
      { id: 'tpl-waiver', body: { assignTo: 'all', season: '2026/27' } },
    ]);
  });

  it('shows the API error when retiring fails', async () => {
    server.use(
      http.post(`${API}/admin/documents/templates/:id/retire`, () =>
        HttpResponse.json({ message: 'Not live' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Retire Liability waiver' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Not live');
  });

  it('locks Replace PDF and Place fields once a copy has been completed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const editor = await openEdit(user, 'Code of conduct');
    const replace = within(editor).getByRole('button', { name: 'Replace PDF' });
    expect(replace).toBeDisabled();
    const reason =
      "Someone has completed this document, so its PDF and fields can't change. Retire it and publish a new one.";
    expect(replace).toHaveAccessibleDescription(reason);
    expect(
      within(editor).getByRole('button', { name: 'Place fields' }),
    ).toBeDisabled();
    expect(within(editor).getByText(reason)).toBeInTheDocument();
    expect(
      within(editor).getByLabelText('Upload PDF for Code of conduct'),
    ).toBeDisabled();
  });

  it('shows status and audience counts in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('行为准则');
    const conduct = screen.getByText('行为准则').closest('tr') as HTMLElement;
    expect(within(conduct).getByText('已发布')).toBeInTheDocument();
    expect(
      within(conduct).getByText('已分配 1/2 位已审核教练 · 1 人已签署'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 位教练')).toBeInTheDocument();
  });

  it('toggles required with PATCH', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('switch', { name: 'Required: Code of conduct' }),
    );
    await waitFor(() =>
      expect(patches).toEqual([
        { id: 'tpl-conduct', body: { required: false } },
      ]),
    );
  });

  it('edits metadata and only sends changed keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const editor = await openEdit(user, 'Liability waiver');
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
    const editor = await openEdit(user, 'Liability waiver');
    const input = within(editor).getByLabelText(
      'Upload PDF for Liability waiver',
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
    const input = await screen.findByLabelText('Upload PDF for Uniform policy');
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
    const input = await screen.findByLabelText('Upload PDF for Uniform policy');
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
      within(dialog).getByText('Use the form 2026/27.'),
    ).toBeInTheDocument();
    await user.clear(season);
    await user.type(season, '2027/28');
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      await within(dialog).findByText(
        'Assigned to 2. Skipped 0 who already had it for this season.',
      ),
    ).toBeInTheDocument();
    expect(assignBodies).toEqual([
      {
        templateId: 'tpl-conduct',
        season: '2027/28',
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
    expect(seasonFor(new Date(2026, 6, 31))).toBe('2025/26');
    expect(seasonFor(new Date(2026, 7, 1))).toBe('2026/27');
    expect(seasonFor(new Date(2099, 9, 1))).toBe('2099/00');
  });
});
