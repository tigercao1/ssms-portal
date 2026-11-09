import { vi } from 'vitest';
import type { PdfDocument } from '@/sign/pdf/types';

export function fakePdf(numPages: number, width = 612, height = 792) {
  const doc: PdfDocument = {
    numPages,
    getPage: async (pageNumber) => ({
      pageNumber,
      getViewport: ({ scale }) => ({
        width: width * scale,
        height: height * scale,
        transform: [scale, 0, 0, -scale, 0, height * scale],
      }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
    }),
  };
  return { promise: Promise.resolve(doc), destroy: vi.fn() };
}
