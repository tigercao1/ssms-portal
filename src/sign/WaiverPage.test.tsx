import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { SignApp } from './SignApp';
import type { SignCompletion, SignLang } from './api';
import { mockSignForm } from './mock/fixtures';

const API = 'http://localhost:3000';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

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
    toDataURL() {
      return PNG;
    }
    off() {}
  },
}));

function serveForm(lang: SignLang, version = 3) {
  server.use(
    http.get(`${API}/sign/forms/waiver`, ({ request }) =>
      new URL(request.url).searchParams.get('lang') === lang
        ? HttpResponse.json(mockSignForm(lang, version))
        : HttpResponse.json({ message: 'wrong lang' }, { status: 400 }),
    ),
  );
}

function captureSubmit(
  status = 201,
  body: unknown = { status: 'signed', emailed: true },
) {
  const sent: SignCompletion[] = [];
  server.use(
    http.post(`${API}/sign/forms/waiver/complete`, async ({ request }) => {
      sent.push((await request.json()) as SignCompletion);
      return HttpResponse.json(body as object, { status });
    }),
  );
  return sent;
}

function renderSign(search = '', pathname = '/w/waiver') {
  return render(<SignApp location={{ pathname, search }} />);
}

async function fillRequired(
  user: ReturnType<typeof userEvent.setup>,
  lang: SignLang,
) {
  const labels =
    lang === 'en'
      ? {
          name: 'Participant name',
          email: 'Email',
          consent: /I have read and agree/,
        }
      : { name: '参与者姓名', email: '电子邮箱', consent: /我已阅读并同意/ };
  await user.type(await screen.findByLabelText(labels.name), 'Ada Snow');
  await user.type(screen.getByLabelText(labels.email), 'ada@example.com');
  act(() => pads[0]!.draw());
  await user.click(screen.getByRole('checkbox', { name: labels.consent }));
}

beforeEach(() => {
  pads.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-08T03:30:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('signing site waiver page', () => {
  it('renders the Chinese waiver by default with fields from the API and safe markdown', async () => {
    serveForm('zh');
    server.use(
      http.get(`${API}/sign/forms/waiver`, () =>
        HttpResponse.json({
          ...mockSignForm('zh'),
          bodyMarkdown:
            '## 须知\n\n**重要** <script>alert(1)</script>\n\n- 第一条',
        }),
      ),
    );
    const { container } = renderSign();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '免责声明与风险承担协议',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '须知' })).toBeInTheDocument();
    expect(screen.getByText('重要').tagName).toBe('STRONG');
    expect(
      screen.getByText(/<script>alert\(1\)<\/script>/),
    ).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent('第一条');
    expect(screen.getByLabelText('证件号码 (选填)')).not.toBeRequired();
    expect(screen.getByLabelText('参与者姓名')).toBeRequired();
    expect(screen.getByLabelText('日期')).toHaveValue('2026-11-07');
    expect(screen.getAllByRole('img', { name: /请在此处签名/ })).toHaveLength(
      3,
    );
    expect(
      screen.getByRole('button', { name: '签署并提交' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('renders English when lang=en', async () => {
    serveForm('en');
    renderSign('?lang=en');

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Release of liability and assumption of risk',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Witness name (optional)')).not.toBeRequired();
    expect(screen.getByRole('link', { name: 'our FAQ' })).toHaveAttribute(
      'href',
      'https://ssnow.club/pages/faq',
    );
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows required-field errors inline in the page language and does not submit', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign('?lang=en');

    await user.click(
      await screen.findByRole('button', { name: 'Sign and submit' }),
    );

    expect(
      screen.getByLabelText('Participant name'),
    ).toHaveAccessibleDescription('Participant name is required.');
    expect(screen.getByLabelText('Participant name')).toHaveFocus();
    expect(
      screen.getByRole('group', { name: 'Participant signature' }),
    ).toHaveAccessibleDescription(
      'Please sign in the Participant signature box.',
    );
    expect(
      screen.getByText('Please tick the box to agree before submitting.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ID number is required/)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Please fix the highlighted fields.',
    );

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    expect(
      screen.getByText('Enter a valid email address.'),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('shows Chinese required-field errors', async () => {
    serveForm('zh');
    const user = userEvent.setup();
    renderSign('?lang=zh');

    await user.click(await screen.findByRole('button', { name: '签署并提交' }));

    expect(screen.getByText('请填写参与者姓名。')).toBeInTheDocument();
    expect(screen.getByText('请在“参与者签名”框内签名。')).toBeInTheDocument();
    expect(screen.getByText('提交前请勾选同意。')).toBeInTheDocument();
  });

  it('submits required answers only, leaves optional fields out, then shows the signed message', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

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
    expect(
      screen.queryByRole('button', { name: 'Sign and submit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  it('shows the Chinese signed message and a back link to an allowed return URL', async () => {
    serveForm('zh');
    captureSubmit();
    const user = userEvent.setup();
    renderSign(
      `?return=${encodeURIComponent('https://ssnow.club/pages/waiver')}`,
    );

    await fillRequired(user, 'zh');
    await user.click(screen.getByRole('button', { name: '签署并提交' }));

    expect(
      await screen.findByText('已签署，副本已发送至您的邮箱。'),
    ).toBeInTheDocument();
    const back = screen.getByRole('link', { name: '返回' });
    expect(back).toHaveAttribute('href', 'https://ssnow.club/pages/waiver');
    expect(back).toHaveAttribute('target', '_top');
  });

  it('includes optional signatures and answers when given, and supports undo and redo', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    await user.type(screen.getByLabelText('Witness name (optional)'), 'Bo');
    const witness = within(
      screen.getByRole('group', { name: /^Witness signature/ }),
    );
    act(() => pads[2]!.draw());
    await user.click(witness.getByRole('button', { name: 'Undo' }));
    expect(witness.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(witness.getByRole('button', { name: 'Redo' }));
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent[0]!.answers.witness_name).toBe('Bo');
    expect(sent[0]!.signatures).toEqual({
      participant_signature: PNG,
      witness_signature: PNG,
    });
  });

  it('treats a cleared required signature as missing', async () => {
    serveForm('en');
    const sent = captureSubmit();
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    const participant = within(
      screen.getByRole('group', { name: 'Participant signature' }),
    );
    await user.click(participant.getByRole('button', { name: 'Clear' }));
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    expect(
      screen.getByText('Please sign in the Participant signature box.'),
    ).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('reloads the form on a stale version and submits the new version next time', async () => {
    let version = 3;
    server.use(
      http.get(`${API}/sign/forms/waiver`, () =>
        HttpResponse.json(mockSignForm('en', version)),
      ),
    );
    const sent: SignCompletion[] = [];
    server.use(
      http.post(`${API}/sign/forms/waiver/complete`, async ({ request }) => {
        const body = (await request.json()) as SignCompletion;
        sent.push(body);
        if (body.version !== 4) {
          version = 4;
          return HttpResponse.json({ message: 'stale' }, { status: 409 });
        }
        return HttpResponse.json(
          { status: 'signed', emailed: true },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This form was just updated. We loaded the latest version',
    );
    expect(screen.getByLabelText('Participant name')).toHaveValue('Ada Snow');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));
    await screen.findByText('Signed, a copy has been emailed to you.');
    expect(sent.map((body) => body.version)).toEqual([3, 4]);
  });

  it.each([
    [422, 'Some answers were not accepted. Please check them and try again.'],
    [429, 'Too many attempts. Please wait a minute and try again.'],
    [500, 'Something went wrong. Please try again.'],
  ])('keeps the form and explains a %i', async (status, message) => {
    serveForm('en');
    captureSubmit(status, { message: 'error' });
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(
      screen.getByRole('button', { name: 'Sign and submit' }),
    ).toBeEnabled();
  });

  it('explains a throttled submit in Chinese', async () => {
    serveForm('zh');
    captureSubmit(429, { message: 'slow down' });
    const user = userEvent.setup();
    renderSign();

    await fillRequired(user, 'zh');
    await user.click(screen.getByRole('button', { name: '签署并提交' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '尝试次数过多，请稍等一分钟后再试。',
    );
  });

  it('does not claim the copy was emailed when the API says it was not', async () => {
    serveForm('en');
    captureSubmit(201, { status: 'signed', emailed: false });
    const user = userEvent.setup();
    renderSign('?lang=en');

    await fillRequired(user, 'en');
    await user.click(screen.getByRole('button', { name: 'Sign and submit' }));

    expect(
      await screen.findByText(/We could not email your copy/),
    ).toBeInTheDocument();
  });

  it('shows not found for an unknown form, and retry for a failed load', async () => {
    server.use(
      http.get(`${API}/sign/forms/nope`, () =>
        HttpResponse.json({ message: 'not found' }, { status: 404 }),
      ),
    );
    renderSign('?lang=en', '/w/nope');
    expect(
      await screen.findByText(
        'This form could not be found. Please check the link.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('retries a failed load', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/sign/forms/waiver`, () =>
        fail
          ? HttpResponse.json({ message: 'down' }, { status: 503 })
          : HttpResponse.json(mockSignForm('en')),
      ),
    );
    const user = userEvent.setup();
    renderSign('?lang=en');

    const retry = await screen.findByRole('button', { name: 'Try again' });
    fail = false;
    await user.click(retry);
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Release of liability',
      ),
    );
  });

  it('shows not found for a path that is not a waiver link', () => {
    renderSign('?lang=en', '/admin');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This form could not be found.',
    );
  });
});
