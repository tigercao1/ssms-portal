import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { SignApp } from './SignApp';
import type { SignLang } from './api';
import { mockSignForm, mockSignFormWithPdf } from './mock/fixtures';
import { openPdf } from './pdf/pdfRuntime';
import { fakePdf } from '@/test/signPdfMock';
import { useOriginalPdf } from './pdf/useOriginalPdf';

vi.mock('./pdf/pdfRuntime', () => ({ openPdf: vi.fn() }));

const API = 'http://localhost:3000';
const SIGNED_URL = 'https://r2.example.test/original.pdf?X-Amz-Signature=abc';
const ORIGINAL_ROUTE = `${import.meta.env.VITE_SIGN_API_BASE_URL ?? ''}/sign/forms/waiver/original?lang=en`;

function serveForm(lang: SignLang, withPdf = true) {
  server.use(
    http.get(`${API}/sign/forms/waiver`, () =>
      HttpResponse.json(
        withPdf ? mockSignFormWithPdf(lang) : mockSignForm(lang),
      ),
    ),
  );
}

function serveOriginal(
  expiresAt = new Date(Date.now() + 300_000).toISOString(),
) {
  const requests = { url: 0, pdf: 0 };
  server.use(
    http.get(`${API}/sign/forms/waiver/original`, ({ request }) => {
      requests.url += 1;
      return new URL(request.url).searchParams.get('format') === 'json'
        ? HttpResponse.json({
            url: SIGNED_URL,
            expiresAt,
          })
        : HttpResponse.json({ message: 'not json' }, { status: 400 });
    }),
    http.get('https://r2.example.test/original.pdf', () => {
      requests.pdf += 1;
      return HttpResponse.arrayBuffer(
        new TextEncoder().encode('%PDF-1.4').buffer,
      );
    }),
  );
  return requests;
}

function renderSign(search = '?lang=en') {
  return render(<SignApp location={{ pathname: '/w/waiver', search }} />);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    scale: () => {},
    fillRect: () => {},
    clearRect: () => {},
  } as unknown as CanvasRenderingContext2D);
  vi.mocked(openPdf).mockReset();
  vi.mocked(openPdf).mockImplementation(() => fakePdf(2));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('signing site original document viewer', () => {
  it('preloads the PDF but loads pdf.js only when the reader opens it', async () => {
    serveForm('en');
    const requests = serveOriginal();
    const user = userEvent.setup();
    renderSign();

    const button = await screen.findByRole('button', {
      name: 'View original document',
    });
    await waitFor(() => expect(requests.pdf).toBe(1));
    expect(openPdf).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);

    const region = screen.getByRole('region', { name: 'Original document' });
    expect(
      await within(region).findByRole('img', { name: 'Page 1 of 2' }),
    ).toBeInTheDocument();
    expect(openPdf).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Hide original document' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('pages through the document with next, previous and the page list', async () => {
    serveForm('en');
    serveOriginal();
    const user = userEvent.setup();
    renderSign();

    await user.click(
      await screen.findByRole('button', { name: 'View original document' }),
    );
    await screen.findByRole('img', { name: 'Page 1 of 2' });
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('img', { name: 'Page 2 of 2' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Page' }),
      '1',
    );
    expect(
      await screen.findByRole('img', { name: 'Page 1 of 2' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Hide original document' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Original document' }),
    ).not.toBeInTheDocument();
  });

  it('shows the viewer in Chinese', async () => {
    serveForm('zh');
    serveOriginal();
    const user = userEvent.setup();
    renderSign('');

    await user.click(
      await screen.findByRole('button', { name: '查看原始文件' }),
    );

    expect(
      await screen.findByRole('img', { name: '第 1 页，共 2 页' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: '收起原始文件' }),
    ).toBeInTheDocument();
  });

  it('offers retry and the API link in a new tab when the PDF cannot be fetched', async () => {
    serveForm('en');
    serveOriginal();
    let failures = 2;
    server.use(
      http.get('https://r2.example.test/original.pdf', () => {
        if (failures-- > 0) return HttpResponse.error();
        return HttpResponse.arrayBuffer(new Uint8Array([37]).buffer);
      }),
    );
    const user = userEvent.setup();
    renderSign();

    await user.click(
      await screen.findByRole('button', { name: 'View original document' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The document could not be shown here.');
    const link = within(alert).getByRole('link', { name: 'Open in a new tab' });
    expect(link).toHaveAttribute('href', ORIGINAL_ROUTE);
    expect(link).toHaveAttribute('target', '_blank');

    await user.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('img', { name: 'Page 1 of 2' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the API link when the signed URL cannot be requested, and when pdf.js fails', async () => {
    serveForm('en');
    server.use(
      http.get(`${API}/sign/forms/waiver/original`, () =>
        HttpResponse.json({ message: 'busy' }, { status: 429 }),
      ),
    );
    const user = userEvent.setup();
    renderSign();

    await user.click(
      await screen.findByRole('button', { name: 'View original document' }),
    );

    const link = within(await screen.findByRole('alert')).getByRole('link', {
      name: 'Open in a new tab',
    });
    expect(link).toHaveAttribute('href', ORIGINAL_ROUTE);

    serveOriginal();
    vi.mocked(openPdf).mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('Invalid PDF structure')),
      destroy: vi.fn(),
    }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The document could not be shown here.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('img', { name: 'Page 1 of 2' }),
    ).toBeInTheDocument();
  });

  it('never links the new tab to a signed URL that expires while the error panel stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serveForm('en');
    serveOriginal(new Date(Date.now() + 300_000).toISOString());
    server.use(
      http.get('https://r2.example.test/original.pdf', () =>
        HttpResponse.error(),
      ),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderSign();

    await user.click(
      await screen.findByRole('button', { name: 'View original document' }),
    );
    const alert = await screen.findByRole('alert');
    const link = within(alert).getByRole('link', { name: 'Open in a new tab' });
    expect(link).toHaveAttribute('href', ORIGINAL_ROUTE);

    act(() => vi.advanceTimersByTime(301_000));

    expect(link).toHaveAttribute('href', ORIGINAL_ROUTE);
    expect(link.getAttribute('href')).not.toContain('r2.example.test');
  });

  it('requests a new signed URL when the viewer opens after the preload failed', async () => {
    serveForm('en');
    const requests = serveOriginal();
    let failures = 1;
    server.use(
      http.get('https://r2.example.test/original.pdf', () =>
        failures-- > 0
          ? HttpResponse.error()
          : HttpResponse.arrayBuffer(new Uint8Array([37]).buffer),
      ),
    );
    const user = userEvent.setup();
    renderSign();
    const button = await screen.findByRole('button', {
      name: 'View original document',
    });
    await waitFor(() => expect(requests.url).toBe(1));
    await waitFor(() => expect(failures).toBe(0));

    await user.click(button);

    expect(
      await screen.findByRole('img', { name: 'Page 1 of 2' }),
    ).toBeInTheDocument();
    expect(requests.url).toBe(2);
  });

  it('drops the cached PDF and loads the new original when the form version changes', async () => {
    const requests = serveOriginal();
    let served = 0;
    server.use(
      http.get('https://r2.example.test/original.pdf', () => {
        served += 1;
        return HttpResponse.arrayBuffer(new Uint8Array([served]).buffer);
      }),
    );
    const v3 = fakePdf(1);
    const v4 = fakePdf(2);
    vi.mocked(openPdf)
      .mockImplementationOnce(() => v3)
      .mockImplementationOnce(() => v4);
    const { result, rerender } = renderHook(
      ({ version }) => useOriginalPdf('waiver', 'en', version, true),
      { initialProps: { version: 3 } },
    );
    act(() => result.current.open());
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    rerender({ version: 4 });

    expect(result.current.state).toEqual({ status: 'loading' });
    expect(v3.destroy).toHaveBeenCalled();
    await waitFor(() => {
      const { state } = result.current;
      expect(state.status === 'ready' && state.doc.numPages).toBe(2);
    });
    expect(requests.url).toBe(2);
    expect(
      vi.mocked(openPdf).mock.calls.map(([source]) => [...source]),
    ).toEqual([[1], [2]]);
  });

  it('has no viewer and fetches no PDF for a form without an original', async () => {
    serveForm('en', false);
    const requests = serveOriginal();
    renderSign();

    expect(
      await screen.findByRole('heading', { level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'View original document' }),
    ).not.toBeInTheDocument();
    expect(requests).toEqual({ url: 0, pdf: 0 });
  });
});
