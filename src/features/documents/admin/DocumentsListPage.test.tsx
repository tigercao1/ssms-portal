import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeAdminList, fakeSeasons, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import type { AdminInstructorRecord } from '@/lib/types';
import { DocumentsListPage } from './DocumentsListPage';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { buildSamplePdf } from '../api/samplePdf';
import {
  MOCK_SEASON,
  fakeAssignment,
  fakeField,
  fakeTranslation,
} from '../api/fixtures';

const API = 'http://localhost:3000';

let state: DocumentsMockState;
let patches: { id: string; body: unknown }[];
let assignBodies: unknown[];
let publishBodies: { id: string; body: unknown }[];
let audienceBodies: { id: string; body: unknown }[];
let previewSeasons: (string | null)[];

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  state = createDocumentsState({
    instructorIds: ['inst-1', 'inst-2'],
    pendingInstructorIds: ['inst-3', 'inst-4', 'inst-5'],
  });
  patches = [];
  assignBodies = [];
  publishBodies = [];
  audienceBodies = [];
  previewSeasons = [];
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
    http.post(
      `${API}/admin/documents/templates/:id/audience`,
      async ({ request, params }) => {
        audienceBodies.push({
          id: String(params.id),
          body: await request.clone().json(),
        });
        return undefined;
      },
    ),
    http.get(
      `${API}/admin/documents/templates/:id/publish-preview`,
      ({ request }) => {
        previewSeasons.push(new URL(request.url).searchParams.get('season'));
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

type User = ReturnType<typeof userEvent.setup>;

async function openActions(user: User, title: string) {
  await user.click(
    await screen.findByRole('button', { name: `More actions for ${title}` }),
  );
  return screen.getByRole('menu');
}

async function chooseAction(user: User, title: string, name: string) {
  const menu = await openActions(user, title);
  await user.click(within(menu).getByRole('menuitem', { name }));
}

async function actionNames(user: User, title: string) {
  const menu = await openActions(user, title);
  const names = within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.getAttribute('aria-label') ?? item.textContent);
  await user.keyboard('{Escape}');
  return names;
}

async function openEdit(user: User, title: string) {
  await chooseAction(user, title, `Edit ${title}`);
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
    const user = userEvent.setup();
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
      within(row('Code of conduct')).getByText('1 signed'),
    ).toBeInTheDocument();
    expect(
      within(row('Instructor handbook')).getByText('1 acknowledged'),
    ).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).getByText('1 instructors'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /Active/ }),
    ).not.toBeInTheDocument();
    expect(await actionNames(user, 'Uniform policy')).toEqual([
      'Edit Uniform policy',
      'Upload PDF',
      'Delete Uniform policy',
    ]);
    const publish = within(row('Uniform policy')).getByRole('button', {
      name: 'Publish Uniform policy',
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Upload a PDF before publishing.',
    );
    const menu = await openActions(user, 'Uniform policy');
    expect(
      within(menu).getByRole('menuitem', { name: 'Upload PDF' }),
    ).not.toHaveAttribute('aria-disabled');
    await user.keyboard('{Escape}');
    expect(await actionNames(user, 'Code of conduct')).toEqual([
      'Edit Code of conduct',
      'Change audience of Code of conduct',
      'Retire Code of conduct',
      'Delete Code of conduct',
    ]);
    expect(await actionNames(user, 'Liability waiver')).toEqual([
      'Edit Liability waiver',
      'Assign Liability waiver',
      'Change audience of Liability waiver',
      'Retire Liability waiver',
      'Delete Liability waiver',
    ]);
    await openActions(user, 'Liability waiver');
    expect(
      screen.getByRole('menuitem', { name: 'Assign Liability waiver' }),
    ).toHaveTextContent(/^Assign$/);
  });

  it('explains why a sign document without fields cannot be published', async () => {
    const tpl = state.templates.find((x) => x.id === 'tpl-draft')!;
    makePublishable();
    tpl.fields = [];
    renderWithProviders(<DocumentsListPage />);
    const user = userEvent.setup();
    const publish = await screen.findByRole('button', {
      name: 'Publish Uniform policy',
    });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription(
      'Place at least one field before publishing.',
    );
    const menu = await openActions(user, 'Uniform policy');
    expect(
      within(menu).getByRole('menuitem', {
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
      within(row('Uniform policy')).getByText('0 signed'),
    ).toBeInTheDocument();
    expect(
      within(row('Uniform policy')).queryByText(/approved instructors have/),
    ).not.toBeInTheDocument();
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
    expect(
      within(season)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['2027/28', '2026/27 (current)', '2025/26']);
    await user.selectOptions(season, '2027/28');
    expect(season).toHaveValue('2027/28');
    await user.click(within(dialog).getByLabelText(/Selected instructors/));
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(
      within(dialog).getByText('Pick at least one instructor.'),
    ).toBeInTheDocument();
    expect(publishBodies).toEqual([]);
    await user.type(within(dialog).getByLabelText('Search instructors'), 'li');
    await user.click(await within(dialog).findByRole('checkbox'));
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Publish and email 1' }),
    );
    await waitFor(() =>
      expect(publishBodies).toEqual([
        {
          id: 'tpl-draft',
          body: {
            assignTo: 'selected',
            season: '2027/28',
            instructorIds: ['inst-2'],
          },
        },
      ]),
    );
    expect(
      await screen.findByText(
        'Uniform policy is live. Assigned to 1 instructors.',
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(row('Uniform policy')).getByText('Selected'),
      ).toBeInTheDocument(),
    );
    expect(
      within(row('Uniform policy')).getByText('1 instructors'),
    ).toBeInTheDocument();
  });

  it('publishes a customer document to selected people only', async () => {
    makePublishable();
    state.templates.find((x) => x.id === 'tpl-draft')!.audience = 'customer';
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: 'Publish Uniform policy' }),
    );
    const dialog = screen.getByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Season/)).toHaveValue('2026/27'),
    );
    expect(within(dialog).queryByLabelText(/All instructors/)).toBeNull();
    expect(within(dialog).getByRole('radio')).toBeChecked();
    expect(within(dialog).queryByTestId('publish-summary')).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(publishBodies).toEqual([
        { id: 'tpl-draft', body: { assignTo: 'selected', season: '2026/27' } },
      ]),
    );
    expect(
      await screen.findByText(
        'Uniform policy is live. Assigned to 0 instructors.',
      ),
    ).toBeInTheDocument();
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
    await chooseAction(user, 'Liability waiver', 'Retire Liability waiver');
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
    expect(await actionNames(user, 'Liability waiver')).toEqual([
      'Edit Liability waiver',
      'Re-publish Liability waiver',
      'Delete Liability waiver',
    ]);
    await chooseAction(user, 'Liability waiver', 'Re-publish Liability waiver');
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
    await chooseAction(user, 'Liability waiver', 'Retire Liability waiver');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not live');
  });

  it('changes a selected document to all instructors with the preview count', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(
      user,
      'Liability waiver',
      'Change audience of Liability waiver',
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Change audience of “Liability waiver”',
    });
    expect(
      within(dialog).getByText('From Selected instructors to All instructors.'),
    ).toBeInTheDocument();
    const summary = await within(dialog).findByTestId(
      'change-audience-summary',
    );
    expect(summary).toHaveTextContent(
      'Assigns now to 1 approved instructors and emails them.',
    );
    expect(summary).toHaveTextContent(
      "1 already have it and won't be emailed again.",
    );
    expect(summary).toHaveTextContent(
      'Instructors you approve later in this season get it automatically.',
    );
    expect(previewSeasons).toContain(MOCK_SEASON);
    await user.click(
      within(dialog).getByRole('button', { name: 'Change and email 1' }),
    );
    expect(
      await screen.findByText(
        'Liability waiver now goes to all instructors. Assigned to 1 instructors.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(audienceBodies).toEqual([
      { id: 'tpl-waiver', body: { assignTo: 'all' } },
    ]);
    expect(
      await within(row('Liability waiver')).findByText('0 signed'),
    ).toBeInTheDocument();
    expect(
      within(row('Liability waiver')).getByText('All instructors'),
    ).toBeInTheDocument();
    expect(await actionNames(user, 'Liability waiver')).not.toContain(
      'Assign Liability waiver',
    );
  });

  it('changes an all-instructors document to selected and keeps its assignments', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(
      user,
      'Code of conduct',
      'Change audience of Code of conduct',
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Change audience of “Code of conduct”',
    });
    expect(
      within(dialog).getByText('From All instructors to Selected instructors.'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByTestId('change-audience-summary'),
    ).toHaveTextContent(
      "Existing assignments are kept; new instructors won't get it automatically.",
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Change audience' }),
    );
    expect(
      await screen.findByText(
        'Code of conduct now goes to selected instructors. Existing assignments are kept.',
      ),
    ).toBeInTheDocument();
    expect(audienceBodies).toEqual([
      { id: 'tpl-conduct', body: { assignTo: 'selected' } },
    ]);
    expect(
      await within(row('Code of conduct')).findByText('1 instructors'),
    ).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).getByText('Selected'),
    ).toBeInTheDocument();
    expect(await actionNames(user, 'Code of conduct')).toContain(
      'Assign Code of conduct',
    );
  });

  it('re-reads the preview each time the dialog opens, so a repeat switch shows no one left to email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />, { staleTime: 30_000 });
    const openDialog = async () => {
      await chooseAction(
        user,
        'Liability waiver',
        'Change audience of Liability waiver',
      );
      return screen.getByRole('dialog', {
        name: 'Change audience of “Liability waiver”',
      });
    };
    let dialog = await openDialog();
    await user.click(
      await within(dialog).findByRole('button', { name: 'Change and email 1' }),
    );
    await screen.findByText(
      'Liability waiver now goes to all instructors. Assigned to 1 instructors.',
    );
    dialog = await openDialog();
    await user.click(
      within(dialog).getByRole('button', { name: 'Change audience' }),
    );
    await screen.findByText(
      'Liability waiver now goes to selected instructors. Existing assignments are kept.',
    );
    dialog = await openDialog();
    expect(
      await within(dialog).findByRole('button', { name: 'Change audience' }),
    ).toBeEnabled();
    expect(
      within(dialog).queryByRole('button', { name: /Change and email/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps confirm disabled when the fresh preview fails, even with an older count cached', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />, { staleTime: 30_000 });
    const openDialog = async () => {
      await chooseAction(
        user,
        'Liability waiver',
        'Change audience of Liability waiver',
      );
      return screen.getByRole('dialog', {
        name: 'Change audience of “Liability waiver”',
      });
    };
    let dialog = await openDialog();
    await within(dialog).findByRole('button', { name: 'Change and email 1' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    server.use(
      http.get(`${API}/admin/documents/templates/:id/publish-preview`, () =>
        HttpResponse.json({ message: 'Preview failed' }, { status: 500 }),
      ),
    );
    dialog = await openDialog();
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: /Change and email/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Change audience' }),
    ).toBeDisabled();
    expect(audienceBodies).toEqual([]);
  });

  it('offers Change audience only on live instructor documents', async () => {
    const customer = state.templates.find((x) => x.id === 'tpl-handbook')!;
    customer.audience = 'customer';
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    const offered = [];
    for (const title of [
      'Instructor handbook',
      'Code of conduct',
      'Liability waiver',
      'Uniform policy',
    ])
      offered.push(
        ...(await actionNames(user, title)).filter((name) =>
          name?.startsWith('Change audience of '),
        ),
      );
    expect(offered).toEqual([
      'Change audience of Code of conduct',
      'Change audience of Liability waiver',
    ]);
  });

  it('shows the API error when changing the audience fails', async () => {
    server.use(
      http.post(`${API}/admin/documents/templates/:id/audience`, () =>
        HttpResponse.json(
          { message: "Only a published document's audience can be changed" },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(
      user,
      'Code of conduct',
      'Change audience of Code of conduct',
    );
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Change audience' }),
    );
    expect(
      await within(dialog).findByText(
        "Only a published document's audience can be changed",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows the change audience dialog in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: '免责声明 的更多操作' }),
    );
    await user.click(
      screen.getByRole('menuitem', { name: '更改 免责声明 的对象' }),
    );
    const dialog = screen.getByRole('dialog', {
      name: '更改“免责声明”的对象',
    });
    expect(
      within(dialog).getByText('从指定教练改为所有教练。'),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByTestId('change-audience-summary'),
    ).toHaveTextContent('现在分配给 1 位已审核教练，并发邮件通知。');
    expect(
      within(dialog).getByRole('button', { name: '更改并发邮件给 1 人' }),
    ).toBeInTheDocument();
  });

  it('deletes a live document after confirming and drops it from the list', async () => {
    const deletes: string[] = [];
    server.use(
      http.delete(`${API}/admin/documents/templates/:id`, ({ params }) => {
        deletes.push(String(params.id));
        return undefined;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Delete Liability waiver');
    const dialog = screen.getByRole('dialog', {
      name: 'Delete “Liability waiver”',
    });
    expect(
      within(dialog).getByTestId('delete-template-summary'),
    ).toHaveTextContent(
      "1 instructors have it assigned and will lose it from their checklist.This can't be undone.",
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete document' }),
    );
    expect(
      await screen.findByText('Liability waiver is deleted.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Liability waiver')).not.toBeInTheDocument();
    expect(screen.getByText('Code of conduct')).toBeInTheDocument();
    expect(deletes).toEqual(['tpl-waiver']);
    expect(state.assignments.some((a) => a.templateId === 'tpl-waiver')).toBe(
      false,
    );
  });

  it('says nobody loses a draft document, and cancels without deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Uniform policy', 'Delete Uniform policy');
    const dialog = screen.getByRole('dialog', {
      name: 'Delete “Uniform policy”',
    });
    expect(
      within(dialog).getByTestId('delete-template-summary'),
    ).toHaveTextContent("No instructor has it assigned.This can't be undone.");
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(state.templates.some((x) => x.id === 'tpl-draft')).toBe(true);
  });

  it('disables Delete with the reason once someone has completed the document', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const menu = await openActions(user, 'Code of conduct');
    const item = within(menu).getByRole('menuitem', {
      name: 'Delete Code of conduct',
    });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(
      'Someone has completed this document. Retire it instead.',
    );
    await user.click(item);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables Delete when a completed assignment was later archived', async () => {
    state.assignments.push(
      fakeAssignment({
        id: 'asg-archived-done',
        templateId: 'tpl-waiver',
        status: 'archived',
        completedAt: '2026-10-01T12:00:00Z',
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const menu = await openActions(user, 'Liability waiver');
    expect(
      within(menu).getByRole('menuitem', { name: 'Delete Liability waiver' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the API error in the delete dialog', async () => {
    server.use(
      http.delete(`${API}/admin/documents/templates/:id`, () =>
        HttpResponse.json(
          {
            message:
              'Someone has completed this document, so it cannot be deleted. Retire it instead.',
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Delete Liability waiver');
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete document' }),
    );
    expect(
      await within(dialog).findByText(
        'Someone has completed this document, so it cannot be deleted. Retire it instead.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(row('Liability waiver')).toBeInTheDocument();
  });

  it('shows the delete dialog and the locked reason in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: '行为准则 的更多操作' }),
    );
    expect(
      screen.getByRole('menuitem', { name: '删除 行为准则' }),
    ).toHaveAccessibleDescription('已有教练完成此资料，请改为停用。');
    await user.keyboard('{Escape}');
    await user.click(
      await screen.findByRole('button', { name: '免责声明 的更多操作' }),
    );
    await user.click(screen.getByRole('menuitem', { name: '删除 免责声明' }));
    const dialog = screen.getByRole('dialog', { name: '删除“免责声明”' });
    expect(
      within(dialog).getByTestId('delete-template-summary'),
    ).toHaveTextContent(
      '1 位教练已分配此资料，删除后会从他们的清单中移除。此操作无法撤销。',
    );
    await user.click(within(dialog).getByRole('button', { name: '删除资料' }));
    expect(await screen.findByText('免责声明 已删除。')).toBeInTheDocument();
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
      within(conduct).getByText('2 位已审核教练中有 1 位收到此文档'),
    ).toBeInTheDocument();
    expect(within(conduct).getByText('1 人已签署')).toBeInTheDocument();
    expect(screen.getByText('1 位教练')).toBeInTheDocument();
  });

  it('opens the file picker from the row menu and returns focus to it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const input = await screen.findByLabelText('Upload PDF for Uniform policy');
    const click = vi.spyOn(input, 'click');
    await chooseAction(user, 'Uniform policy', 'Upload PDF');
    expect(click).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'More actions for Uniform policy' }),
    ).toHaveFocus();
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
    await chooseAction(user, 'Liability waiver', 'Edit Liability waiver');
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
    const pdfBytes = buildSamplePdf([{ width: 612, height: 792 }]);
    const file = new File([pdfBytes], 'policy.pdf', {
      type: 'application/pdf',
    });
    await user.upload(input, file);
    expect(
      await screen.findByText('Uploaded the PDF for Uniform policy (1 page).'),
    ).toBeInTheDocument();
    expect(new Uint8Array(state.uploadedSources.get('tpl-draft')!)).toEqual(
      Uint8Array.from(pdfBytes),
    );
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
    expect(
      new TextDecoder().decode(state.uploadedSources.get('tpl-waiver')),
    ).toBe('%PDF');
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

  it('counts only currently approved instructors for an all-instructors document', async () => {
    state.assignments.push(
      fakeAssignment({
        id: 'asg-conduct-gone',
        templateId: 'tpl-conduct',
        subjectId: 'inst-gone',
      }),
      fakeAssignment({
        id: 'asg-conduct-li',
        templateId: 'tpl-conduct',
        subjectId: 'inst-2',
      }),
    );
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    expect(
      within(row('Code of conduct')).getByText('1 signed'),
    ).toBeInTheDocument();
    expect(
      within(row('Code of conduct')).queryByText(/approved instructors have/),
    ).not.toBeInTheDocument();
  });

  describe('all-instructors assignment count', () => {
    function assignEveryoneTheConductDocument() {
      state.assignments.push(
        fakeAssignment({
          id: 'asg-conduct-li',
          templateId: 'tpl-conduct',
          subjectId: 'inst-2',
        }),
      );
    }

    it('hides the count when every approved instructor has the document', async () => {
      assignEveryoneTheConductDocument();
      renderWithProviders(<DocumentsListPage />);
      await screen.findByText('Code of conduct');
      const conduct = within(row('Code of conduct'));
      expect(conduct.getByText('All instructors')).toBeInTheDocument();
      expect(conduct.getByRole('link', { name: '1 signed' })).toHaveAttribute(
        'href',
        '/admin/documents/tpl-conduct/signed',
      );
      expect(conduct.queryByText(/of 2/)).not.toBeInTheDocument();
    });

    it('warns when an approved instructor is missing the document', async () => {
      renderWithProviders(<DocumentsListPage />);
      await screen.findByText('Code of conduct');
      const conduct = within(row('Code of conduct'));
      expect(
        conduct.getByText('1 of 2 approved instructors have this document'),
      ).toBeInTheDocument();
      expect(
        conduct.getByRole('link', { name: '1 signed' }),
      ).toBeInTheDocument();
      expect(conduct.queryByRole('button', { name: /assign/i })).toBeNull();
    });

    it('warns again after an admin archives one instructor’s copy', async () => {
      assignEveryoneTheConductDocument();
      state.assignments.find((a) => a.id === 'asg-conduct-li')!.status =
        'archived';
      renderWithProviders(<DocumentsListPage />);
      await screen.findByText('Code of conduct');
      expect(
        within(row('Code of conduct')).getByText(
          '1 of 2 approved instructors have this document',
        ),
      ).toBeInTheDocument();
    });

    it('keeps the instructor count for a selected-instructors document', async () => {
      renderWithProviders(<DocumentsListPage />);
      await screen.findByText('Liability waiver');
      const waiver = within(row('Liability waiver'));
      expect(waiver.getByText('Selected')).toBeInTheDocument();
      expect(
        waiver.getByRole('link', { name: '1 instructors' }),
      ).toHaveAttribute('href', '/admin/documents/tpl-waiver/signed');
      expect(waiver.queryByText(/approved instructors have/)).toBeNull();
    });
  });

  it('assigns a selected document for a season and refreshes its count', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Assign Liability waiver');
    const dialog = screen.getByRole('dialog', {
      name: 'Assign “Liability waiver”',
    });
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument();
    const season = within(dialog).getByLabelText(/Season/);
    await waitFor(() => expect(season).toHaveValue(MOCK_SEASON));
    await user.type(within(dialog).getByLabelText('Search instructors'), 'li');
    await user.click(await within(dialog).findByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      await within(dialog).findByText(
        'Assigned to 1. Skipped 0 who already had it for this season.',
      ),
    ).toBeInTheDocument();
    expect(assignBodies).toEqual([
      {
        templateId: 'tpl-waiver',
        season: MOCK_SEASON,
        instructorIds: ['inst-2'],
      },
    ]);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      await within(row('Liability waiver')).findByText('2 instructors'),
    ).toBeInTheDocument();
  });

  it('assigns to picked instructors and requires a pick', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Assign Liability waiver');
    const dialog = screen.getByRole('dialog');
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
        season: MOCK_SEASON,
        instructorIds: ['inst-2'],
      },
    ]);
  });

  it('closes the dialog with Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Assign Liability waiver');
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

describe('DocumentsListPage — language versions', () => {
  let createBodies: unknown[];

  beforeEach(() => {
    createBodies = [];
    server.use(
      http.post(`${API}/admin/documents/templates`, async ({ request }) => {
        createBodies.push(await request.clone().json());
        return undefined;
      }),
    );
  });

  const pdfCell = (title: string) =>
    within(row(title)).getAllByRole('cell')[2] as HTMLElement;
  const pdfFile = () =>
    new File([buildSamplePdf([{ width: 612, height: 792 }])], 'en.pdf', {
      type: 'application/pdf',
    });

  async function createNamed(
    user: ReturnType<typeof userEvent.setup>,
    title: string,
    language?: string,
  ) {
    const form = screen
      .getByText('New document')
      .closest('div')!.parentElement!;
    await user.type(within(form).getByLabelText(/Title \(English\)/), title);
    if (language)
      await user.selectOptions(
        within(form).getByLabelText('Main PDF language'),
        language,
      );
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    await screen.findByText(`Created “${title}”. Upload its PDF next.`);
  }

  it('creates a template labelled with its PDF language, and leaves the label out when unspecified', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Code of conduct');
    await createNamed(user, 'Agreement', 'zh');
    await createNamed(user, 'Plain');
    expect(createBodies[0]).toMatchObject({ sourceLanguage: 'zh' });
    expect(createBodies[1]).not.toHaveProperty('sourceLanguage');
    expect(state.templates.at(-2)?.sourceLanguage).toBe('zh');
    expect(state.templates.at(-1)?.sourceLanguage).toBeNull();
  });

  it("labels an existing document's PDF language with PATCH", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const editor = await openEdit(user, 'Liability waiver');
    const select = within(editor).getByLabelText('Main PDF language');
    expect(select).toHaveValue('');
    await user.selectOptions(select, 'en');
    await user.click(within(editor).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(patches).toEqual([
        { id: 'tpl-waiver', body: { sourceLanguage: 'en' } },
      ]),
    );
    await waitFor(() =>
      expect(within(pdfCell('Liability waiver')).getByText('EN')).toBeVisible(),
    );
  });

  it('uploads, links and removes the other language version, with badges', async () => {
    state.templates.find((t) => t.id === 'tpl-waiver')!.sourceLanguage = 'zh';
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Liability waiver');
    expect(within(pdfCell('Liability waiver')).getByText('中文')).toBeVisible();
    expect(within(pdfCell('Liability waiver')).queryByText('EN')).toBeNull();

    const editor = await openEdit(user, 'Liability waiver');
    const section = within(editor).getByRole('region', {
      name: 'Other language version',
    });
    expect(
      within(section).getByText(
        'Instructors using the portal in English see this PDF instead of the main one.',
      ),
    ).toBeInTheDocument();
    expect(
      await within(section).findByText('No English PDF yet.'),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole('button', { name: 'Remove English version' }),
    ).toBeNull();

    await user.upload(
      within(section).getByLabelText(
        'Upload the English PDF for Liability waiver',
      ),
      pdfFile(),
    );
    expect(
      await screen.findByText(
        'Uploaded the English version of Liability waiver (1 page).',
      ),
    ).toBeInTheDocument();
    expect(state.uploadedSources.has('tpl-waiver:en')).toBe(true);
    await waitFor(() =>
      expect(within(pdfCell('Liability waiver')).getByText('EN')).toBeVisible(),
    );
    expect(
      within(section).getByText('English PDF · 1 page · 0 fields placed'),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        'Place at least one field on the English version before publishing.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'Place English fields' }),
    ).toHaveAttribute('href', '/admin/documents/tpl-waiver/edit?language=en');
    expect(within(editor).getByLabelText('Main PDF language')).toBeDisabled();
    expect(
      within(editor).getByText(
        'Remove the other language version to change this.',
      ),
    ).toBeInTheDocument();

    expect(
      within(section).getByRole('button', { name: 'Replace English PDF' }),
    ).toBeEnabled();
    await user.click(
      within(section).getByRole('button', { name: 'Remove English version' }),
    );
    expect(
      await screen.findByText(
        'Removed the English version of Liability waiver.',
      ),
    ).toBeInTheDocument();
    expect(
      state.templates.find((t) => t.id === 'tpl-waiver')!.translations,
    ).toEqual([]);
    await waitFor(() =>
      expect(within(pdfCell('Liability waiver')).queryByText('EN')).toBeNull(),
    );
  });

  it('locks the other language version once a copy has been completed', async () => {
    Object.assign(state.templates.find((t) => t.id === 'tpl-conduct')!, {
      sourceLanguage: 'en',
      translations: [fakeTranslation('tpl-conduct', { language: 'zh' })],
    });
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const editor = await openEdit(user, 'Code of conduct');
    const section = within(editor).getByRole('region', {
      name: 'Other language version',
    });
    expect(
      await within(section).findByRole('button', {
        name: 'Remove Chinese version',
      }),
    ).toBeDisabled();
    expect(
      within(section).getByRole('button', { name: 'Replace Chinese PDF' }),
    ).toBeDisabled();
    expect(
      within(section).queryByRole('link', { name: 'Place Chinese fields' }),
    ).toBeNull();
  });

  it('previews a read document in the other language', async () => {
    Object.assign(state.templates.find((t) => t.id === 'tpl-handbook')!, {
      sourceLanguage: 'zh',
      hasCompletedAssignments: false,
      translations: [fakeTranslation('tpl-handbook', { language: 'en' })],
    });
    state.assignments = state.assignments.filter(
      (a) => a.templateId !== 'tpl-handbook',
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    const editor = await openEdit(user, 'Instructor handbook');
    expect(
      await within(editor).findByRole('link', {
        name: 'Preview English version',
      }),
    ).toHaveAttribute('href', '/admin/documents/tpl-handbook/edit?language=en');
    expect(within(editor).queryByText(/Place at least one field/)).toBeNull();
  });

  it('shows no language badges or other language section for an unlabelled document', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await screen.findByText('Liability waiver');
    expect(pdfCell('Liability waiver').textContent).toBe('1 page');
    const editor = await openEdit(user, 'Liability waiver');
    expect(
      within(editor).queryByRole('region', { name: 'Other language version' }),
    ).toBeNull();
    expect(
      within(editor).getByText(
        'Set this to add a version in the other language.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the other language version in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    state.templates.find((t) => t.id === 'tpl-waiver')!.sourceLanguage = 'zh';
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: '免责声明 的更多操作' }),
    );
    await user.click(screen.getByRole('menuitem', { name: '编辑 免责声明' }));
    const section = await screen.findByRole('region', {
      name: '另一种语言版本',
    });
    expect(
      within(section).getByText(
        '使用英文界面的教练会看到这个 PDF，而不是主版本。',
      ),
    ).toBeInTheDocument();
    expect(
      await within(section).findByRole('button', { name: '上传英文 PDF' }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText('主 PDF 语言')[0]).toHaveValue('zh');
  });
});

describe('season selects', () => {
  it('default to the current season from the API, not the newest', async () => {
    server.use(
      http.get(`${API}/reference/seasons`, () =>
        HttpResponse.json([
          { ...fakeSeasons[0], isCurrent: true },
          { ...fakeSeasons[1], isCurrent: false },
        ]),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Assign Liability waiver');
    const dialog = screen.getByRole('dialog', {
      name: 'Assign “Liability waiver”',
    });
    await waitFor(() =>
      expect(within(dialog).getByLabelText(/Season/)).toHaveValue('2027/28'),
    );
  });

  it('blocks assigning when no season exists', async () => {
    server.use(
      http.get(`${API}/reference/seasons`, () => HttpResponse.json([])),
    );
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await chooseAction(user, 'Liability waiver', 'Assign Liability waiver');
    const dialog = screen.getByRole('dialog');
    const season = within(dialog).getByLabelText(/Season/);
    await waitFor(() => expect(season).toHaveTextContent('No seasons yet'));
    expect(season).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(within(dialog).getByText('Choose a season.')).toBeInTheDocument();
    expect(assignBodies).toEqual([]);
  });

  it('shows the season select in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<DocumentsListPage />);
    await user.click(
      await screen.findByRole('button', { name: '免责声明 的更多操作' }),
    );
    await user.click(screen.getByRole('menuitem', { name: /^分配/ }));
    const season = within(screen.getByRole('dialog')).getByLabelText(/雪季/);
    await waitFor(() => expect(season).toHaveValue('2026/27'));
    expect(
      within(season).getByRole('option', { name: '2026/27（当前）' }),
    ).toBeInTheDocument();
  });
});
