import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fakeGoLive, server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { todayIso } from '../api';
import { fakeAssignment, fakeCertUpload, fakeTemplate } from '../api/fixtures';
import type { ApprovalStatus } from '@/lib/types';
import { InstructorDocumentsSection } from './InstructorDocumentsSection';
import { ShopifyInstructorPanel } from '@/features/admin/ShopifyInstructorPanel';

const API = 'http://localhost:3000';
let state: DocumentsMockState;
let reviews: unknown[];
let tab: {
  opener: unknown;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return todayIso(d);
}

beforeEach(() => {
  state = createDocumentsState();
  state.certUploads = [
    fakeCertUpload({ id: 'cu-pending', validUntil: daysFromToday(10) }),
    fakeCertUpload({
      id: 'cu-expiring',
      org: 'casi',
      track: 'park',
      reviewStatus: 'approved',
      reviewedAt: '2026-09-01T00:00:00Z',
      validUntil: daysFromToday(10),
      insertedAt: '2026-09-01T00:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-old',
      org: 'casi',
      track: 'park',
      reviewStatus: 'rejected',
      validUntil: daysFromToday(-400),
      insertedAt: '2025-01-01T00:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-expired',
      org: 'csia',
      track: 'park',
      reviewStatus: 'approved',
      validUntil: daysFromToday(-1),
    }),
  ];
  reviews = [];
  server.use(
    http.patch(
      `${API}/admin/certification-uploads/:id`,
      async ({ request, params }) => {
        reviews.push({
          id: params.id,
          ...((await request.clone().json()) as object),
        });
        return undefined;
      },
    ),
    ...documentsHandlers(state),
  );
  tab = { opener: 'x', location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
});

afterEach(() => vi.restoreAllMocks());

function renderSection(approvalStatus: ApprovalStatus = 'approved') {
  return renderWithProviders(
    <InstructorDocumentsSection
      instructorId="inst-1"
      instructorName="Jane Doe"
      approvalStatus={approvalStatus}
      certifications={[
        { org: 'csia', track: 'regular', level: 3 },
        { org: 'casi', track: 'park', level: 2 },
        { org: 'casi', track: 'regular', level: 1 },
      ]}
    />,
  );
}

async function chooseAction(
  user: ReturnType<typeof userEvent.setup>,
  scope: HTMLElement,
  title: string,
  name: string,
) {
  await user.click(
    within(scope).getByRole('button', { name: `More actions for ${title}` }),
  );
  await user.click(screen.getByRole('menuitem', { name }));
}

describe('InstructorDocumentsSection — documents', () => {
  it('lists assignments with titles, status and what is missing', async () => {
    renderSection();
    const waiver = await screen.findByRole('listitem', {
      name: 'Liability waiver',
    });
    expect(within(waiver).getAllByText('Viewed')).toHaveLength(2);
    expect(within(waiver).getByText('2026/27')).toBeInTheDocument();
    expect(within(waiver).getByText('Reminded')).toBeInTheDocument();
    expect(screen.getByText('2 of 3 completed')).toBeInTheDocument();
    const missing = screen.getByText(
      'Required and not completed',
    ).parentElement!;
    expect(missing).toHaveTextContent('Liability waiver');
    expect(missing).not.toHaveTextContent('Code of conduct');
    const conduct = screen.getByRole('listitem', { name: 'Code of conduct' });
    expect(within(conduct).getByText('b7e4d2a1b7e4…')).toBeInTheDocument();
    expect(within(conduct).getByText(/Signed as/)).toBeInTheDocument();
    const handbook = screen.getByRole('listitem', {
      name: 'Instructor handbook',
    });
    expect(within(handbook).getByText(/Acknowledged by/)).toBeInTheDocument();
    expect(within(handbook).queryByText(/Signed as/)).toBeNull();
    expect(
      within(conduct).queryByRole('button', { name: 'Send reminder' }),
    ).toBeNull();
  });

  it('shows the language a document was signed or read in, only when recorded', async () => {
    state.assignments = state.assignments.map((a) =>
      a.id === 'asg-conduct'
        ? { ...a, language: 'zh' }
        : a.id === 'asg-handbook'
          ? { ...a, language: 'en' }
          : a,
    );
    renderSection();
    const conduct = await screen.findByRole('listitem', {
      name: 'Code of conduct',
    });
    expect(within(conduct).getByText('Signed in')).toBeInTheDocument();
    expect(within(conduct).getByText('Chinese')).toBeInTheDocument();
    const handbook = screen.getByRole('listitem', {
      name: 'Instructor handbook',
    });
    expect(within(handbook).getByText('Read in')).toBeInTheDocument();
    expect(within(handbook).getByText('English')).toBeInTheDocument();
    const waiver = screen.getByRole('listitem', { name: 'Liability waiver' });
    expect(within(waiver).queryByText(/Signed in|Read in/)).toBeNull();
  });

  it('shows the signed language in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    state.assignments = state.assignments.map((a) =>
      a.id === 'asg-conduct' ? { ...a, language: 'en' } : a,
    );
    renderSection();
    const conduct = await screen.findByRole('listitem', { name: '行为准则' });
    expect(within(conduct).getByText('签署语言')).toBeInTheDocument();
    expect(within(conduct).getByText('英文')).toBeInTheDocument();
  });

  it('shows no signed language for documents signed before language versions', async () => {
    renderSection();
    const conduct = await screen.findByRole('listitem', {
      name: 'Code of conduct',
    });
    expect(within(conduct).queryByText(/Signed in/)).toBeNull();
  });

  it('titles rows from the embedded template and offers downloads only with a signed copy', async () => {
    state.templates = state.templates.filter((tpl) => tpl.id !== 'tpl-waiver');
    state.assignments = state.assignments.map((a) =>
      a.id === 'asg-conduct' ? { ...a, hasSignedCopy: false } : a,
    );
    renderSection();
    expect(
      await screen.findByRole('listitem', { name: 'Liability waiver' }),
    ).toBeInTheDocument();
    const conduct = screen.getByRole('listitem', { name: 'Code of conduct' });
    expect(
      within(conduct).queryByRole('button', { name: 'Download signed copy' }),
    ).toBeNull();
  });

  it('shows a deleted-document title when the assignment has no template', async () => {
    state.assignments = [{ ...state.assignments[2]!, template: null }];
    renderSection();
    expect(
      await screen.findByRole('listitem', { name: 'Deleted document' }),
    ).toBeInTheDocument();
  });

  it('downloads the signed copy in place without opening a tab', async () => {
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    });
    const user = userEvent.setup();
    renderSection();
    const conduct = await screen.findByRole('listitem', {
      name: 'Code of conduct',
    });
    await chooseAction(
      user,
      conduct,
      'Code of conduct',
      'Download signed copy',
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://storage.mock/signed/asg-conduct.pdf?sig=mock',
      ),
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('reports a failed download', async () => {
    server.use(
      http.get(`${API}/admin/documents/assignments/:id/signed-url`, () =>
        HttpResponse.json({ message: 'Signed copy missing' }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderSection();
    const conduct = await screen.findByRole('listitem', {
      name: 'Code of conduct',
    });
    await chooseAction(
      user,
      conduct,
      'Code of conduct',
      'Download signed copy',
    );
    expect(await within(conduct).findByRole('alert')).toHaveTextContent(
      'Signed copy missing',
    );
    expect(window.open).not.toHaveBeenCalled();
  });

  it('opens the file in the same tab when popups are blocked', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    const assign = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    });
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    await user.click(within(csia).getByRole('button', { name: 'View file' }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining('/certifications/cu-pending'),
      ),
    );
  });

  it('closes the blank tab when the file URL cannot be fetched', async () => {
    server.use(
      http.get(`${API}/admin/certification-uploads/:id/url`, () =>
        HttpResponse.json({ message: 'File missing' }, { status: 404 }),
      ),
    );
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    await user.click(within(csia).getByRole('button', { name: 'View file' }));
    expect(await within(csia).findByRole('alert')).toHaveTextContent(
      'File missing',
    );
    expect(tab.close).toHaveBeenCalled();
  });

  it('collapses two or more row actions into a menu and keeps a lone one as a button', async () => {
    const user = userEvent.setup();
    renderSection();
    const handbook = await screen.findByRole('listitem', {
      name: 'Instructor handbook',
    });
    expect(
      within(handbook).getByRole('button', { name: 'Archive' }),
    ).toBeInTheDocument();
    expect(
      within(handbook).queryByRole('button', { name: /More actions/ }),
    ).toBeNull();
    const conduct = screen.getByRole('listitem', { name: 'Code of conduct' });
    await user.click(
      within(conduct).getByRole('button', {
        name: 'More actions for Code of conduct',
      }),
    );
    expect(
      screen.getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['Download signed copy', 'Archive']);
  });

  it('sends a reminder and archives with confirmation', async () => {
    const user = userEvent.setup();
    renderSection();
    const waiver = await screen.findByRole('listitem', {
      name: 'Liability waiver',
    });
    await chooseAction(user, waiver, 'Liability waiver', 'Send reminder');
    expect(
      await within(waiver).findByText('Reminder sent.'),
    ).toBeInTheDocument();
    expect(state.reminded).toEqual(['asg-waiver']);

    await chooseAction(user, waiver, 'Liability waiver', 'Archive');
    const confirm = within(waiver).getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(waiver).queryByRole('alertdialog')).toBeNull();
    await chooseAction(user, waiver, 'Liability waiver', 'Archive');
    await user.click(
      within(within(waiver).getByRole('alertdialog')).getByRole('button', {
        name: 'Archive',
      }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', { name: 'Liability waiver' }),
      ).toBeNull(),
    );
    await user.click(screen.getByLabelText('Show archived (1)'));
    const archived = screen.getByRole('listitem', { name: 'Liability waiver' });
    expect(within(archived).getByText('Archived')).toBeInTheDocument();
    expect(
      within(archived).queryByRole('button', { name: 'Archive' }),
    ).toBeNull();
    expect(
      within(archived).queryByRole('button', { name: /More actions/ }),
    ).toBeNull();
  });

  it('shows a reminder error', async () => {
    server.use(
      http.post(`${API}/admin/documents/assignments/:id/remind`, () =>
        HttpResponse.json({ message: 'Too soon' }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderSection();
    const waiver = await screen.findByRole('listitem', {
      name: 'Liability waiver',
    });
    await chooseAction(user, waiver, 'Liability waiver', 'Send reminder');
    expect(await within(waiver).findByRole('alert')).toHaveTextContent(
      'Too soon',
    );
  });

  describe('assigning a document', () => {
    let posts: unknown[];

    beforeEach(() => {
      posts = [];
      state.templates.push(
        fakeTemplate({
          id: 'tpl-ski',
          titleEn: 'Ski school policy',
          assignTo: 'selected',
          required: false,
        }),
        fakeTemplate({
          id: 'tpl-medical',
          titleEn: 'Medical form',
          assignTo: 'selected',
          required: false,
        }),
        fakeTemplate({
          id: 'tpl-nopdf',
          titleEn: 'Parking rules',
          assignTo: 'selected',
          sourceSha256: null,
        }),
        fakeTemplate({
          id: 'tpl-new-all',
          titleEn: 'Season kickoff',
          assignTo: 'all',
        }),
      );
      state.assignments.push(
        fakeAssignment({
          id: 'asg-medical',
          templateId: 'tpl-medical',
          status: 'archived',
        }),
      );
      server.events.on('request:start', async ({ request }) => {
        if (
          request.method === 'POST' &&
          new URL(request.url).pathname === '/admin/documents/assignments'
        )
          posts.push(await request.clone().json());
      });
    });

    afterEach(() => server.events.removeAllListeners());

    it('offers only documents this instructor does not hold', async () => {
      const user = userEvent.setup();
      renderSection();
      await user.click(
        await screen.findByRole('button', { name: 'Assign a document' }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Assign a document' });
      expect(
        within(dialog).getByText(
          'Assign to Jane Doe for 2026/27. They’ll get an email.',
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog)
          .getAllByRole('radio')
          .map((r) => r.closest('label')!.textContent),
      ).toEqual(['Ski school policy', 'Medical form']);
      expect(within(dialog).queryByRole('checkbox')).toBeNull();
      expect(within(dialog).queryByLabelText('Search instructors')).toBeNull();
    });

    it('assigns the picked document to this instructor and refreshes the list', async () => {
      const user = userEvent.setup();
      renderSection();
      await user.click(
        await screen.findByRole('button', { name: 'Assign a document' }),
      );
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByLabelText('Medical form'));
      await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(posts).toEqual([
        {
          templateId: 'tpl-medical',
          season: '2026/27',
          instructorIds: ['inst-1'],
        },
      ]);
      expect(screen.getByText('Assigned “Medical form”.')).toBeInTheDocument();
      expect(
        await screen.findByRole('listitem', { name: 'Medical form' }),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Assign a document' }),
      );
      expect(
        within(screen.getByRole('dialog')).getAllByRole('radio'),
      ).toHaveLength(1);
    });

    it('shows an API error in the dialog', async () => {
      server.use(
        http.post(`${API}/admin/documents/assignments`, () =>
          HttpResponse.json({ message: 'Season is closed' }, { status: 422 }),
        ),
      );
      const user = userEvent.setup();
      renderSection();
      await user.click(
        await screen.findByRole('button', { name: 'Assign a document' }),
      );
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Season is closed',
      );
    });

    it('hides the button when every document is already held', async () => {
      state.templates = state.templates.filter(
        (tpl) => tpl.id !== 'tpl-ski' && tpl.id !== 'tpl-medical',
      );
      renderSection();
      await screen.findByRole('listitem', { name: 'Liability waiver' });
      expect(
        screen.queryByRole('button', { name: 'Assign a document' }),
      ).toBeNull();
    });

    it('explains that a not-approved instructor gets documents on approval', async () => {
      state.assignments = [];
      renderSection('pending');
      expect(
        await screen.findByText(
          'Documents are assigned when this instructor is approved.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText('No documents assigned yet.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Required and not completed')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Assign a document' }),
      ).toBeNull();
      expect(screen.getByText('Show archived (0)')).toBeInTheDocument();
    });

    it('still flags missing required documents for an approved instructor', async () => {
      renderSection();
      expect(
        await screen.findByText('Required and not completed'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Documents are assigned when this instructor is approved.',
        ),
      ).toBeNull();
    });
  });

  it('handles an instructor with nothing yet, and load errors', async () => {
    state.assignments = [];
    state.certUploads = [];
    const { unmount } = renderSection();
    expect(
      await screen.findByText('No documents assigned yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No certification uploads yet.'),
    ).toBeInTheDocument();
    unmount();
    server.use(
      http.get(`${API}/admin/instructors/:id/documents`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );
    renderSection();
    expect(await screen.findByText('Boom')).toBeInTheDocument();
  });
});

describe('InstructorDocumentsSection — certification uploads', () => {
  it('shows the current upload per cert with badges, and history', async () => {
    const user = userEvent.setup();
    renderSection();
    const park = await screen.findByRole('listitem', { name: 'CASI Park' });
    expect(
      within(park).getByText('Expires within 30 days'),
    ).toBeInTheDocument();
    expect(within(park).getByText(/Level 2/)).toBeInTheDocument();
    const csiaPark = screen.getByRole('listitem', { name: 'CSIA Park' });
    expect(within(csiaPark).getByText('Expired')).toBeInTheDocument();
    const csia = screen.getByRole('listitem', { name: 'CSIA' });
    expect(within(csia).getByText('Awaiting review')).toBeInTheDocument();
    expect(within(csia).queryByText('Expires within 30 days')).toBeNull();
    expect(
      screen.getByText('Certifications without an upload').parentElement,
    ).toHaveTextContent('CASI Level 1');
    expect(screen.queryByText(/Rejected/)).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Previous uploads (1)' }),
    );
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('approves with a corrected valid-through date', async () => {
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    const date = within(csia).getByLabelText('Valid through');
    await user.clear(date);
    await user.type(date, '2027-09-30');
    await user.click(within(csia).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(reviews).toEqual([
        {
          id: 'cu-pending',
          reviewStatus: 'approved',
          validUntil: '2027-09-30',
        },
      ]),
    );
    expect(await within(csia).findByText('Approved')).toBeInTheDocument();
  });

  it('requires a note to reject', async () => {
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    const reject = within(csia).getByRole('button', { name: 'Reject' });
    expect(reject).toBeDisabled();
    await user.type(
      within(csia).getByLabelText('Note to instructor'),
      'Photo is blurry',
    );
    await user.click(reject);
    await waitFor(() =>
      expect(reviews).toEqual([
        {
          id: 'cu-pending',
          reviewStatus: 'rejected',
          reviewNote: 'Photo is blurry',
        },
      ]),
    );
  });

  it('clears an old review note when the note box is emptied', async () => {
    state.certUploads[0] = fakeCertUpload({
      id: 'cu-pending',
      reviewNote: 'Photo is blurry',
      validUntil: daysFromToday(10),
    });
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    const note = within(csia).getByLabelText('Note to instructor');
    expect(note).toHaveValue('Photo is blurry');
    await user.clear(note);
    await user.click(within(csia).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(reviews).toEqual([
        { id: 'cu-pending', reviewStatus: 'approved', reviewNote: null },
      ]),
    );
    await waitFor(() => expect(state.certUploads[0]?.reviewNote).toBeNull());
  });

  it('shows a rejected upload as deleted and only lets its note be re-saved', async () => {
    state.certUploads[0] = fakeCertUpload({
      id: 'cu-pending',
      reviewStatus: 'rejected',
      reviewNote: 'Photo is blurry',
      validUntil: daysFromToday(10),
    });
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    expect(
      within(csia).getByText('File deleted after rejection'),
    ).toBeInTheDocument();
    expect(
      within(csia).queryByRole('button', { name: 'View file' }),
    ).toBeNull();
    expect(within(csia).queryByRole('button', { name: 'Approve' })).toBeNull();
    const note = within(csia).getByLabelText('Note to instructor');
    await user.clear(note);
    expect(within(csia).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await user.type(note, 'Upload the back side too');
    await user.click(within(csia).getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(reviews).toEqual([
        {
          id: 'cu-pending',
          reviewStatus: 'rejected',
          reviewNote: 'Upload the back side too',
        },
      ]),
    );
  });

  it('labels a deleted rejected file in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    state.certUploads[0] = fakeCertUpload({
      id: 'cu-pending',
      reviewStatus: 'rejected',
      reviewNote: 'Photo is blurry',
      validUntil: daysFromToday(10),
    });
    renderSection();
    const row = (await screen.findByText('文件已在驳回后删除')).closest('li');
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).queryByRole('button', { name: '查看文件' }),
    ).toBeNull();
  });

  it('lets an approved upload save only a changed date', async () => {
    const user = userEvent.setup();
    renderSection();
    const park = await screen.findByRole('listitem', { name: 'CASI Park' });
    expect(
      within(park).getByRole('button', { name: 'Approve' }),
    ).toBeDisabled();
    const date = within(park).getByLabelText('Valid through');
    await user.clear(date);
    expect(
      within(park).getByRole('button', { name: 'Save date' }),
    ).toBeDisabled();
    await user.type(date, '2027-10-31');
    await user.click(within(park).getByRole('button', { name: 'Save date' }));
    await waitFor(() =>
      expect(reviews).toEqual([
        {
          id: 'cu-expiring',
          reviewStatus: 'approved',
          validUntil: '2027-10-31',
        },
      ]),
    );
  });

  it('opens the uploaded file and shows review errors', async () => {
    server.use(
      http.patch(`${API}/admin/certification-uploads/:id`, () =>
        HttpResponse.json(
          { message: 'validUntil must be YYYY-MM-DD' },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    await user.click(within(csia).getByRole('button', { name: 'View file' }));
    await waitFor(() =>
      expect(tab.location.href).toContain('/certifications/cu-pending'),
    );
    await user.click(within(csia).getByRole('button', { name: 'Approve' }));
    expect(await within(csia).findByRole('alert')).toHaveTextContent(
      'validUntil must be YYYY-MM-DD',
    );
  });
});

describe('InstructorDocumentsSection — go-live certification status', () => {
  it('shows the verification status of each declared level', async () => {
    renderWithProviders(
      <InstructorDocumentsSection
        instructorId="inst-1"
        instructorName="Jane Doe"
        approvalStatus="approved"
        certifications={[{ org: 'csia', track: 'regular', level: 3 }]}
        certStatuses={[
          {
            org: 'csia',
            track: 'regular',
            level: 3,
            status: 'pending',
            validUntil: null,
          },
          {
            org: 'casi',
            track: 'regular',
            level: 2,
            status: 'verified',
            validUntil: '2027-06-30',
          },
          {
            org: 'casi',
            track: 'park',
            level: 1,
            status: 'level_mismatch',
            validUntil: '2027-06-30',
          },
        ]}
      />,
    );
    const list = await screen.findByRole('list', { name: 'Certifications' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'CSIA Level 3Verification pending',
      'CASI Level 2Verified · until Jun 30, 2027',
      'CASI Park Level 1Re-verification needed',
    ]);
  });

  it('refreshes the go-live check after a proof is approved', async () => {
    let goLiveRequests = 0;
    server.use(
      http.get(`${API}/admin/instructors/:id/go-live`, () => {
        goLiveRequests += 1;
        return HttpResponse.json({
          ...fakeGoLive,
          ready: goLiveRequests > 1,
          missing: goLiveRequests > 1 ? [] : fakeGoLive.missing,
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <InstructorDocumentsSection
          instructorId="inst-1"
          instructorName="Jane Doe"
          approvalStatus="approved"
          certifications={[{ org: 'csia', track: 'regular', level: 3 }]}
        />
        <ShopifyInstructorPanel instructorId="inst-1" />
      </>,
      { staleTime: 60_000 },
    );
    expect(await screen.findByText('3 missing')).toBeInTheDocument();
    const csia = await screen.findByRole('listitem', { name: 'CSIA' });
    await user.click(within(csia).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });
});
