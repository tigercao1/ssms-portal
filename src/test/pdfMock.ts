import { vi } from 'vitest';
import type { PdfLoad } from '@/features/documents/pdf/pdfjs';
import {
  viewportGeometry,
  type PdfBox,
} from '@/features/documents/pdf/transforms';

export interface FakePdfPage {
  view?: PdfBox;
  rotate?: 0 | 90 | 180 | 270;
}

/**
 * A stand-in for a pdf.js document whose pages report real viewport maths
 * but render nothing. Use with
 * `vi.mock('@/features/documents/pdf/pdfjs', () => ({ loadPdf: vi.fn() }))`
 * and `vi.mocked(loadPdf).mockImplementation(() => fakePdfLoad([...]))`.
 */
export function fakePdfLoad(pages: FakePdfPage[]): PdfLoad {
  const doc = {
    numPages: pages.length,
    getPage: async (n: number) => {
      const spec = pages[n - 1] ?? {};
      const view = spec.view ?? [0, 0, 612, 792];
      const rotate = spec.rotate ?? 0;
      return {
        pageNumber: n,
        view,
        rotate,
        getViewport: ({ scale }: { scale: number }) => {
          const g = viewportGeometry({
            viewBox: view,
            scale,
            rotation: rotate,
          });
          return { ...g, transform: [...g.transform] };
        },
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
      };
    },
  };
  return { promise: Promise.resolve(doc as never), destroy: vi.fn() };
}

/** Makes every element report `width` as its clientWidth; returns a restore fn. */
export function stubClientWidth(width: number) {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  });
  return () => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  };
}
