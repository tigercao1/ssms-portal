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
} from '../../api/handlers';
import { fakeCertUpload } from '../../api/fixtures';
import { DocumentReviewPage, reviewInstructorName } from './DocumentReviewPage';

const API = 'http://localhost:3000';
let state: DocumentsMockState;
let reviews: unknown[];
let tab: {
  opener: unknown;
  location: { href: string };
  close: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  state = createDocumentsState();
  state.certUploads = [
    fakeCertUpload({
      id: 'cu-jane',
      contentType: 'image/jpeg',
      insertedAt: '2026-10-10T15:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-li',
      instructorId: 'inst-2',
      org: 'casi',
      track: 'park',
      contentType: 'application/pdf',
      insertedAt: '2026-10-12T15:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-decided',
      org: 'casi',
      track: 'regular',
      reviewStatus: 'rejected',
      reviewNote: 'Card is from last season',
      reviewedAt: '2026-10-11T15:00:00Z',
      insertedAt: '2026-10-09T15:00:00Z',
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

const card = (name: string) =>
  screen.findByRole('listitem', { name: `Membership card · ${name}` });

describe('DocumentReviewPage', () => {
  it('lists pending items across instructors, oldest first, with a link to each instructor', async () => {
    renderWithProviders(<DocumentReviewPage />);
    const jane = await card('Jane Snow');
    const items = within(
      screen.getByRole('list', { name: 'Documents to review' }),
    ).getAllByRole('listitem');
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual([
      'Membership card · Jane Snow',
      'Membership card · Li Wei',
    ]);
    expect(within(jane).getByText('Awaiting review')).toBeInTheDocument();
    expect(within(jane).getByText('CSIA · Level 3')).toBeInTheDocument();
    expect(within(jane).getByText(/Submitted/)).toBeInTheDocument();
    expect(
      within(jane).getByRole('link', { name: 'Open instructor' }),
    ).toHaveAttribute('href', '/admin/instructors/inst-1');
    const li = await card('Li Wei');
    expect(within(li).getByText('CASI Park')).toBeInTheDocument();
  });

  it('previews an image inline and enlarges it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    const jane = await card('Jane Snow');
    const thumb = await within(jane).findByRole('img', {
      name: 'Membership card from Jane Snow',
    });
    expect(thumb).toHaveAttribute(
      'src',
      'https://storage.mock/certifications/cu-jane?sig=mock',
    );
    await user.click(
      within(jane).getByRole('button', {
        name: 'Enlarge Membership card from Jane Snow',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Membership card from Jane Snow',
    });
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      'https://storage.mock/certifications/cu-jane?sig=mock',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens a PDF in a new tab instead of previewing it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    const li = await card('Li Wei');
    expect(within(li).queryByRole('img')).toBeNull();
    await user.click(within(li).getByRole('button', { name: 'Open PDF' }));
    await waitFor(() =>
      expect(tab.location.href).toBe(
        'https://storage.mock/certifications/cu-li?sig=mock',
      ),
    );
    expect(tab.opener).toBeNull();
  });

  it('approves through the certification review endpoint and drops the item from the queue', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    const jane = await card('Jane Snow');
    await user.click(within(jane).getByRole('button', { name: 'Approve' }));
    expect(
      await screen.findByText('Approved the Membership card from Jane Snow.'),
    ).toBeInTheDocument();
    expect(reviews).toEqual([{ id: 'cu-jane', reviewStatus: 'approved' }]);
    await waitFor(() =>
      expect(
        screen.queryByRole('listitem', {
          name: 'Membership card · Jane Snow',
        }),
      ).toBeNull(),
    );
    expect(await card('Li Wei')).toBeInTheDocument();
  });

  it('rejects only with a reason, which is sent as the review note', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    const li = await card('Li Wei');
    await user.click(within(li).getByRole('button', { name: 'Reject' }));
    const confirm = within(li).getByRole('button', {
      name: 'Reject and email',
    });
    expect(confirm).toBeDisabled();
    expect(
      within(li).getByText('Add a note explaining what to fix.'),
    ).toBeInTheDocument();
    await user.type(
      within(li).getByRole('textbox', { name: 'Reason for rejecting' }),
      '  Photo is blurry ',
    );
    expect(
      within(li).getByText('Sent to the instructor in the rejection email.'),
    ).toBeInTheDocument();
    await user.click(confirm);
    expect(
      await screen.findByText(
        'Rejected the Membership card from Li Wei and emailed them.',
      ),
    ).toBeInTheDocument();
    expect(reviews).toEqual([
      { id: 'cu-li', reviewStatus: 'rejected', reviewNote: 'Photo is blurry' },
    ]);
  });

  it('cancels a rejection without sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    const li = await card('Li Wei');
    await user.click(within(li).getByRole('button', { name: 'Reject' }));
    await user.click(within(li).getByRole('button', { name: 'Cancel' }));
    expect(
      within(li).getByRole('button', { name: 'Approve' }),
    ).toBeInTheDocument();
    expect(reviews).toEqual([]);
  });

  it('shows a review error and keeps the item', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch(`${API}/admin/certification-uploads/:id`, () =>
        HttpResponse.json(
          {
            message: 'A rejected certification upload cannot be reviewed again',
          },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<DocumentReviewPage />);
    const jane = await card('Jane Snow');
    await user.click(within(jane).getByRole('button', { name: 'Approve' }));
    expect(await within(jane).findByRole('alert')).toHaveTextContent(
      'A rejected certification upload cannot be reviewed again',
    );
  });

  it('shows recent decisions with their note and no actions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DocumentReviewPage />);
    await card('Jane Snow');
    await user.click(screen.getByRole('button', { name: 'Recently decided' }));
    expect(
      screen.getByRole('button', { name: 'Recently decided' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const decided = await card('Jane Snow');
    expect(within(decided).getByText('Rejected')).toBeInTheDocument();
    expect(
      within(decided).getByText('Note to instructor: Card is from last season'),
    ).toBeInTheDocument();
    expect(
      within(decided).getByText('File deleted after rejection'),
    ).toBeInTheDocument();
    expect(
      within(decided).queryByRole('button', { name: 'Approve' }),
    ).toBeNull();
    expect(
      screen.getByText('Approved or rejected in the last 30 days.'),
    ).toBeInTheDocument();
  });

  it('shows an empty state for each filter', async () => {
    const user = userEvent.setup();
    state.certUploads = [];
    renderWithProviders(<DocumentReviewPage />);
    expect(await screen.findByText('Nothing to review')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recently decided' }));
    expect(await screen.findByText('No recent decisions')).toBeInTheDocument();
  });

  it('shows a load error', async () => {
    server.use(
      http.get(`${API}/admin/document-reviews`, () =>
        HttpResponse.json({ message: 'Server exploded' }, { status: 500 }),
      ),
    );
    renderWithProviders(<DocumentReviewPage />);
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('renders in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<DocumentReviewPage />);
    expect(
      await screen.findByRole('heading', { name: '资料审核' }),
    ).toBeInTheDocument();
    const jane = await screen.findByRole('listitem', {
      name: '会员卡 · Jane Snow',
    });
    expect(
      within(jane).getByRole('button', { name: '通过' }),
    ).toBeInTheDocument();
    expect(
      within(jane).getByRole('link', { name: '查看教练' }),
    ).toBeInTheDocument();
  });
});

describe('reviewInstructorName', () => {
  const base = {
    id: 'i',
    email: 'e@example.com',
    firstName: 'Jane',
    lastName: 'Snow',
    displayNameEn: 'Janey',
    displayNameZh: '小简',
  };

  it('prefers the localized display name, then the legal name, then the email', () => {
    expect(reviewInstructorName(base, 'en')).toBe('Janey');
    expect(reviewInstructorName(base, 'zh-CN')).toBe('小简');
    expect(
      reviewInstructorName(
        { ...base, displayNameEn: null, displayNameZh: null },
        'en',
      ),
    ).toBe('Jane Snow');
    expect(
      reviewInstructorName(
        {
          ...base,
          displayNameEn: null,
          displayNameZh: null,
          firstName: null,
          lastName: null,
        },
        'zh-CN',
      ),
    ).toBe('e@example.com');
  });
});
