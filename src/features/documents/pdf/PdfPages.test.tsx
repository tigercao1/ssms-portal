import { createRef } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import {
  PdfPages,
  type PdfPageRenderInfo,
  type PdfPagesHandle,
} from './PdfPages';
import { viewportGeometry, type PdfBox } from './transforms';
import { loadPdf } from './pdfjs';

vi.mock('./pdfjs', () => ({ loadPdf: vi.fn() }));

interface FakePageSpec {
  view: PdfBox;
  rotate: 0 | 90 | 180 | 270;
}

const renders: {
  page: number;
  width: number;
  cancel: ReturnType<typeof vi.fn>;
}[] = [];

function fakePage(n: number, spec: FakePageSpec) {
  return {
    pageNumber: n,
    view: spec.view,
    rotate: spec.rotate,
    getViewport: ({ scale }: { scale: number }) => {
      const g = viewportGeometry({
        viewBox: spec.view,
        scale,
        rotation: spec.rotate,
      });
      return { ...g, transform: [...g.transform] };
    },
    render: ({ viewport }: { viewport: { width: number } }) => {
      const cancel = vi.fn();
      renders.push({ page: n, width: viewport.width, cancel });
      return { promise: Promise.resolve(), cancel };
    },
  };
}

function mockDocument(specs: FakePageSpec[]) {
  const destroy = vi.fn();
  vi.mocked(loadPdf).mockReturnValue({
    promise: Promise.resolve({
      numPages: specs.length,
      getPage: async (n: number) => fakePage(n, specs[n - 1]!),
    } as never),
    destroy,
  });
  return destroy;
}

const LETTER: FakePageSpec = { view: [0, 0, 612, 792], rotate: 0 };

beforeEach(() => {
  renders.length = 0;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 1224,
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  vi.unstubAllGlobals();
});

describe('PdfPages', () => {
  it('lays out every page fit to width and hands the overlay its geometry', async () => {
    mockDocument([LETTER, { view: [0, 0, 612, 792], rotate: 90 }]);
    const overlays: PdfPageRenderInfo[] = [];
    const onLoad = vi.fn();
    renderWithProviders(
      <PdfPages
        source="https://storage.mock/a.pdf"
        maxPageWidth={612}
        onLoad={onLoad}
        renderOverlay={(info) => {
          overlays.push(info);
          return <span>overlay {info.pageNumber}</span>;
        }}
      />,
    );
    expect(await screen.findByText('overlay 2')).toBeInTheDocument();
    const pages = screen.getAllByRole('region');
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveAccessibleName('Page 1 of 2');
    expect(pages[0]).toHaveStyle({ width: '612px', height: '792px' });
    expect(pages[1]).toHaveStyle({ width: '612px' });
    expect(onLoad).toHaveBeenCalledWith({
      numPages: 2,
      pages: [
        {
          pageNumber: 1,
          viewBox: [0, 0, 612, 792],
          rotate: 0,
          width: 612,
          height: 792,
        },
        {
          pageNumber: 2,
          viewBox: [0, 0, 612, 792],
          rotate: 90,
          width: 612,
          height: 792,
        },
      ],
    });
    const second = overlays.filter((o) => o.pageNumber === 2).at(-1)!;
    expect(second.rotate).toBe(90);
    expect(second.geometry.height).toBeCloseTo((612 / 792) * 612);
    expect(second.isVisible).toBe(true);
    await waitFor(() => expect(renders.length).toBeGreaterThanOrEqual(2));
  });

  it('applies zoom and clamps the canvas resolution', async () => {
    mockDocument([LETTER]);
    vi.stubGlobal('devicePixelRatio', 4);
    renderWithProviders(
      <PdfPages
        source="https://storage.mock/a.pdf"
        maxPageWidth={612}
        zoom={2}
      />,
    );
    const page = await screen.findByRole('region');
    expect(page).toHaveStyle({ width: '1224px' });
    await waitFor(() => expect(renders).toHaveLength(1));
    const rendered = renders[0]!.width;
    expect(rendered).toBeLessThan(1224 * 4);
    expect(rendered * rendered * (792 / 612)).toBeLessThanOrEqual(5_000_001);
  });

  it('only renders canvases for pages the observer reports as visible', async () => {
    const observers: { cb: IntersectionObserverCallback; els: Element[] }[] =
      [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        els: Element[] = [];
        constructor(cb: IntersectionObserverCallback) {
          observers.push({ cb, els: this.els });
        }
        observe(el: Element) {
          this.els.push(el);
        }
        disconnect() {}
      },
    );
    mockDocument([LETTER, LETTER, LETTER]);
    renderWithProviders(<PdfPages source="https://storage.mock/a.pdf" />);
    await screen.findAllByRole('region');
    await waitFor(() => expect(observers.at(-1)?.els).toHaveLength(3));
    expect(renders).toHaveLength(0);
    const io = observers.at(-1)!;
    act(() =>
      io.cb(
        [
          {
            target: io.els[1]!,
            isIntersecting: true,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() => expect(renders.map((r) => r.page)).toEqual([2]));
    act(() =>
      io.cb(
        [
          {
            target: io.els[1]!,
            isIntersecting: false,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    await waitFor(() => expect(renders[0]!.cancel).toHaveBeenCalled());
  });

  it('shows an error and reports it when the PDF fails to load', async () => {
    vi.mocked(loadPdf).mockReturnValue({
      promise: Promise.reject(new Error('bad pdf')),
      destroy: vi.fn(),
    });
    const onError = vi.fn();
    renderWithProviders(<PdfPages source="x.pdf" onError={onError} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This PDF could not be opened',
    );
    expect(onError).toHaveBeenCalled();
  });

  it('destroys the loading task on unmount and exposes page geometry', async () => {
    const destroy = mockDocument([LETTER]);
    const ref = createRef<PdfPagesHandle>();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { unmount } = renderWithProviders(
      <PdfPages
        ref={ref}
        source="https://storage.mock/a.pdf"
        maxPageWidth={306}
      />,
    );
    await screen.findByRole('region');
    expect(ref.current?.getGeometry(1)?.width).toBe(306);
    expect(ref.current?.getGeometry(9)).toBeNull();
    expect(ref.current?.getPageElement(1)).toHaveAttribute(
      'data-page-number',
      '1',
    );
    ref.current?.scrollToRect(1, { x: 72, y: 120, w: 180, h: 36 });
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    );
    ref.current?.scrollToRect(4, { x: 0, y: 0, w: 1, h: 1 });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    unmount();
    expect(destroy).toHaveBeenCalled();
  });

  it('renders nothing without a source', () => {
    renderWithProviders(<PdfPages source={null} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(loadPdf).not.toHaveBeenCalledWith(null);
  });
});
