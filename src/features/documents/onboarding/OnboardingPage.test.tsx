import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { OnboardingPage } from './OnboardingPage';
import { OnboardingCard } from './OnboardingCard';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw';
import { sizedFile } from '@/test/imageMocks';
import type { CertUploadUrlRequest } from '../api';
import { MOCK_STORAGE_ORIGIN, fakeCertUpload } from '../api/fixtures';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';

const API = 'http://localhost:3000';
let state: DocumentsMockState;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0));
  state = createDocumentsState({
    meCerts: [
      { org: 'csia', track: 'regular', level: 3 },
      { org: 'casi', track: 'park', level: 2 },
      { org: 'csia', track: 'park', level: 1 },
      { org: 'casi', track: 'regular', level: 2 },
      { org: 'csia', track: 'carving', level: 1 },
      { org: 'casi', track: 'carving', level: 1 },
    ],
  });
  state.certUploads.push(
    fakeCertUpload({
      id: 'cu-x',
      org: 'csia',
      track: 'park',
      reviewStatus: 'approved',
      validUntil: '2026-06-30',
      insertedAt: '2026-10-01T00:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-r',
      org: 'casi',
      track: 'regular',
      reviewStatus: 'rejected',
      reviewNote: 'Photo is blurry',
      insertedAt: '2026-10-02T00:00:00Z',
    }),
    fakeCertUpload({
      id: 'cu-v',
      org: 'csia',
      track: 'carving',
      reviewStatus: 'approved',
      validUntil: '2027-12-31',
      insertedAt: '2026-10-03T00:00:00Z',
    }),
  );
  server.use(...documentsHandlers(state));
});

afterEach(() => {
  vi.useRealTimers();
});

function row(name: RegExp | string) {
  const el = screen.getByText(name).closest('li');
  if (!el) throw new Error(`no row ${String(name)}`);
  return within(el);
}

describe('OnboardingPage', () => {
  it('groups documents and certifications and counts required progress', async () => {
    renderWithProviders(<OnboardingPage />);
    expect(
      await screen.findByRole('heading', {
        name: 'Onboarding · season 2026-27',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Documents to read')).toBeInTheDocument();
    expect(screen.getByText('Documents to sign')).toBeInTheDocument();
    expect(screen.getByText('Certifications')).toBeInTheDocument();
    expect(screen.getAllByText('5 of 9 done')[0]).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '5',
    );

    expect(
      row('Instructor handbook').getByText('Completed'),
    ).toBeInTheDocument();
    expect(
      row('Instructor handbook').getByRole('link', { name: /Open/ }),
    ).toHaveAttribute('href', '/onboarding/asg-handbook');
    expect(
      row('Liability waiver').getByText('In progress'),
    ).toBeInTheDocument();
    expect(
      row('Liability waiver').getByRole('link', { name: /Continue/ }),
    ).toHaveAttribute('href', '/onboarding/asg-waiver');
  });

  it('shows every certification state with the right action', async () => {
    renderWithProviders(<OnboardingPage />);
    await screen.findByText('Certifications');
    expect(
      row('CSIA Level 3').getByText('Awaiting review'),
    ).toBeInTheDocument();
    expect(
      row('CSIA Level 3').getByText('Valid until Jun 30, 2027'),
    ).toBeInTheDocument();
    expect(
      row('CASI Park Level 2').getByText('Expiring soon'),
    ).toBeInTheDocument();
    expect(row('CSIA Park Level 1').getByText('Expired')).toBeInTheDocument();
    expect(
      row('CSIA Park Level 1').getByRole('button', { name: /Upload new/ }),
    ).toBeInTheDocument();
    expect(row('CASI Level 2').getByText('Rejected')).toBeInTheDocument();
    expect(
      row('CASI Level 2').getByText('Reviewer note: Photo is blurry'),
    ).toBeInTheDocument();
    expect(row('CSIA Carving Level 1').getByText('Valid')).toBeInTheDocument();
    expect(row('CSIA Carving Level 1').queryByRole('button')).toBeNull();
    expect(
      row('CASI Carving Level 1').getByText('Not uploaded'),
    ).toBeInTheDocument();
    expect(
      row('CASI Carving Level 1').getByRole('button', {
        name: 'Upload: CASI Carving Level 1',
      }),
    ).toBeInTheDocument();
  });

  it('shows pending uploads as awaiting review', async () => {
    state.certUploads = [fakeCertUpload({ validUntil: '2027-12-31' })];
    state.meCerts = [{ org: 'csia', track: 'regular', level: 3 }];
    renderWithProviders(<OnboardingPage />);
    expect(await screen.findByText('Awaiting review')).toBeInTheDocument();
  });

  it('requires a file and a valid-until date of today or later, then uploads', async () => {
    const user = userEvent.setup();
    let ticket: CertUploadUrlRequest | undefined;
    let putType: string | null = null;
    let confirmed = false;
    server.use(
      http.post(
        `${API}/me/certification-uploads/upload-url`,
        async ({ request }) => {
          ticket = (await request.json()) as CertUploadUrlRequest;
          return HttpResponse.json({
            uploadId: 'cu-new',
            uploadUrl: `${MOCK_STORAGE_ORIGIN}/upload/certifications/cu-new?sig=mock`,
            expiresAt: '2026-10-12T15:00:00Z',
          });
        },
      ),
      http.put(
        `${MOCK_STORAGE_ORIGIN}/upload/certifications/cu-new`,
        ({ request }) => {
          putType = request.headers.get('content-type');
          return new HttpResponse(null, { status: 200 });
        },
      ),
      http.post(`${API}/me/certification-uploads/cu-new/confirm`, () => {
        confirmed = true;
        return HttpResponse.json(
          fakeCertUpload({ id: 'cu-new', org: 'casi', track: 'carving' }),
        );
      }),
    );
    renderWithProviders(<OnboardingPage />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Upload: CASI Carving Level 1',
      }),
    );
    const dialog = screen.getByRole('dialog', {
      name: 'Upload CASI Carving Level 1',
    });
    const date = within(dialog).getByLabelText(/Valid until/);
    expect(date).toHaveAttribute('min', '2026-10-12');
    expect(date).toBeRequired();

    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(within(dialog).getByText('Choose a file.')).toBeInTheDocument();
    expect(
      within(dialog).getByText('This field is required.'),
    ).toBeInTheDocument();

    const pdf = sizedFile('cert.pdf', 'application/pdf', 4321);
    await user.upload(within(dialog).getByLabelText(/Certificate file/), pdf);
    await user.type(date, '2026-10-11');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(
      within(dialog).getByText('Must be today or later.'),
    ).toBeInTheDocument();
    expect(ticket).toBeUndefined();

    await user.clear(date);
    await user.type(date, '2026-10-12');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(
      await screen.findByText('Uploaded — awaiting review.'),
    ).toBeInTheDocument();
    expect(ticket).toEqual({
      org: 'casi',
      track: 'carving',
      validUntil: '2026-10-12',
      contentType: 'application/pdf',
      contentLength: 4321,
    });
    expect(putType).toBe('application/pdf');
    expect(confirmed).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sets the valid-until minimum to the UTC date', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 13, 1, 30)));
    const user = userEvent.setup();
    renderWithProviders(<OnboardingPage />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Upload: CASI Carving Level 1',
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByLabelText(/Valid until/),
    ).toHaveAttribute('min', '2026-10-13');
  });

  it('shows an upload failure inside the sheet', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/me/certification-uploads/upload-url`, () =>
        HttpResponse.json({ message: 'nope' }, { status: 500 }),
      ),
    );
    renderWithProviders(<OnboardingPage />);
    await user.click(
      await screen.findByRole('button', {
        name: 'Upload: CASI Carving Level 1',
      }),
    );
    const dialog = screen.getByRole('dialog');
    await user.upload(
      within(dialog).getByLabelText(/Certificate file/),
      sizedFile('c.pdf', 'application/pdf', 10),
    );
    await user.type(within(dialog).getByLabelText(/Valid until/), '2027-01-01');
    await user.click(within(dialog).getByRole('button', { name: 'Upload' }));
    expect(
      await within(dialog).findByText('Upload failed. Try again.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderWithProviders(<OnboardingPage />);
    expect(
      await screen.findByRole('heading', { name: '入职资料 · 2026-27 雪季' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('已完成 5 / 9')[0]).toBeInTheDocument();
    expect(screen.getByText('教练手册')).toBeInTheDocument();
    expect(screen.getAllByText('已过期').length).toBeGreaterThan(0);
  });

  it('offers a retry when the checklist fails to load', async () => {
    server.use(
      http.get(`${API}/me/documents`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderWithProviders(<OnboardingPage />);
    expect(
      await screen.findByText('Your onboarding checklist could not be loaded.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    server.use(
      http.get(`${API}/me/documents`, () =>
        HttpResponse.json({ season: '2026-27', items: [] }),
      ),
    );
    renderWithProviders(<OnboardingPage />);
    expect(
      await screen.findByText('Nothing to do right now.'),
    ).toBeInTheDocument();
  });
});

describe('OnboardingCard', () => {
  it('summarises progress and links to the checklist', async () => {
    renderWithProviders(<OnboardingCard />);
    expect(await screen.findByText('5 of 9 done')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to onboarding' }),
    ).toHaveAttribute('href', '/onboarding');
  });

  it('says all done when every required item is complete', async () => {
    state.assignments = state.assignments.filter(
      (a) => a.status === 'completed',
    );
    state.meCerts = [{ org: 'csia', track: 'carving', level: 1 }];
    renderWithProviders(<OnboardingCard />);
    expect(await screen.findByText('All done')).toBeInTheDocument();
  });

  it('renders nothing without items', async () => {
    server.use(
      http.get(`${API}/me/documents`, () =>
        HttpResponse.json({ season: '2026-27', items: [] }),
      ),
    );
    const { container } = renderWithProviders(<OnboardingCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
