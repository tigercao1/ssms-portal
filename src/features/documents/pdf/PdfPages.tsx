import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useT } from '@/i18n/core/I18nProvider';
import { Banner, Spinner } from '@/components';
import { cn } from '@/lib/cn';
import { loadPdf, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs';
import {
  clampOutputScale,
  fitScale,
  geometryFromViewport,
  pdfRectToScreen,
  type PageGeometry,
  type PdfBox,
  type PdfRect,
} from './transforms';

/** Static facts about one page, independent of zoom. */
export interface PdfPageMeta {
  pageNumber: number;
  /** Page box in PDF user space (pdf.js `page.view`, the CropBox). */
  viewBox: PdfBox;
  /** Page `/Rotate` in degrees. */
  rotate: number;
  /** Unrotated width and height in PDF points. */
  width: number;
  height: number;
}

/** What an overlay needs to place elements over a rendered page. */
export interface PdfPageRenderInfo extends PdfPageMeta {
  /** CSS-pixel mapping for this page at the current zoom. */
  geometry: PageGeometry;
  scale: number;
  /** True while the page is near the viewport and its canvas is live. */
  isVisible: boolean;
}

export interface PdfDocumentInfo {
  numPages: number;
  pages: PdfPageMeta[];
}

export interface PdfPagesHandle {
  /** The page's box element (`data-page-number`), if mounted. */
  getPageElement: (pageNumber: number) => HTMLElement | null;
  /** Current CSS-pixel geometry for a page, once laid out. */
  getGeometry: (pageNumber: number) => PageGeometry | null;
  /** Scrolls the nearest scroll container so a PDF rect is centred. */
  scrollToRect: (
    pageNumber: number,
    rect: PdfRect,
    behavior?: ScrollBehavior,
  ) => void;
}

export interface PdfPagesProps {
  /** URL (e.g. a presigned GET) or raw bytes. `null` renders nothing. */
  source: string | Uint8Array | null;
  /** Multiplier on the fit-to-width scale. */
  zoom?: number;
  /** Widest a page may render at zoom 1, in CSS pixels. */
  maxPageWidth?: number;
  /** Extra space around the viewport within which pages render. */
  rootMargin?: string;
  /** Absolutely positioned content drawn over each page. */
  renderOverlay?: (info: PdfPageRenderInfo) => ReactNode;
  onLoad?: (info: PdfDocumentInfo) => void;
  onError?: (error: unknown) => void;
  className?: string;
  pageClassName?: string;
}

interface LoadedPage {
  proxy: PDFPageProxy;
  meta: PdfPageMeta;
}

function metaOf(proxy: PDFPageProxy): PdfPageMeta {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = proxy.view;
  return {
    pageNumber: proxy.pageNumber,
    viewBox: [x0, y0, x1, y1],
    rotate: proxy.rotate,
    width: x1 - x0,
    height: y1 - y0,
  };
}

function useContainerWidth(ref: React.RefObject<HTMLElement>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setWidth(el.clientWidth));
    };
    setWidth(el.clientWidth);
    const ro =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return width;
}

/**
 * Renders every page of a PDF with pdf.js, fit to the container width. Pages
 * are laid out up front but only those near the viewport hold a canvas; each
 * canvas is clamped to about 5 MP. `renderOverlay` draws over each page using
 * the page's {@link PageGeometry} (see `transforms.ts`).
 */
export const PdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(
  function PdfPages(
    {
      source,
      zoom = 1,
      maxPageWidth = 900,
      rootMargin = '600px 0px',
      renderOverlay,
      onLoad,
      onError,
      className,
      pageClassName,
    },
    ref,
  ) {
    const t = useT();
    const rootRef = useRef<HTMLDivElement>(null);
    const containerWidth = useContainerWidth(rootRef);
    const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
    const [pages, setPages] = useState<LoadedPage[]>([]);
    const [error, setError] = useState<unknown>(null);
    const [visible, setVisible] = useState<Set<number>>(() => new Set());
    const pageEls = useRef(new Map<number, HTMLDivElement>());
    const callbacks = useRef({ onLoad, onError });
    callbacks.current = { onLoad, onError };

    useEffect(() => {
      setDoc(null);
      setPages([]);
      setError(null);
      if (!source) return;
      let cancelled = false;
      const load = loadPdf(source);
      load.promise
        .then(async (pdf) => {
          const proxies = await Promise.all(
            Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)),
          );
          if (cancelled) return;
          const loaded = proxies.map((proxy) => ({
            proxy,
            meta: metaOf(proxy),
          }));
          setDoc(pdf);
          setPages(loaded);
          callbacks.current.onLoad?.({
            numPages: pdf.numPages,
            pages: loaded.map((p) => p.meta),
          });
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err);
          callbacks.current.onError?.(err);
        });
      return () => {
        cancelled = true;
        load.destroy();
      };
    }, [source]);

    const layout = useMemo(() => {
      const available = containerWidth || maxPageWidth;
      return pages.map((p) => {
        const base = p.proxy.getViewport({ scale: 1 });
        const scale = fitScale(base.width, available, maxPageWidth) * zoom;
        return {
          page: p,
          scale,
          geometry: geometryFromViewport(p.proxy.getViewport({ scale })),
        };
      });
    }, [pages, containerWidth, maxPageWidth, zoom]);

    useEffect(() => {
      if (!layout.length) return;
      if (typeof IntersectionObserver === 'undefined') {
        setVisible(new Set(layout.map((l) => l.page.meta.pageNumber)));
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          setVisible((prev) => {
            const next = new Set(prev);
            for (const e of entries) {
              const n = Number((e.target as HTMLElement).dataset.pageNumber);
              if (e.isIntersecting) next.add(n);
              else next.delete(n);
            }
            return next;
          });
        },
        { rootMargin },
      );
      pageEls.current.forEach((el) => io.observe(el));
      return () => io.disconnect();
    }, [layout, rootMargin]);

    const setPageEl = useCallback(
      (n: number) => (el: HTMLDivElement | null) => {
        if (el) pageEls.current.set(n, el);
        else pageEls.current.delete(n);
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        getPageElement: (n) => pageEls.current.get(n) ?? null,
        getGeometry: (n) =>
          layout.find((l) => l.page.meta.pageNumber === n)?.geometry ?? null,
        scrollToRect: (n, rect, behavior = 'smooth') => {
          const el = pageEls.current.get(n);
          const g = layout.find((l) => l.page.meta.pageNumber === n)?.geometry;
          if (!el || !g) return;
          const s = pdfRectToScreen(g, rect);
          const marker = document.createElement('div');
          Object.assign(marker.style, {
            position: 'absolute',
            left: `${s.left}px`,
            top: `${s.top}px`,
            width: `${s.width}px`,
            height: `${s.height}px`,
            pointerEvents: 'none',
          });
          el.appendChild(marker);
          marker.scrollIntoView?.({
            block: 'center',
            inline: 'center',
            behavior,
          });
          marker.remove();
        },
      }),
      [layout],
    );

    return (
      <div
        ref={rootRef}
        className={cn('ph-no-capture flex w-full flex-col gap-4', className)}
      >
        {error ? (
          <Banner tone="error">{t.pdf.loadError}</Banner>
        ) : source && !doc ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          layout.map(({ page, scale, geometry }) => {
            const n = page.meta.pageNumber;
            const isVisible = visible.has(n);
            return (
              <div
                key={n}
                ref={setPageEl(n)}
                data-page-number={n}
                role="region"
                aria-label={t.pdf.pageLabel
                  .replace('{n}', String(n))
                  .replace('{total}', String(layout.length))}
                className={cn(
                  'relative mx-auto shrink-0 bg-white shadow-card',
                  pageClassName,
                )}
                style={{ width: geometry.width, height: geometry.height }}
              >
                {isVisible && (
                  <PageCanvas
                    page={page.proxy}
                    scale={scale}
                    width={geometry.width}
                    height={geometry.height}
                  />
                )}
                {renderOverlay && (
                  <div className="absolute inset-0">
                    {renderOverlay({
                      ...page.meta,
                      geometry,
                      scale,
                      isVisible,
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  },
);

function PageCanvas({
  page,
  scale,
  width,
  height,
}: {
  page: PDFPageProxy;
  scale: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const output = clampOutputScale(width, height, window.devicePixelRatio);
    const viewport = page.getViewport({ scale: scale * output });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    task.promise.catch(() => undefined);
    return () => {
      task.cancel();
      canvas.width = 0;
      canvas.height = 0;
    };
  }, [page, scale, width, height]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="absolute inset-0 block"
      style={{ width, height }}
    />
  );
}
