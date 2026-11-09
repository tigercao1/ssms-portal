import { vi } from 'vitest';
import {
  viewportGeometry,
  type PdfBox,
} from '@/features/documents/pdf/transforms';
import type { PdfDocument } from '@/sign/pdf/types';

export interface FakeSignPdfPage {
  view?: PdfBox;
  rotate?: 0 | 90 | 180 | 270;
}

export function fakePdf(numPages: number, pages: FakeSignPdfPage[] = []) {
  const doc: PdfDocument = {
    numPages,
    getPage: async (pageNumber) => {
      const { view = [0, 0, 612, 792], rotate = 0 } =
        pages[pageNumber - 1] ?? {};
      return {
        pageNumber,
        getViewport: ({ scale }) => {
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
  return { promise: Promise.resolve(doc), destroy: vi.fn() };
}
