import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Link, Route, Routes } from 'react-router-dom';
import { OnboardingDocumentPage } from './OnboardingDocumentPage';
import { renderWithProviders } from '@/test/render';
import { fakeGoLive, fakeProfile, server } from '@/test/msw';
import type { CompleteRequest } from '../api';
import { LangSwitch } from '@/components/LangSwitch';
import { fakeAssignment, fakeField, fakeTranslation } from '../api/fixtures';
import { signingDraftKey } from '../signer/signingDraft';
import {
  createDocumentsState,
  documentsHandlers,
  type DocumentsMockState,
} from '../api/handlers';
import { fakePdf } from '../testing/fakePdfPages';
import { AppShell } from '@/app/shell/AppShell';
import { LessonsPayPage } from '@/features/lessons/LessonsPayPage';
import { fullLessons, onboardingLessons } from '@/features/lessons/fixtures';
import { ProfileViewPage } from '@/features/instructor/ProfileViewPage';

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
  useSession: () => ({
    user: { id: 'user-jane', email: 'jane@example.com' },
  }),
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

function stubLocationAssign() {
  const assign = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    assign,
  });
  return assign;
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
    const assign = stubLocationAssign();
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
    ).toHaveValue('Jane Snow');
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
    ).toHaveValue('Jane A. Snow');

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
    expect(await screen.findAllByText(/SHA-256: e5f6a7b8/)).not.toHaveLength(0);
    expect(assign).toHaveBeenCalledWith(
      'https://storage.mock/signed/asg-new.pdf?sig=mock',
    );
    expect(open).not.toHaveBeenCalled();
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
    ).toHaveValue('Janet Snowden');
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

  it('downloads the signed copy of a completed document in place', async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const assign = stubLocationAssign();
    renderAt('asg-conduct');
    expect(
      await screen.findByRole('heading', { name: 'Signed' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SHA-256: b7e4d2a1/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Download signed copy' }),
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        'https://storage.mock/signed/asg-conduct.pdf?sig=mock',
      ),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a failed download link', async () => {
    const user = userEvent.setup();
    const assign = stubLocationAssign();
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
    expect(assign).not.toHaveBeenCalled();
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

  it('shows the deactivated banner instead of the document', async () => {
    state.meIsActive = false;
    renderAt('asg-new');
    expect(
      await screen.findByText('Your profile is deactivated'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign and submit' }),
    ).not.toBeInTheDocument();
  });

  it('shows the deactivated banner when signing is refused', async () => {
    const user = userEvent.setup();
    state.templates.find((t) => t.id === 'tpl-conduct')!.fields = [];
    renderAt('asg-new');
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    );
    state.meIsActive = false;
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      await screen.findByText('Your profile is deactivated'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign and submit' }),
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

  it('reaches submit and the checklist from the bottom bar while fields are missing', async () => {
    const user = userEvent.setup();
    setMobile(true);
    renderAt('asg-new');
    const stepper = within(await screen.findByTestId('mobile-stepper'));
    await user.click(stepper.getByRole('button', { name: 'Next field →' }));
    expect(fakePdf.lastZoom).toBe(2);
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await user.click(stepper.getByRole('button', { name: 'Review & submit' }));
    expect(fakePdf.lastZoom).toBe(1);
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' }),
    );
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;

    const back = stepper.getByRole('link', { name: /Back to checklist/ });
    expect(back).toHaveAttribute('href', '/onboarding');
    await user.click(back);
    expect(await screen.findByText('Checklist')).toBeInTheDocument();
  });

  it('zooms to a text field tapped directly and keeps its font at 16px', async () => {
    const user = userEvent.setup();
    setMobile(true);
    state.templates
      .find((t) => t.id === 'tpl-conduct')!
      .fields.push(
        fakeField({
          id: 'f_phone',
          type: 'text',
          x: 72,
          y: 300,
          w: 100,
          h: 14,
          required: false,
          labelEn: 'Phone',
        }),
      );
    renderAt('asg-new');
    const phone = await screen.findByRole('textbox', { name: 'Phone' });
    expect(phone).toHaveStyle({ fontSize: '16px' });
    expect(phone.style.transform).toMatch(/^scale\(0\.\d+\)$/);
    await user.click(phone);
    expect(phone).toHaveFocus();
    expect(fakePdf.lastZoom).toBe(2.2);
    await waitFor(() =>
      expect(fakePdf.scrollToRect).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ id: 'f_phone' }),
      ),
    );
    await user.type(phone, '555');
    expect(phone).toHaveValue('555');
  });

  it('edits the legal name from the Full name field on the document', async () => {
    const user = userEvent.setup();
    setMobile(true);
    state.templates
      .find((t) => t.id === 'tpl-conduct')!
      .fields.push(
        fakeField({
          id: 'f_print',
          type: 'text',
          prefill: 'full_name',
          y: 300,
          required: false,
          labelEn: 'Printed name',
        }),
        fakeField({
          id: 'f_mail',
          type: 'text',
          prefill: 'email',
          y: 320,
          required: false,
          labelEn: 'Email',
        }),
      );
    renderAt('asg-new');
    const name = await screen.findByRole('textbox', {
      name: 'Full name (required)',
    });
    expect(name).toHaveStyle({ fontSize: '16px' });
    await user.click(name);
    expect(name).toHaveFocus();
    await waitFor(() =>
      expect(fakePdf.scrollToRect).toHaveBeenLastCalledWith(
        1,
        expect.objectContaining({ id: 'f_name' }),
      ),
    );
    await user.type(name, ' Updated');
    expect(name).toHaveValue('Jane Snow Updated');
    expect(screen.getByLabelText(/Full legal name/)).toHaveValue(
      'Jane Snow Updated',
    );
    expect(screen.getByRole('textbox', { name: 'Printed name' })).toHaveValue(
      'Jane Snow Updated',
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute(
      'aria-readonly',
      'true',
    );

    await user.click(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Signature (required)' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Use signature' }));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      await screen.findByRole('heading', { name: 'Signed' }),
    ).toBeInTheDocument();
    expect(completeBody).toMatchObject({
      signerName: 'Jane Snow Updated',
      values: {
        f_name: 'Jane Snow Updated',
        f_print: 'Jane Snow Updated',
        f_mail: 'jane@example.com',
      },
    });
  });

  it('keeps the desktop text field size and zoom on focus', async () => {
    const user = userEvent.setup();
    state.templates
      .find((t) => t.id === 'tpl-conduct')!
      .fields.push(
        fakeField({
          id: 'f_phone',
          type: 'text',
          h: 14,
          required: false,
          labelEn: 'Phone',
        }),
      );
    renderAt('asg-new');
    const phone = await screen.findByRole('textbox', { name: 'Phone' });
    await user.click(phone);
    expect(phone.style.transform).toBe('');
    expect(fakePdf.lastZoom).toBe(1);
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

describe('OnboardingDocumentPage — draft', () => {
  const draftKey = signingDraftKey('user-jane', 'asg-new');

  async function fillSomeFields(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Signature (required)' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Use signature' }));
    const legal = screen.getByLabelText(/Full legal name/);
    await user.clear(legal);
    await user.type(legal, 'Jane A. Snow');
  }

  it('restores in-progress values and signatures after leaving the page', async () => {
    const user = userEvent.setup();
    const first = renderAt('asg-new');
    await fillSomeFields(user);
    expect(screen.queryByText(/restored the progress/)).toBeNull();
    first.unmount();
    expect(localStorage.getItem(draftKey)).not.toBeNull();

    renderAt('asg-new');
    expect(
      await screen.findByText(
        'We restored the progress you saved on this device.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    ).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Signature (required)' }),
    ).toHaveTextContent('Jane Snow');
    expect(screen.getByLabelText(/Full legal name/)).toHaveValue(
      'Jane A. Snow',
    );
    expect(
      screen.getByRole('textbox', { name: 'Full name (required)' }),
    ).toHaveValue('Jane A. Snow');
    expect(
      screen.getByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    ).not.toBeChecked();
  });

  it('saves the draft while signing without leaving the page', async () => {
    const user = userEvent.setup();
    renderAt('asg-new');
    await fillSomeFields(user);
    await waitFor(() =>
      expect(localStorage.getItem(draftKey)).toContain('Jane A. Snow'),
    );
  });

  it('removes the draft once the document is signed', async () => {
    const user = userEvent.setup();
    renderAt('asg-new');
    await fillSomeFields(user);
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I agree to sign this document electronically',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      await screen.findByRole('heading', { name: 'Signed' }),
    ).toBeInTheDocument();
    expect(localStorage.getItem(draftKey)).toBeNull();
  });

  it('does not save a draft when nothing was changed', async () => {
    const first = renderAt('asg-new');
    await screen.findByLabelText(/Full legal name/);
    first.unmount();
    expect(localStorage.getItem(draftKey)).toBeNull();
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

describe('OnboardingDocumentPage — last item', () => {
  it('unlocks Lessons & pay without a reload once the last required item is done', async () => {
    state.assignments = state.assignments.filter(
      (a) => a.status === 'completed' || a.id === 'asg-read',
    );
    state.meCerts = [];
    server.use(
      http.get(`${API}/me/lessons`, () =>
        HttpResponse.json(
          state.assignments.every((a) => a.status === 'completed')
            ? fullLessons
            : onboardingLessons,
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/lessons" element={<LessonsPayPage />} />
          <Route
            path="/onboarding"
            element={<Link to="/onboarding/asg-read">Open handbook</Link>}
          />
          <Route
            path="/onboarding/:assignmentId"
            element={<OnboardingDocumentPage />}
          />
        </Route>
      </Routes>,
      { route: '/lessons', staleTime: 60_000 },
    );
    expect(
      await screen.findByText('Finish onboarding to see your lessons and pay'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', {
        name: 'Lessons & pay Locked until you finish onboarding',
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Go to onboarding' }));
    await user.click(screen.getByRole('link', { name: 'Open handbook' }));
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'I have read and understood this document',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('heading', { name: 'Marked as read' });

    const lessons = await screen.findByRole('link', { name: 'Lessons & pay' });
    await user.click(lessons);
    expect(
      await screen.findByRole('table', { name: 'Upcoming lessons' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Finish onboarding to see your lessons and pay'),
    ).toBeNull();
  });
});

describe('OnboardingDocumentPage — go-live status', () => {
  it('moves the profile card to going live once the last document is done, without a reload', async () => {
    state.assignments = state.assignments.filter(
      (a) => a.status === 'completed' || a.id === 'asg-read',
    );
    state.meCerts = [];
    const handbookDone = () =>
      state.assignments.some(
        (a) => a.id === 'asg-read' && a.status === 'completed',
      );
    server.use(
      http.get(`${API}/me/instructor`, () =>
        HttpResponse.json({
          ...fakeProfile,
          approvalStatus: 'approved',
          isActive: true,
        }),
      ),
      http.get(`${API}/me/go-live`, () =>
        HttpResponse.json(
          handbookDone()
            ? { ...fakeGoLive, ready: true, missing: [] }
            : {
                ...fakeGoLive,
                missing: [
                  {
                    group: 'onboarding',
                    assignmentId: 'asg-read',
                    titleEn: 'Instructor handbook',
                    titleZh: '教练手册',
                  },
                ],
              },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/profile" element={<ProfileViewPage />} />
          <Route
            path="/onboarding"
            element={<Link to="/onboarding/asg-read">Open handbook</Link>}
          />
          <Route
            path="/onboarding/:assignmentId"
            element={<OnboardingDocumentPage />}
          />
        </Route>
      </Routes>,
      { route: '/profile', staleTime: 60_000 },
    );

    expect(
      await screen.findByText('Required items pending'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to onboarding' }));
    await user.click(screen.getByRole('link', { name: 'Open handbook' }));
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'I have read and understood this document',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('heading', { name: 'Marked as read' });

    await user.click(screen.getByRole('link', { name: 'My profile' }));
    expect(await screen.findByText('Going live')).toBeInTheDocument();
    expect(
      screen.getByText('Usually within a few minutes.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Required items pending')).toBeNull();
  });
});

describe('OnboardingDocumentPage — language versions', () => {
  let requested: (string | null)[];

  function makeBilingual() {
    const conduct = state.templates.find((t) => t.id === 'tpl-conduct')!;
    Object.assign(conduct, {
      sourceLanguage: 'en',
      translations: [
        fakeTranslation('tpl-conduct', {
          language: 'zh',
          fields: [
            fakeField({
              id: 'f_zh_sig',
              labelEn: 'Chinese signature',
              labelZh: '中文签名',
            }),
          ],
        }),
      ],
    });
  }

  function captureRequests() {
    requested = [];
    server.use(
      http.get(`${API}/me/documents/:id`, ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('language'));
        return undefined;
      }),
    );
  }

  function renderWithToggle(id: string) {
    return renderWithProviders(
      <>
        <LangSwitch />
        <Routes>
          <Route
            path="/onboarding/:assignmentId"
            element={<OnboardingDocumentPage />}
          />
        </Routes>
      </>,
      { route: `/onboarding/${id}` },
    );
  }

  const source = () =>
    screen.getByTestId('pdf-pages').getAttribute('data-source');
  const versionSwitch = (name = 'Document language') =>
    screen.getByRole('group', { name });

  async function signTyped(
    user: ReturnType<typeof userEvent.setup>,
    field: string,
  ) {
    await user.click(screen.getByRole('button', { name: field }));
    await user.click(screen.getByRole('tab', { name: 'Type' }));
    await user.click(screen.getByRole('button', { name: 'Use signature' }));
  }

  beforeEach(() => {
    captureRequests();
  });

  it("requests the UI language's version and shows its PDF and fields", async () => {
    makeBilingual();
    localStorage.setItem('ssms.locale', 'zh-CN');
    renderAt('asg-new');
    expect(
      await screen.findByRole('heading', { name: '行为准则' }),
    ).toBeInTheDocument();
    expect(requested).toEqual(['zh']);
    expect(source()).toBe(
      'https://storage.mock/templates/tpl-conduct/zh/source.pdf',
    );
    expect(
      screen.getByRole('button', { name: '中文签名 (必填)' }),
    ).toBeInTheDocument();
    expect(
      within(versionSwitch('文件语言')).getByRole('button', { name: '中文' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back to the only version when the UI language has none', async () => {
    const conduct = state.templates.find((t) => t.id === 'tpl-conduct')!;
    conduct.sourceLanguage = 'zh';
    const user = userEvent.setup();
    renderWithToggle('asg-new');
    expect(
      await screen.findByRole('heading', { name: 'Code of conduct' }),
    ).toBeInTheDocument();
    expect(requested).toEqual(['en']);
    expect(source()).toBe(
      'https://storage.mock/templates/tpl-conduct/source.pdf',
    );
    expect(
      screen.queryByRole('group', { name: 'Document language' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: '中文' }));
    expect(
      await screen.findByRole('heading', { name: '行为准则' }),
    ).toBeInTheDocument();
    expect(requested).toEqual(['en']);
  });

  it('switches the document when the UI language or the page switch changes', async () => {
    makeBilingual();
    const user = userEvent.setup();
    renderWithToggle('asg-new');
    await screen.findByRole('heading', { name: 'Code of conduct' });
    expect(source()).toBe(
      'https://storage.mock/templates/tpl-conduct/source.pdf',
    );
    expect(
      screen.getByRole('button', { name: 'Signature (required)' }),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '中文' })[0]!);
    await waitFor(() =>
      expect(source()).toBe(
        'https://storage.mock/templates/tpl-conduct/zh/source.pdf',
      ),
    );
    expect(requested).toEqual(['en', 'zh']);
    expect(
      screen.getByRole('button', { name: '中文签名 (必填)' }),
    ).toBeInTheDocument();

    await user.click(
      within(versionSwitch('文件语言')).getByRole('button', {
        name: 'EN',
      }),
    );
    await waitFor(() =>
      expect(source()).toBe(
        'https://storage.mock/templates/tpl-conduct/source.pdf',
      ),
    );
    expect(
      screen.getByRole('heading', { name: '行为准则' }),
    ).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'EN' })[0]!);
    await user.click(screen.getAllByRole('button', { name: '中文' })[0]!);
    await waitFor(() =>
      expect(source()).toBe(
        'https://storage.mock/templates/tpl-conduct/zh/source.pdf',
      ),
    );
  });

  it('keeps a separate draft for each language version', async () => {
    makeBilingual();
    const user = userEvent.setup();
    renderWithToggle('asg-new');
    await user.click(
      await screen.findByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(
      within(versionSwitch()).getByRole('button', { name: '中文' }),
    );
    await screen.findByRole('button', {
      name: 'Chinese signature (required)',
    });
    expect(
      localStorage.getItem(signingDraftKey('user-jane', 'asg-new', 'en')),
    ).toContain('f_agree');
    expect(screen.queryByText(/restored the progress/)).toBeNull();
    await signTyped(user, 'Chinese signature (required)');

    await user.click(
      within(versionSwitch()).getByRole('button', { name: 'EN' }),
    );
    expect(
      await screen.findByText(
        'We restored the progress you saved on this device.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    ).toBeChecked();
    expect(
      localStorage.getItem(signingDraftKey('user-jane', 'asg-new', 'zh')),
    ).toContain('f_zh_sig');
    expect(
      localStorage.getItem(signingDraftKey('user-jane', 'asg-new')),
    ).toBeNull();
  });

  it('signs the chosen version and sends its language', async () => {
    makeBilingual();
    const user = userEvent.setup();
    renderAt('asg-new');
    await screen.findByRole('heading', { name: 'Code of conduct' });
    await user.click(
      within(versionSwitch()).getByRole('button', { name: '中文' }),
    );
    await signTyped(user, 'Chinese signature (required)');
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
      language: 'zh',
      consent: true,
      signerName: 'Jane Snow',
      values: {},
      signatures: { f_zh_sig: { mode: 'typed', text: 'Jane Snow' } },
    });
    expect(state.assignments.find((a) => a.id === 'asg-new')?.language).toBe(
      'zh',
    );
    for (const language of [null, 'en', 'zh'] as const)
      expect(
        localStorage.getItem(signingDraftKey('user-jane', 'asg-new', language)),
      ).toBeNull();
  });

  it('sends the language when a read document is acknowledged', async () => {
    const handbook = state.templates.find((t) => t.id === 'tpl-handbook')!;
    Object.assign(handbook, {
      sourceLanguage: 'zh',
      translations: [fakeTranslation('tpl-handbook', { language: 'en' })],
    });
    const user = userEvent.setup();
    renderAt('asg-read');
    await screen.findByRole('heading', { name: 'Instructor handbook' });
    expect(source()).toBe(
      'https://storage.mock/templates/tpl-handbook/en/source.pdf',
    );
    await user.click(
      screen.getByRole('checkbox', {
        name: 'I have read and understood this document',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByRole('heading', { name: 'Marked as read' });
    expect(completeBody).toEqual({ acknowledged: true, language: 'en' });
  });

  it('leaves an unlabelled document as it was when the UI language changes', async () => {
    const user = userEvent.setup();
    renderWithToggle('asg-new');
    await screen.findByRole('heading', { name: 'Code of conduct' });
    expect(
      screen.queryByRole('group', { name: 'Document language' }),
    ).toBeNull();
    await user.click(
      screen.getByRole('checkbox', { name: 'I agree (required)' }),
    );
    await user.click(screen.getByRole('button', { name: '中文' }));
    expect(
      await screen.findByRole('heading', { name: '行为准则' }),
    ).toBeInTheDocument();
    expect(requested).toEqual(['en']);
    expect(source()).toBe(
      'https://storage.mock/templates/tpl-conduct/source.pdf',
    );
    expect(
      screen.getByRole('checkbox', { name: '我同意 (必填)' }),
    ).toBeChecked();
    expect(screen.queryByText('已恢复您在本设备上保存的填写进度。')).toBeNull();
  });
});

describe('OnboardingDocumentPage — expiring PDF links', () => {
  const SOURCE = 'https://storage.mock/templates/tpl-conduct/source.pdf';
  let opens: number;

  function countOpens() {
    opens = 0;
    server.events.on('request:start', ({ request }) => {
      if (
        request.method === 'GET' &&
        new URL(request.url).pathname === '/me/documents/asg-new'
      )
        opens += 1;
    });
  }

  function renderWithChecklist() {
    return renderWithProviders(
      <Routes>
        <Route
          path="/onboarding/:assignmentId"
          element={<OnboardingDocumentPage />}
        />
        <Route
          path="/onboarding"
          element={<Link to="/onboarding/asg-new">Open again</Link>}
        />
      </Routes>,
      { route: '/onboarding/asg-new' },
    );
  }

  function renameOnServer() {
    state.templates.find((t) => t.id === 'tpl-conduct')!.titleEn =
      'Code of conduct (fresh)';
  }

  async function leaveAndReturnAt(
    user: ReturnType<typeof userEvent.setup>,
    time: string,
  ) {
    await user.click(
      screen.getAllByRole('link', { name: /Back to checklist/ })[0]!,
    );
    renameOnServer();
    vi.setSystemTime(new Date(time));
    await user.click(screen.getByRole('link', { name: 'Open again' }));
  }

  afterEach(() => {
    server.events.removeAllListeners();
    fakePdf.failingSources.clear();
  });

  it('fetches the document again, with a new PDF link, when the instructor comes back after it may have expired', async () => {
    countOpens();
    const user = userEvent.setup();
    renderWithChecklist();
    await screen.findByRole('heading', { name: 'Code of conduct' });
    await leaveAndReturnAt(user, '2026-10-12T10:05:00-04:00');
    expect(
      await screen.findByRole('heading', { name: 'Code of conduct (fresh)' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('pdf-pages')).toHaveAttribute(
      'data-source',
      SOURCE,
    );
    expect(opens).toBe(2);
  });

  it('reuses the cached document when the instructor comes back within a few minutes', async () => {
    countOpens();
    const user = userEvent.setup();
    renderWithChecklist();
    await screen.findByRole('heading', { name: 'Code of conduct' });
    await leaveAndReturnAt(user, '2026-10-12T10:01:00-04:00');
    expect(
      await screen.findByRole('heading', { name: 'Code of conduct' }),
    ).toBeInTheDocument();
    expect(opens).toBe(1);
  });

  it('does not refetch in a loop when a just-fetched link fails to load', async () => {
    countOpens();
    fakePdf.failingSources.add(SOURCE);
    renderWithChecklist();
    await screen.findByRole('heading', { name: 'Code of conduct' });
    await new Promise((r) => setTimeout(r, 50));
    expect(opens).toBe(1);
  });
});
