import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw';
import { SignApp } from './SignApp';
import type { SignLang } from './api';
import { mockSignForm, mockSignFormWithPdf } from './mock/fixtures';
import { openPdf } from './pdf/pdfRuntime';
import { fakePdf } from '@/test/signPdfMock';

vi.mock('./pdf/pdfRuntime', () => ({ openPdf: vi.fn() }));

const API = 'http://localhost:3000';
const SIGNED_URL = 'https://r2.example.test/original.pdf?X-Amz-Signature=abc';

function serveForm(lang: SignLang, withPdf = true) {
  server.use(
    http.get(`${API}/sign/forms/waiver`, () =>
      HttpResponse.json(
        withPdf ? mockSignFormWithPdf(lang) : mockSignForm(lang),
      ),
    ),
  );
}

function serveOriginal() {
  const requests = { url: 0, pdf: 0 };
  server.use(
    http.get(`${API}/sign/forms/waiver/original`, ({ request }) => {
      requests.url += 1;
      return new URL(request.url).searchParams.get('format') === 'json'
        ? HttpResponse.json({
            url: SIGNED_URL,
            expiresAt: '2026-11-09T05:10:00Z',
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

  it('offers retry and the same signed URL in a new tab when the PDF cannot be fetched', async () => {
    serveForm('en');
    serveOriginal();
    let failures = 1;
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
    expect(link).toHaveAttribute('href', SIGNED_URL);
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
    expect(link.getAttribute('href')).toMatch(
      /\/sign\/forms\/waiver\/original\?lang=en$/,
    );

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
