import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { server } from '@/test/msw';
import { renderWithProviders } from '@/test/render';
import { mockImagePipeline, sizedFile } from '@/test/imageMocks';
import { AppShell } from '@/app/shell/AppShell';
import {
  createDocumentsState,
  documentsHandlers,
} from '@/features/documents/api/handlers';
import { BugReportButton } from './BugReportButton';
import {
  createBugReportsState,
  myBugReportHandlers,
  reportsSent,
  type BugReportsMockState,
} from './fixtures';
import { SCREENSHOT_MAX_BYTES } from './screenshot';
import type { BugReportBody } from './types';

const API = 'http://localhost:3000';

const session = vi.hoisted(() => ({ isAdmin: true }));

vi.mock('@/auth/SessionProvider', () => ({
  useSession: () => ({
    isAdmin: session.isAdmin,
    user: { id: 'auth-1', email: 'someone@example.com' },
    signOut: vi.fn(),
  }),
}));

let state: BugReportsMockState;

beforeEach(() => {
  session.isAdmin = true;
  state = createBugReportsState();
  server.use(...myBugReportHandlers(state));
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:screenshot'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

function renderButton() {
  const user = userEvent.setup();
  renderWithProviders(<BugReportButton />);
  return user;
}

async function openDialog(user = renderButton()) {
  await user.click(screen.getByRole('button', { name: 'Report an issue' }));
  return {
    user,
    dialog: screen.getByRole('dialog', { name: 'Report an issue' }),
  };
}

function describeBox() {
  return screen.getByRole('textbox', { name: /What happened/ });
}

function sendButton() {
  return screen.getByRole('button', { name: 'Send report' });
}

function screenshotInput() {
  return screen.getByLabelText('Add screenshot') as HTMLInputElement;
}

describe('bug report button in the portal shell', () => {
  function renderShell(route: string) {
    server.use(
      ...documentsHandlers(
        createDocumentsState({ meApprovalStatus: 'approved' }),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<p>Dashboard page</p>} />
          <Route path="/profile" element={<p>Profile page</p>} />
        </Route>
      </Routes>,
      { route },
    );
  }

  it('shows the icon button to admins', () => {
    renderShell('/admin');
    const button = screen.getByRole('button', { name: 'Report an issue' });
    expect(button).toHaveAttribute('title', 'Report an issue');
    expect(button).toHaveTextContent('');
  });

  it('shows the icon button to instructors', () => {
    session.isAdmin = false;
    renderShell('/profile');
    expect(
      screen.getByRole('button', { name: 'Report an issue' }),
    ).toBeInTheDocument();
  });
});

describe('bug report button', () => {
  it('shows "Report an issue" on hover and on keyboard focus', async () => {
    const user = renderButton();
    const button = screen.getByRole('button', { name: 'Report an issue' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(button);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Report an issue');
    await user.unhover(button);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();
    expect(button).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Report an issue');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('sits above a bar pinned to the bottom of the screen', async () => {
    const bar = document.createElement('div');
    bar.style.position = 'fixed';
    document.body.appendChild(bar);
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight - 64,
      bottom: window.innerHeight,
      height: 64,
    } as DOMRect);
    Object.assign(document, { elementsFromPoint: () => [bar] });

    renderButton();
    const wrapper = screen.getByRole('button', {
      name: 'Report an issue',
    }).parentElement!;
    await waitFor(() =>
      expect(wrapper.style.bottom).toBe(
        'calc(80px + env(safe-area-inset-bottom))',
      ),
    );

    bar.remove();
    Reflect.deleteProperty(document, 'elementsFromPoint');
  });

  it('ignores full-screen overlays when lifting itself', async () => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    document.body.appendChild(overlay);
    vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: window.innerHeight,
      height: window.innerHeight,
    } as DOMRect);
    Object.assign(document, { elementsFromPoint: () => [overlay] });

    renderButton();
    const wrapper = screen.getByRole('button', {
      name: 'Report an issue',
    }).parentElement!;
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(wrapper.style.bottom).toBe(
      'calc(16px + env(safe-area-inset-bottom))',
    );

    overlay.remove();
    Reflect.deleteProperty(document, 'elementsFromPoint');
  });
});

describe('report dialog', () => {
  it('opens with the fields and a collapsed line about what else is sent', async () => {
    const { dialog } = await openDialog();
    expect(describeBox()).toHaveFocus();
    expect(describeBox()).toBeRequired();
    expect(describeBox()).toHaveAttribute('maxLength', '4000');
    expect(
      within(dialog).getByRole('textbox', { name: 'What did you expect' }),
    ).toHaveAttribute('maxLength', '2000');
    const severity = within(dialog).getByRole('group', {
      name: 'How bad is it',
    });
    expect(
      within(severity)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')!.textContent),
    ).toEqual([
      "Can't continue",
      'Something is wrong but I can work',
      'Small annoyance',
    ]);
    expect(screenshotInput()).toHaveAttribute(
      'accept',
      'image/png,image/jpeg,image/webp',
    );
    const details = within(dialog)
      .getByText('We also send: page, browser, screen size')
      .closest('details')!;
    expect(details).not.toHaveAttribute('open');
  });

  it('requires a description and sends nothing without one', async () => {
    const { user } = await openDialog();
    await user.type(
      screen.getByRole('textbox', { name: 'What did you expect' }),
      'A page',
    );
    await user.click(sendButton());
    expect(await screen.findByText('Tell us what happened.')).toBeVisible();
    expect(describeBox()).toHaveFocus();
    expect(describeBox()).toHaveAttribute('aria-invalid', 'true');
    expect(state.calls).toEqual([]);
  });

  it('caps what happened at 4000 and what was expected at 2000 characters', async () => {
    const { user } = await openDialog();
    await user.click(describeBox());
    await user.paste('a'.repeat(4005));
    expect(describeBox()).toHaveValue('a'.repeat(4000));
    await user.click(
      screen.getByRole('textbox', { name: 'What did you expect' }),
    );
    await user.paste('b'.repeat(2005));
    expect(
      screen.getByRole('textbox', { name: 'What did you expect' }),
    ).toHaveValue('b'.repeat(2000));
  });

  it('sends the report with the page path but no query values, browser and screen size, then thanks the user', async () => {
    window.history.replaceState(
      null,
      '',
      '/admin/instructors?token=secret-123&q=jane&q=again#frag',
    );
    const { user } = await openDialog();
    await user.type(describeBox(), '  The save button spins forever  ');
    await user.type(
      screen.getByRole('textbox', { name: 'What did you expect' }),
      'It saves',
    );
    await user.click(screen.getByRole('radio', { name: "Can't continue" }));
    await user.click(sendButton());

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanks, we got it',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(reportsSent(state)).toEqual([
      {
        description: 'The save button spins forever',
        expected: 'It saves',
        severity: 'blocked',
        pageUrl: 'http://localhost:3000/admin/instructors?token&q',
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent.slice(0, 300),
      },
    ]);
    expect(JSON.stringify(state.calls)).not.toContain('secret-123');
  });

  it('leaves out optional fields that were not filled in', async () => {
    const { user } = await openDialog();
    await user.type(describeBox(), 'Broken');
    await user.click(sendButton());
    await screen.findByRole('status');
    const [sent] = reportsSent(state);
    expect(sent).not.toHaveProperty('expected');
    expect(sent).not.toHaveProperty('severity');
    expect(sent).not.toHaveProperty('screenshotKey');
    expect(sent).not.toHaveProperty('appVersion');
  });

  it('shows what else is sent when the line is opened', async () => {
    window.history.replaceState(null, '', '/lessons?week=2026-11-16');
    const { user, dialog } = await openDialog();
    await user.click(
      within(dialog).getByText('We also send: page, browser, screen size'),
    );
    expect(
      within(dialog).getByText('http://localhost:3000/lessons?week'),
    ).toBeVisible();
    expect(
      within(dialog).getByText(`${window.innerWidth}x${window.innerHeight}`),
    ).toBeVisible();
  });
});

describe('report screenshot', () => {
  it('shrinks a large screenshot to 1600 px, previews it and uploads it before sending the report', async () => {
    const image = mockImagePipeline({
      width: 3200,
      height: 1800,
      outputBytes: 400_000,
    });
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      sizedFile('shot.png', 'image/png', 6_000_000),
    );
    expect(
      await screen.findByRole('img', { name: 'Screenshot preview' }),
    ).toHaveAttribute('src', 'blob:screenshot');
    expect(image.drawn).toEqual([{ width: 1600, height: 900 }]);

    await user.type(describeBox(), 'Look at this');
    await user.click(sendButton());
    await screen.findByRole('status');

    expect(state.calls).toEqual([
      {
        kind: 'screenshot-url',
        body: { contentType: 'image/jpeg', contentLength: 400_000 },
      },
      {
        kind: 'upload',
        key: 'bug-reports/shot-1.jpg',
        contentType: 'image/jpeg',
        bytes: 400_000,
      },
      {
        kind: 'report',
        body: expect.objectContaining({
          description: 'Look at this',
          screenshotKey: 'bug-reports/shot-1.jpg',
        }),
      },
    ]);
  });

  it('warns that a screenshot may show private information, before and after attaching one', async () => {
    mockImagePipeline({ width: 800, height: 600, outputBytes: 50_000 });
    const { user, dialog } = await openDialog();
    const warning =
      'A screenshot may show private information. Hide or crop it before you send.';
    expect(within(dialog).getByText(warning)).toBeVisible();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    await screen.findByRole('img', { name: 'Screenshot preview' });
    expect(within(dialog).getByText(warning)).toBeVisible();
  });

  it('takes a pasted screenshot', async () => {
    mockImagePipeline({ width: 800, height: 600, outputBytes: 50_000 });
    const { user } = await openDialog();
    await user.click(describeBox());
    fireEvent.paste(describeBox(), {
      clipboardData: {
        files: [new File(['png'], 'paste.png', { type: 'image/png' })],
      },
    });
    expect(
      await screen.findByRole('img', { name: 'Screenshot preview' }),
    ).toBeInTheDocument();
    expect(describeBox()).toHaveValue('');
  });

  it('removes the screenshot so the report goes without it', async () => {
    mockImagePipeline({ width: 800, height: 600, outputBytes: 50_000 });
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.webp', { type: 'image/webp' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove screenshot' }),
    );
    expect(
      screen.queryByRole('img', { name: 'Screenshot preview' }),
    ).not.toBeInTheDocument();
    expect(screenshotInput()).toHaveFocus();

    await user.type(describeBox(), 'No picture');
    await user.click(sendButton());
    await screen.findByRole('status');
    expect(state.calls.map((call) => call.kind)).toEqual(['report']);
  });

  it('rejects a file that is not PNG, JPEG or WebP', async () => {
    await openDialog();
    fireEvent.change(screenshotInput(), {
      target: { files: [new File(['gif'], 'a.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use a PNG, JPEG or WebP image.',
    );
  });

  it('rejects a screenshot that is still over 3 MB after shrinking', async () => {
    mockImagePipeline({
      width: 1600,
      height: 1600,
      outputBytes: SCREENSHOT_MAX_BYTES + 1,
    });
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This screenshot is still over 3 MB after shrinking it.',
    );
    expect(
      screen.queryByRole('img', { name: 'Screenshot preview' }),
    ).not.toBeInTheDocument();
  });

  it('says so when the image cannot be read', async () => {
    mockImagePipeline({
      width: 1,
      height: 1,
      outputBytes: 1,
      decodeFails: true,
    });
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This image couldn't be read.",
    );
  });

  it('keeps the text and screenshot when the upload fails', async () => {
    mockImagePipeline({ width: 800, height: 600, outputBytes: 50_000 });
    state.uploadStatus = 403;
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    await screen.findByRole('img', { name: 'Screenshot preview' });
    await user.type(describeBox(), 'Upload me');
    await user.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many screenshot uploads, or the upload failed. Send the report without the screenshot, or try again later.',
    );
    expect(describeBox()).toHaveValue('Upload me');
    expect(
      screen.getByRole('img', { name: 'Screenshot preview' }),
    ).toBeInTheDocument();
    expect(reportsSent(state)).toEqual([]);
  });
});

describe('screenshot limit', () => {
  async function sendWithScreenshot() {
    mockImagePipeline({ width: 800, height: 600, outputBytes: 50_000 });
    const { user } = await openDialog();
    await user.upload(
      screenshotInput(),
      new File(['x'], 'a.png', { type: 'image/png' }),
    );
    await screen.findByRole('img', { name: 'Screenshot preview' });
    await user.type(describeBox(), 'With a picture');
    await user.click(sendButton());
    return user;
  }

  it('explains a screenshot limit instead of the report limit and keeps the text', async () => {
    state.presignStatus = 429;
    await sendWithScreenshot();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Too many screenshot uploads, or the upload failed. Send the report without the screenshot, or try again later.',
    );
    expect(alert).not.toHaveTextContent('You have sent several reports');
    expect(describeBox()).toHaveValue('With a picture');
    expect(reportsSent(state)).toEqual([]);
  });

  it('sends the report without a screenshot key from the screenshot error', async () => {
    state.presignStatus = 429;
    const user = await sendWithScreenshot();
    await user.click(
      await screen.findByRole('button', { name: 'Send without screenshot' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanks, we got it',
    );
    const [sent] = reportsSent(state);
    expect(sent).toMatchObject({ description: 'With a picture' });
    expect(sent).not.toHaveProperty('screenshotKey');
    expect(state.calls.map((call) => call.kind)).toEqual([
      'screenshot-url',
      'report',
    ]);
  });

  it('offers to send without the screenshot when the upload itself fails', async () => {
    state.uploadStatus = 403;
    const user = await sendWithScreenshot();
    await user.click(
      await screen.findByRole('button', { name: 'Send without screenshot' }),
    );
    await screen.findByRole('status');
    expect(reportsSent(state)[0]).not.toHaveProperty('screenshotKey');
  });

  it('keeps the report limit message for a 429 on the report itself', async () => {
    state.reportStatus = 429;
    await sendWithScreenshot();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have sent several reports, try again later',
    );
    expect(
      screen.queryByRole('button', { name: 'Send without screenshot' }),
    ).not.toBeInTheDocument();
  });
});

describe('report errors', () => {
  it('keeps the text and explains a server error', async () => {
    state.reportStatus = 500;
    const { user } = await openDialog();
    await user.type(describeBox(), 'Keep me');
    await user.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't send your report. Your text is still here, so try again.",
    );
    expect(describeBox()).toHaveValue('Keep me');
    expect(
      screen.getByRole('dialog', { name: 'Report an issue' }),
    ).toBeVisible();
  });

  it('says to try later after too many reports and keeps the text', async () => {
    state.reportStatus = 429;
    const { user } = await openDialog();
    await user.type(describeBox(), 'Again');
    await user.click(sendButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have sent several reports, try again later',
    );
    expect(describeBox()).toHaveValue('Again');

    state.reportStatus = null;
    await user.click(sendButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanks, we got it',
    );
    expect(reportsSent(state)).toHaveLength(2);
  });

  it('sends one report when Send is double-clicked', async () => {
    server.use(
      http.post(`${API}/me/bug-reports`, async ({ request }) => {
        state.calls.push({
          kind: 'report',
          body: (await request.json()) as BugReportBody,
        });
        await delay(50);
        return HttpResponse.json(
          { id: 'bug-1', createdAt: '2026-11-19T15:00:00Z' },
          { status: 201 },
        );
      }),
    );
    const { user } = await openDialog();
    await user.type(describeBox(), 'Once');
    await user.dblClick(sendButton());
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Thanks, we got it',
    );
    expect(reportsSent(state)).toHaveLength(1);
  });
});

describe('closing the report dialog', () => {
  it('closes at once when nothing was written', async () => {
    const { user } = await openDialog();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Report an issue' }),
    ).toHaveFocus();
  });

  it('warns before throwing away written text', async () => {
    const { user } = await openDialog();
    await user.type(describeBox(), 'Half a thought');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = screen.getByRole('dialog', {
      name: 'Discard this report?',
    });
    await user.click(
      within(confirm).getByRole('button', { name: 'Keep editing' }),
    );
    expect(describeBox()).toHaveValue('Half a thought');

    await user.keyboard('{Escape}');
    await user.click(
      within(
        screen.getByRole('dialog', { name: 'Discard this report?' }),
      ).getByRole('button', { name: 'Discard' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openDialog(user);
    expect(describeBox()).toHaveValue('');
  });

  it('asks the browser to confirm leaving the page while text is unsent', async () => {
    const { user } = await openDialog();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);

    await user.type(describeBox(), 'Unsent');
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});

describe('report dialog in Chinese', () => {
  it('shows the button, the dialog and the thanks in Chinese', async () => {
    localStorage.setItem('ssms.locale', 'zh-CN');
    const user = userEvent.setup();
    renderWithProviders(<BugReportButton />);
    await user.click(screen.getByRole('button', { name: '报告问题' }));
    const dialog = screen.getByRole('dialog', { name: '报告问题' });
    expect(
      within(dialog).getByRole('group', { name: '影响有多大' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('radio', { name: '无法继续' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('我们还会发送：页面、浏览器、屏幕尺寸'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        '截图可能会显示隐私信息，发送前请先遮挡或裁掉。',
      ),
    ).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: '发送报告' }));
    expect(await screen.findByText('请说明发生了什么。')).toBeVisible();
    await user.type(
      within(dialog).getByRole('textbox', { name: /发生了什么/ }),
      '页面打不开',
    );
    await user.click(within(dialog).getByRole('button', { name: '发送报告' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '谢谢，我们已收到',
    );
  });
});
