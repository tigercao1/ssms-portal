import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { vi } from 'vitest';
import type { PdfPagesHandle, PdfPagesProps } from '../pdf/PdfPages';
import type { PageGeometry } from '../pdf/transforms';

export const fakePdf = {
  pageCount: 2,
  scrollToRect: vi.fn(),
  lastZoom: 1,
  failingSources: new Set<string>(),
};

export function fakeGeometry(zoom = 1): PageGeometry {
  return {
    transform: [zoom, 0, 0, -zoom, 0, 792 * zoom],
    width: 612 * zoom,
    height: 792 * zoom,
  };
}

/** Stand-in for PdfPages in jsdom: lays out fixed Letter pages and calls the overlay. */
export const FakePdfPages = forwardRef<PdfPagesHandle, PdfPagesProps>(
  function FakePdfPages(
    { source, zoom = 1, renderOverlay, onLoad, onError },
    ref,
  ) {
    fakePdf.lastZoom = zoom;
    useImperativeHandle(ref, () => ({
      getPageElement: () => null,
      getGeometry: () => fakeGeometry(zoom),
      scrollToRect: fakePdf.scrollToRect,
    }));
    useEffect(() => {
      if (!source) return;
      if (typeof source === 'string' && fakePdf.failingSources.has(source)) {
        onError?.(new Error('Unexpected server response (403)'));
        return;
      }
      onLoad?.({
        numPages: fakePdf.pageCount,
        pages: Array.from({ length: fakePdf.pageCount }, (_, i) => ({
          pageNumber: i + 1,
          viewBox: [0, 0, 612, 792],
          rotate: 0,
          width: 612,
          height: 792,
        })),
      });
    }, [source, onLoad, onError]);
    return (
      <div
        data-testid="pdf-pages"
        data-source={String(source)}
        data-zoom={zoom}
      >
        {Array.from({ length: fakePdf.pageCount }, (_, i) => (
          <div
            key={i}
            data-page-number={i + 1}
            style={{ position: 'relative' }}
          >
            {renderOverlay?.({
              pageNumber: i + 1,
              viewBox: [0, 0, 612, 792],
              rotate: 0,
              width: 612,
              height: 792,
              geometry: fakeGeometry(zoom),
              scale: zoom,
              isVisible: true,
            })}
          </div>
        ))}
      </div>
    );
  },
);
