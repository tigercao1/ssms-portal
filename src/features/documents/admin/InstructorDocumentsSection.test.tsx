import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { todayIso } from '../api';
import { fakeCertUpload } from '../api/fixtures';
import { InstructorDocumentsSection } from './InstructorDocumentsSection';

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

function renderSection() {
  return renderWithProviders(
    <InstructorDocumentsSection
      instructorId="inst-1"
      certifications={[
        { org: 'csia', track: 'regular', level: 3 },
        { org: 'casi', track: 'park', level: 2 },
        { org: 'casi', track: 'regular', level: 1 },
      ]}
    />,
  );
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
    await user.click(
      within(conduct).getByRole('button', { name: 'Download signed copy' }),
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
    await user.click(
      within(conduct).getByRole('button', { name: 'Download signed copy' }),
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

  it('sends a reminder and archives with confirmation', async () => {
    const user = userEvent.setup();
    renderSection();
    const waiver = await screen.findByRole('listitem', {
      name: 'Liability waiver',
    });
    await user.click(
      within(waiver).getByRole('button', { name: 'Send reminder' }),
    );
    expect(
      await within(waiver).findByText('Reminder sent.'),
    ).toBeInTheDocument();
    expect(state.reminded).toEqual(['asg-waiver']);

    await user.click(within(waiver).getByRole('button', { name: 'Archive' }));
    const confirm = within(waiver).getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(within(waiver).queryByRole('alertdialog')).toBeNull();
    await user.click(within(waiver).getByRole('button', { name: 'Archive' }));
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
    await user.click(
      within(waiver).getByRole('button', { name: 'Send reminder' }),
    );
    expect(await within(waiver).findByRole('alert')).toHaveTextContent(
      'Too soon',
    );
  });

  it('assigns another document to this instructor', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByRole('listitem', { name: 'Liability waiver' });
    const assign = screen.getByRole('button', { name: 'Assign' });
    expect(assign).toBeDisabled();
    const picker = screen.getByLabelText('Choose a document');
    expect(within(picker).queryByText('Uniform policy')).toBeNull();
    await user.selectOptions(picker, 'tpl-conduct');
    await user.click(assign);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Pick instructors')).toBeChecked();
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument();
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
