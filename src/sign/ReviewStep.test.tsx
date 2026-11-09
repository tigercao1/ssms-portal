import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { fakePdf } from '@/test/signPdfMock';
import { SignApp } from './SignApp';
import type { SignCompletion, SignLang } from './api';
import { mockSignForm, mockSignFormWithPdf } from './mock/fixtures';
import { openPdf } from './pdf/pdfRuntime';

vi.mock('./pdf/pdfRuntime', () => ({ openPdf: vi.fn() }));

const pads = vi.hoisted(() => [] as Array<{ draw: () => void }>);

vi.mock('signature_pad', () => ({
  default: class {
    private data: unknown[] = [];
    private listeners = new Map<string, () => void>();
    constructor() {
      pads.push({
        draw: () => {
          this.listeners.get('beginStroke')?.();
          this.data.push({ points: [] });
          this.listeners.get('endStroke')?.();
        },
      });
    }
    addEventListener(name: string, cb: () => void) {
      this.listeners.set(name, cb);
    }
    removeEventListener() {}
    isEmpty() {
      return this.data.length === 0;
    }
    clear() {
      this.data = [];
    }
    toData() {
      return [...this.data];
    }
    fromData(data: unknown[]) {
      this.data = [...data];
    }
    off() {}
  },
}));

const API = 'http://localhost:3000';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SIGNED_URL = 'https://r2.example.test/original.pdf?X-Amz-Signature=abc';

const EN = {
  name: 'Participant name',
  email: 'Email',
  consent: /I have read and agree/,
};
const ZH = { name: '参与者姓名', email: '电子邮箱', consent: /我已阅读并同意/ };

function serveForm(lang: SignLang, withPdf = true) {
  server.use(
    http.get(`${API}/sign/forms/waiver`, () =>
      HttpResponse.json(
        withPdf ? mockSignFormWithPdf(lang) : mockSignForm(lang),
      ),
    ),
    http.get(`${API}/sign/forms/waiver/original`, () =>
      HttpResponse.json({ url: SIGNED_URL, expiresAt: '2026-11-09T05:10:00Z' }),
    ),
    http.get('https://r2.example.test/original.pdf', () =>
      HttpResponse.arrayBuffer(new Uint8Array([37, 80, 68, 70]).buffer),
    ),
  );
}

function captureSubmit(
  respond: () => Response | Promise<Response> = () =>
    HttpResponse.json({ status: 'signed', emailed: true }, { status: 201 }),
) {
  const sent: SignCompletion[] = [];
  server.use(
    http.post(`${API}/sign/forms/waiver/complete`, async ({ request }) => {
      sent.push((await request.json()) as SignCompletion);
      return respond();
    }),
  );
  return sent;
}

async function fillRequired(
  user: ReturnType<typeof userEvent.setup>,
  labels = EN,
) {
  await user.type(await screen.findByLabelText(labels.name), 'Ada Snow');
  await user.type(screen.getByLabelText(labels.email), 'ada@example.com');
  act(() => pads[0]!.draw());
  await user.click(screen.getByRole('checkbox', { name: labels.consent }));
}

function renderSign(search = '?lang=en') {
  return render(<SignApp location={{ pathname: '/w/waiver', search }} />);
}

function previewPage(page: number, total = 2) {
  return screen.findByRole('img', {
    name: `Preview of page ${page} of ${total} with your answers`,
  });
}

beforeEach(() => {
  pads.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: () => {},
    drawImage: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(openPdf).mockReset();
  vi.mocked(openPdf).mockImplementation(() => fakePdf(2));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T03:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('signing site review step', () => {
  it('validates required fields and signatures on Review and stays on the form', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign();

    await user.click(await screen.findByRole('button', { name: 'Review' }));

    expect(
      screen.getByText('Participant name is required.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please sign in the Participant signature box.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Participant name')).toHaveFocus();
    expect(
      screen.queryByRole('heading', { name: 'Check your document' }),
    ).not.toBeInTheDocument();
    expect(openPdf).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('shows the original pages with the typed answers and drawn signature at their places, without sending', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.type(screen.getByLabelText(/Initials/), '  AS ');

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(
      screen.getByRole('heading', { name: 'Check your document' }),
    ).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(screen.getByRole('note')).toHaveTextContent(
      'Preview, the signed copy is created when you confirm',
    );
    const first = await previewPage(1);
    const second = await previewPage(2);
    expect(within(first).getByText('AS')).toBeInTheDocument();
    expect(within(second).getByText('Ada Snow')).toBeInTheDocument();
    expect(within(second).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(second).getByText('2026-11-07')).toBeInTheDocument();
    const signature = within(second).getByAltText('Participant signature');
    expect(signature).toHaveAttribute('src', PNG);
    const scale = 358 / 612;
    const name = within(second).getByText('Ada Snow');
    expect(parseFloat(name.style.left)).toBeCloseTo(56 * scale);
    expect(parseFloat(name.style.top)).toBeCloseTo((792 - 66.1 - 12.4) * scale);
    expect(parseFloat(name.style.width)).toBeCloseTo(250 * scale);
    expect(within(second).queryByAltText('Guardian signature')).toBeNull();
    expect(screen.getByLabelText('Participant name')).not.toBeVisible();
    expect(sent).toEqual([]);
  });

  it('keeps everything typed and drawn when going back to edit', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await previewPage(2);

    await user.click(screen.getByRole('button', { name: 'Back to edit' }));

    expect(
      screen.getByRole('heading', { level: 1, name: /Release of liability/ }),
    ).toHaveFocus();
    expect(screen.getByLabelText('Participant name')).toHaveValue('Ada Snow');
    expect(screen.getByLabelText('Email')).toHaveValue('ada@example.com');
    expect(screen.getByRole('checkbox', { name: EN.consent })).toBeChecked();
    const pad = screen.getByRole('group', { name: /^Participant signature/ });
    expect(within(pad).getByRole('button', { name: 'Undo' })).toBeEnabled();

    await user.clear(screen.getByLabelText('Participant name'));
    await user.type(screen.getByLabelText('Participant name'), 'Ada Lovelace');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const second = await previewPage(2);
    expect(within(second).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(
      within(second).getByAltText('Participant signature'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.answers.participant_name).toBe('Ada Lovelace');
    expect(sent[0]!.signatures).toEqual({ participant_signature: PNG });
  });

  it('sends exactly today’s request once on Confirm, even when pressed twice', async () => {
    serveForm('en');
    let release: () => void = () => {};
    const sent = captureSubmit(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(
              HttpResponse.json(
                { status: 'signed', emailed: true },
                { status: 201 },
              ),
            );
        }),
    );
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const confirm = screen.getByRole('button', { name: 'Confirm and sign' });

    await user.dblClick(confirm);
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back to edit' })).toBeDisabled();
    act(() => release());

    expect(
      await screen.findByRole('heading', {
        name: 'Signed, a copy has been emailed to you.',
      }),
    ).toHaveFocus();
    expect(sent).toEqual([
      {
        lang: 'en',
        version: 3,
        answers: {
          participant_name: 'Ada Snow',
          email: 'ada@example.com',
          date: '2026-11-07',
        },
        signatures: { participant_signature: PNG },
        consent: true,
      },
    ]);
  });

  it('stays on the preview after a throttled Confirm and sends again on the next press', async () => {
    serveForm('en');
    let status = 429;
    const sent = captureSubmit(() =>
      status === 429
        ? HttpResponse.json({ message: 'slow down' }, { status: 429 })
        : HttpResponse.json(
            { status: 'signed', emailed: true },
            { status: 201 },
          ),
    );
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait a minute and try again.',
    );
    expect(
      screen.getByRole('heading', { name: 'Check your document' }),
    ).toBeInTheDocument();

    status = 201;
    await user.click(screen.getByRole('button', { name: 'Confirm and sign' }));
    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent).toHaveLength(2);
  });

  it('goes back to the form with the field marked when the API rejects an answer', async () => {
    serveForm('en');
    captureSubmit(() =>
      HttpResponse.json(
        { message: ['Field Email (email) must be an email'] },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.click(screen.getByRole('button', { name: 'Confirm and sign' }));

    expect(
      await screen.findByText('Email was not accepted. Please check it.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Email')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Check your document' }),
    ).not.toBeInTheDocument();
  });

  it('lets the signer retry the preview or still confirm when the PDF fails to load', async () => {
    serveForm('en');
    const sent = captureSubmit();
    vi.mocked(openPdf).mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('Invalid PDF')),
      destroy: vi.fn(),
    }));
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Review' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The document could not be shown here.');
    expect(
      within(alert).getByRole('link', { name: 'Open in a new tab' }),
    ).toHaveAttribute('href', SIGNED_URL);
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      within(await previewPage(2)).getByText('Ada Snow'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm and sign' }));
    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent).toHaveLength(1);
  });

  it('shows the review step in Chinese', async () => {
    serveForm('zh');
    captureSubmit();
    const user = userEvent.setup();
    renderSign('');
    await fillRequired(user, ZH);

    await user.click(screen.getByRole('button', { name: '预览并核对' }));

    expect(screen.getByRole('heading', { name: '请核对文件' })).toHaveFocus();
    expect(screen.getByRole('note')).toHaveTextContent(
      '预览：确认后才会生成已签署的副本',
    );
    const second = await screen.findByRole('img', {
      name: '第 2 页（共 2 页）预览，含您填写的内容',
    });
    expect(within(second).getByText('Ada Snow')).toBeInTheDocument();
    expect(within(second).getByAltText('参与者签名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回修改' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '确认并签署' }));
    await screen.findByText('已签署，副本已发送至您的邮箱。');
  });

  it('places answers on a rotated page whose box is offset, as the signed copy does', async () => {
    const form = mockSignFormWithPdf('en');
    serveForm('en');
    server.use(
      http.get(`${API}/sign/forms/waiver`, () =>
        HttpResponse.json({
          ...form,
          originalPdf: {
            pageCount: 1,
            pages: [{ width: 595, height: 842, rotate: 90, x: 10, y: 20 }],
            placements: [
              {
                key: 'participant_name',
                page: 1,
                x: 66,
                y: 120,
                w: 250,
                h: 20,
              },
            ],
          },
        }),
      ),
    );
    vi.mocked(openPdf).mockImplementation(() =>
      fakePdf(1, [{ view: [10, 20, 605, 862], rotate: 90 }]),
    );
    captureSubmit();
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);

    await user.click(screen.getByRole('button', { name: 'Review' }));

    const page = await previewPage(1, 1);
    const scale = 358 / 842;
    expect(parseFloat(page.style.height)).toBeCloseTo(595 * scale);
    const name = within(page).getByText('Ada Snow');
    expect(parseFloat(name.style.left)).toBeCloseTo(100 * scale);
    expect(parseFloat(name.style.top)).toBeCloseTo(56 * scale);
    expect(parseFloat(name.style.width)).toBeCloseTo(20 * scale);
    expect(parseFloat(name.style.height)).toBeCloseTo(250 * scale);
  });

  it('keeps the single-step flow for a form without an original PDF', async () => {
    serveForm('en', false);
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign();
    await fillRequired(user);

    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent).toHaveLength(1);
    expect(openPdf).not.toHaveBeenCalled();
  });
});
