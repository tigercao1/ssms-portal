import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { outputRatio } from './geometry';
import type { SignPdfPage } from '../api';
import type { PdfDocument, PdfPage, PdfViewport } from './types';

const MAX_PAGE_WIDTH = 820;
const FALLBACK_WIDTH = 358;
const LETTER = { width: 612, height: 792 };

export interface PageLayout {
  viewport: PdfViewport;
  scale: number;
}

interface PdfPageViewProps {
  doc: PdfDocument;
  pageNumber: number;
  size?: SignPdfPage;
  label: string;
  children?: (layout: PageLayout) => ReactNode;
}

export function useElementWidth(ref: RefObject<HTMLElement>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return Math.min(width || FALLBACK_WIDTH, MAX_PAGE_WIDTH);
}

function useNearViewport(ref: RefObject<HTMLElement>) {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return near;
}

export function PdfPageView({
  doc,
  pageNumber,
  size = LETTER,
  label,
  children,
}: PdfPageViewProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(boxRef);
  const near = useNearViewport(boxRef);
  const [page, setPage] = useState<PdfPage | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPage(null);
    doc
      .getPage(pageNumber)
      .then((loaded) => {
        if (!cancelled) setPage(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, pageNumber]);

  const turned = size.rotate === 90 || size.rotate === 270;
  const placeholder = turned
    ? { width: size.height, height: size.width }
    : size;
  const scale =
    width / (page?.getViewport({ scale: 1 }).width ?? placeholder.width);
  const viewport = page?.getViewport({ scale }) ?? null;
  const height =
    viewport?.height ?? (placeholder.height * width) / placeholder.width;

  return (
    <div ref={boxRef} className="w-full">
      <div
        role="img"
        aria-label={label}
        data-page-number={pageNumber}
        className="relative mx-auto overflow-hidden bg-white shadow-card ring-1 ring-grey"
        style={{ width, height }}
      >
        {page && viewport && near && (
          <PageCanvas page={page} viewport={viewport} scale={scale} />
        )}
        {viewport && children?.({ viewport, scale })}
      </div>
    </div>
  );
}

function PageCanvas({
  page,
  viewport,
  scale,
}: {
  page: PdfPage;
  viewport: PdfViewport;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = viewport;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = outputRatio(width, height, window.devicePixelRatio);
    const output = page.getViewport({ scale: scale * ratio });
    canvas.width = Math.floor(output.width);
    canvas.height = Math.floor(output.height);
    const task = page.render({ canvas, viewport: output });
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
