import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { OnboardingDocumentPage } from './OnboardingDocumentPage';
import { renderWithProviders } from '@/test/render';
import { fakeProfile, server } from '@/test/msw';
import type { CompleteRequest } from '../api';
import { fakeAssignment } from '../api/fixtures';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { fakePdf } from '../testing/fakePdfPages';

vi.mock('../pdf/PdfPages', async () => {
  const m = await import('../testing/fakePdfPages');
  return { PdfPages: m.FakePdfPages };
});
vi.mock('signature_pad', () => ({
  default: class {
    addEventListener() {}
    removeEventListener() {}
    isEmpty() {
      return true;
    }
    clear() {}
    toData() {
      return [];
    }
    fromData() {}
    off() {}
  },
}));
vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({ user: { email: 'jane@example.com' } }),
}));

const API = 'http://localhost:3000';
let state: DocumentsMockState;
let completeBody: CompleteRequest | undefined;

function captureComplete() {
  completeBody = undefined;
  const original = documentsHandlers(state);
  server.use(
    http.post(`${API}/me/documents/:id/complete`, async ({ request }) => {
      completeBody = (await request.clone().json()) as CompleteRequest;
      return undefined;
    }),
    ...original,
  );
}

function setMobile(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function renderAt(id: string) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/onboarding/:assignmentId"
        element={<OnboardingDocumentPage />}
      />
      <Route path="/onboarding" element={<p>Checklist</p>} />
    </Routes>,
    { route: `/onboarding/${id}` },
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T10:00:00-04:00'));
  fakePdf.pageCount = 2;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  fakePdf.scrollToRect.mockClear();
  setMobile(false);
  state = createDocumentsState();
  state.assignments.push(
    fakeAssignment({ id: 'asg-new', templateId: 'tpl-conduct' }),
    fakeAssignment({ id: 'asg-read', templateId: 'tpl-handbook' }),
  );
  captureComplete();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OnboardingDocumentPage — sign', () => {
  it('fills fields, signs, requires consent and posts the exact contract body', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderAt('asg-new');
    expect(
      await screen.findByRole('heading', { name: 'Code of conduct' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pdf-pages')).toHaveAttribute(
      'data-source',
      'https://storage.mock/templates/tpl-conduct/source.pdf',
    );
    expect(
      screen.getByRole('textbox', { name: 'Full name (required)' }),
    ).toHaveTextContent('Jane Snow');
    expect(
      screen.getByRole('textbox', { name: 'Date (required)' }),
    ).toHaveTextContent('2026-10-12');
    expect(screen.getByLabelText(/Full legal name/)).toHaveValue('Jane Snow');

    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      screen.getByText('Fill in all required fields first.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fakePdf.scrollToRect).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ id: 'f_agree' }),
      ),
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Signature (required)' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Your signature' });
    await user.click(within(dialog).getByRole('tab', { name: 'Type' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Use signature' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Signature (required)' }),
    ).toHaveTextContent('Jane Snow');

    const legal = screen.getByLabelText(/Full legal name/);
    await user.clear(legal);
    await user.type(legal, 'Jane A. Snow');
    expect(
      screen.getByRole('textbox', { name: 'Full name (required)' }),
    ).toHaveTextContent('Jane A. Snow');

    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      screen.getByText('Tick the consent box to continue.'),
    ).toBeInTheDocument();
    expect(completeBody).toBeUndefined();

    await user.click(
      screen.getByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      await screen.findByRole('heading', { name: 'Signed' }),
    ).toBeInTheDocument();
    expect(completeBody).toEqual({
      consent: true,
      signerName: 'Jane A. Snow',
      values: { f_agree: true, f_name: 'Jane A. Snow', f_date: '2026-10-12' },
      signatures: { f_sig: { mode: 'typed', text: 'Jane Snow' } },
    });

    await user.click(
      screen.getByRole('button', { name: 'Download signed copy' }),
    );
    expect(open).toHaveBeenCalledWith(
      'https://storage.mock/signed/asg-new.pdf?sig=mock',
      '_blank',
      'noopener',
    );
    expect(await screen.findAllByText(/SHA-256: e5f6a7b8/)).not.toHaveLength(0);
  });

  it('shows the consent text from the API and the Toronto signing date', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 13, 2, 30)));
    state.consentText = {
      en: 'Server consent wording.',
      zh: '服务器同意文本。',
    };
    renderAt('asg-new');
    expect(
      await screen.findByText('Server consent wording.'),
    ).toBeInTheDocument();
    expect(screen.getByText('服务器同意文本。')).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Date (required)' }),
    ).toHaveTextContent('2026-10-12');
  });

  it('requires a legal name', async () => {
    const user = userEvent.setup();
    renderAt('asg-new');
    await user.clear(await screen.findByLabelText(/Full legal name/));
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(screen.getByText('Enter your full legal name.')).toBeInTheDocument();
  });

  it('prefills the signer with the legal name', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          firstName: 'Janet',
          lastName: 'Snowden',
          legalName: 'Janet Snowden',
        }),
      ),
    );
    renderAt('asg-new');
    expect(await screen.findByLabelText(/Full legal name/)).toHaveValue(
      'Janet Snowden',
    );
    expect(
      screen.getByRole('textbox', { name: 'Full name (required)' }),
    ).toHaveTextContent('Janet Snowden');
  });

  it('falls back to the display name when the legal name is absent', async () => {
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({ ...fakeProfile, displayNameEn: 'Jay Powder' }),
      ),
    );
    renderAt('asg-new');
    expect(await screen.findByLabelText(/Full legal name/)).toHaveValue(
      'Jay Powder',
    );
  });

  it('reuses an adopted signature on the next signature field with one tap', async () => {
    const user = userEvent.setup();
    const conduct = state.templates.find((t) => t.id === 'tpl-conduct');
    conduct?.fields.push({ ...conduct.fields[2]!, id: 'f_sig2', page: 2 });
    renderAt('asg-new');
    const [first, second] = await screen.findAllByRole('button', {
      name: 'Signature (required)',
    });
    await user.click(first!);
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Use signature' }));
    await user.click(second!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(second).toHaveTextContent('Jane Snow');
  });

  it('explains a 409 as already completed', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API}/me/documents/:id/complete`, () =>
        HttpResponse.json({ message: 'Already completed' }, { status: 409 }),
      ),
    );
    state.templates.find((t) => t.id === 'tpl-conduct')!.fields = [];
    renderAt('asg-new');
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      await screen.findByText('This document has already been completed.'),
    ).toBeInTheDocument();
  });

  it('shows the signed copy for a completed document', async () => {
    renderAt('asg-conduct');
    expect(
      await screen.findByRole('heading', { name: 'Signed' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SHA-256: b7e4d2a1/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download signed copy' }),
    ).toBeInTheDocument();
  });

  it('reports a failed download link', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${API}/me/documents/:id/signed-url`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    renderAt('asg-conduct');
    await user.click(
      await screen.findByRole('button', { name: 'Download signed copy' }),
    );
    expect(
      await screen.findByText(
        'The download link could not be created. Try again.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an error when the document has no PDF to open', async () => {
    state.assignments.push(
      fakeAssignment({ id: 'asg-nosource', templateId: 'tpl-draft' }),
    );
    renderAt('asg-nosource');
    expect(
      await screen.findByText(
        'This document is not available to open yet. Ask an admin to check it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-pages')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Sign and submit' }),
    ).toBeNull();
  });

  it('shows an error for an unknown assignment', async () => {
    renderAt('nope');
    expect(
      await screen.findByText('The document could not be loaded.'),
    ).toBeInTheDocument();
  });

  it('shows the not-approved banner for a rejected instructor', async () => {
    state.meApprovalStatus = 'rejected';
    renderAt('asg-new');
    expect(
      await screen.findByText("Your profile wasn't approved"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The document could not be loaded.'),
    ).not.toBeInTheDocument();
  });

  it('shows the review banner instead of the document while pending approval', async () => {
    state.meApprovalStatus = 'pending';
    renderAt('asg-new');
    expect(
      await screen.findByText('Your profile is being reviewed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "These open once an admin approves you. We'll email you.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The document could not be loaded.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Back to checklist/ }),
    ).toHaveAttribute('href', '/onboarding');
  });
});

describe('OnboardingDocumentPage — mobile stepper', () => {
  it('steps through required fields, zooming and scrolling to each one', async () => {
    const user = userEvent.setup();
    setMobile(true);
    renderAt('asg-new');
    const stepper = within(await screen.findByTestId('mobile-stepper'));
    expect(stepper.getByText('2 required left')).toBeInTheDocument();

    await user.click(stepper.getByRole('button', { name: 'Next field →' }));
    expect(stepper.getByText('1 of 4 · I agree')).toBeInTheDocument();
    expect(fakePdf.lastZoom).toBe(2);
    await waitFor(() =>
      expect(fakePdf.scrollToRect).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ id: 'f_agree' }),
      ),
    );

    await user.click(stepper.getByRole('button', { name: 'Next field →' }));
    expect(stepper.getByText('4 of 4 · Signature')).toBeInTheDocument();
    expect(fakePdf.lastZoom).toBeCloseTo(1.22, 2);
    await waitFor(() =>
      expect(fakePdf.scrollToRect).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ id: 'f_sig' }),
      ),
    );

    await user.click(stepper.getByRole('button', { name: 'Previous' }));
    expect(stepper.getByText('3 of 4 · Date')).toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Signature (required)' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Use signature' }));
    expect(
      stepper.getByText('All required fields are filled.'),
    ).toBeInTheDocument();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await user.click(stepper.getByRole('button', { name: 'Next field →' }));
    expect(fakePdf.lastZoom).toBe(1);
    expect(scrollIntoView).toHaveBeenCalled();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('has zoom controls', async () => {
    const user = userEvent.setup();
    renderAt('asg-new');
    await user.click(await screen.findByRole('button', { name: 'Zoom in' }));
    expect(fakePdf.lastZoom).toBe(1.25);
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(fakePdf.lastZoom).toBe(1);
  });
});

describe('OnboardingDocumentPage — read', () => {
  it('ticks "I have read and understood" and posts acknowledged', async () => {
    const user = userEvent.setup();
    renderAt('asg-read');
    expect(
      await screen.findByRole('heading', { name: 'Instructor handbook' }),
    ).toBeInTheDocument();
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I have read and understood this document',
      }),
    );
    await user.click(done);
    expect(
      await screen.findByRole('heading', { name: 'Marked as read' }),
    ).toBeInTheDocument();
    expect(completeBody).toEqual({ acknowledged: true });
  });

  it('renders the read view in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderAt('asg-read');
    expect(
      await screen.findByRole('heading', { name: '教练手册' }),
    ).toBeInTheDocument();
    expect(screen.getByText('我已阅读并理解本文件')).toBeInTheDocument();
  });
});
