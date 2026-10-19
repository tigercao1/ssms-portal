import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
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
let slowPages: string[];
let listRequests: {
  status: string | null;
  page: string | null;
  limit: string | null;
}[];
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
  listRequests = [];
  slowPages = [];
  server.use(
    http.get(`${API}/admin/document-reviews`, async ({ request }) => {
      const qs = new URL(request.url).searchParams;
      listRequests.push({
        status: qs.get('status'),
        page: qs.get('page'),
        limit: qs.get('limit'),
      });
      if (slowPages.includes(qs.get('page') ?? '')) await delay(150);
      return undefined;
    }),
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

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="location">{search}</output>;
}

function renderPage(route = '/') {
  return renderWithProviders(
    <>
      <DocumentReviewPage />
      <LocationProbe />
    </>,
    { route },
  );
}

const location = () => screen.getByTestId('location').textContent;
const cardNames = () =>
  within(screen.getByRole('list', { name: 'Documents to review' }))
    .getAllByRole('listitem')
    .map((i) => i.getAttribute('aria-label'));

function seedCoaches(count: number, decided = false) {
  state.certUploads = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    state.instructors[`inst-c${n}`] = {
      firstName: 'Coach',
      lastName: String(n),
      email: `coach${n}@example.com`,
    };
    return fakeCertUpload({
      id: `cu-c${String(n).padStart(2, '0')}`,
      instructorId: `inst-c${n}`,
      insertedAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
      ...(decided && {
        reviewStatus: 'approved' as const,
        reviewedAt: new Date(Date.UTC(2026, 9, 10, 0, 60 - n)).toISOString(),
      }),
    });
  });
}

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
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
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

describe('DocumentReviewPage paging and URL state', () => {
  it('pages 25 at a time with the page in the URL, keeping the page while the next loads', async () => {
    seedCoaches(30);
    slowPages = ['2'];
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Showing 1–25 of 30')).toBeInTheDocument();
    expect(cardNames()).toHaveLength(25);
    expect(cardNames()[0]).toBe('Membership card · Coach 1');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(listRequests).toEqual([
      { status: 'pending', page: '1', limit: '25' },
    ]);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      screen.getByRole('list', { name: 'Documents to review' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(cardNames()[0]).toBe('Membership card · Coach 1');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(await screen.findByText('Showing 26–30 of 30')).toBeInTheDocument();
    expect(cardNames()).toEqual(
      [26, 27, 28, 29, 30].map((n) => `Membership card · Coach ${n}`),
    );
    expect(location()).toBe('?page=2');
    expect(listRequests.at(-1)).toEqual({
      status: 'pending',
      page: '2',
      limit: '25',
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Showing 1–25 of 30')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('restores the filter and page from the URL', async () => {
    seedCoaches(30, true);
    renderPage('/?status=decided&page=2');

    expect(await screen.findByText('Showing 26–30 of 30')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Recently decided' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(cardNames()[0]).toBe('Membership card · Coach 26');
    expect(listRequests).toEqual([
      { status: 'decided', page: '2', limit: '25' },
    ]);
  });

  it('puts the filter in the URL and goes back to page 1 when it changes', async () => {
    seedCoaches(30);
    const user = userEvent.setup();
    renderPage('/?page=2');
    expect(await screen.findByText('Showing 26–30 of 30')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recently decided' }));
    expect(await screen.findByText('No recent decisions')).toBeInTheDocument();
    expect(location()).toBe('?status=decided');
    expect(listRequests.at(-1)).toEqual({
      status: 'decided',
      page: '1',
      limit: '25',
    });

    await user.click(screen.getByRole('button', { name: 'Awaiting review' }));
    expect(await screen.findByText('Showing 1–25 of 30')).toBeInTheDocument();
    expect(location()).toBe('');
  });

  it('refetches after a decision and pulls the next item onto the page', async () => {
    seedCoaches(26);
    const user = userEvent.setup();
    renderPage();
    const first = await card('Coach 1');
    expect(screen.getByText('Showing 1–25 of 26')).toBeInTheDocument();

    await user.click(within(first).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Showing 1–25 of 25')).toBeInTheDocument();
    expect(
      screen.getByText('Approved the Membership card from Coach 1.'),
    ).toBeInTheDocument();
    expect(cardNames()[0]).toBe('Membership card · Coach 2');
    expect(cardNames().at(-1)).toBe('Membership card · Coach 26');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(location()).toBe('');
  });

  it('steps back a page when a decision empties the last one', async () => {
    seedCoaches(26);
    const user = userEvent.setup();
    renderPage('/?page=2');
    const last = await card('Coach 26');
    expect(screen.getByText('Showing 26–26 of 26')).toBeInTheDocument();

    await user.click(within(last).getByRole('button', { name: 'Reject' }));
    await user.type(
      within(last).getByRole('textbox', { name: 'Reason for rejecting' }),
      'Expired',
    );
    await user.click(
      within(last).getByRole('button', { name: 'Reject and email' }),
    );

    expect(await screen.findByText('Showing 1–25 of 25')).toBeInTheDocument();
    expect(location()).toBe('');
    expect(
      screen.getByText(
        'Rejected the Membership card from Coach 26 and emailed them.',
      ),
    ).toBeInTheDocument();
    expect(listRequests.at(-1)).toEqual({
      status: 'pending',
      page: '1',
      limit: '25',
    });
  });

  it('steps back to the last page when the URL points past the end', async () => {
    seedCoaches(30);
    renderPage('/?page=5');
    expect(await screen.findByText('Showing 26–30 of 30')).toBeInTheDocument();
    expect(location()).toBe('?page=2');
  });

  it('shows the pager in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    seedCoaches(30);
    renderPage();
    expect(await screen.findByText('第 1–25 条，共 30 条')).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: '资料审核分页' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
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
