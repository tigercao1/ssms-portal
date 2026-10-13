import { beforeAll, describe, expect, it } from 'vitest';
import { buildSamplePdf } from '../api/samplePdf';
import {
  clampOutputScale,
  clampPdfRect,
  fitScale,
  geometryFromViewport,
  pdfPageBox,
  pdfRectToScreen,
  pdfToScreenPoint,
  roundPdfRect,
  screenRectToPdf,
  screenToPdfPoint,
  viewportGeometry,
  type PdfBox,
} from './transforms';

const LETTER: PdfBox = [0, 0, 612, 792];
const OFFSET_CROP: PdfBox = [36, 18, 576, 774];

function close(a: number[], b: number[]) {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));
}

type LegacyPdfjs = typeof import('pdfjs-dist');
let pdfjs: LegacyPdfjs;

beforeAll(async () => {
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(
    // @ts-expect-error the worker bundle ships without type declarations
    'pdfjs-dist/legacy/build/pdf.worker.mjs'
  );
  pdfjs =
    (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as LegacyPdfjs;
});

describe('viewportGeometry', () => {
  for (const crop of [undefined, OFFSET_CROP]) {
    for (const rotate of [0, 90, 180, 270] as const) {
      it(`matches pdf.js for crop ${crop?.join(',') ?? 'none'} rotate ${rotate}`, async () => {
        const data = buildSamplePdf([
          { width: 612, height: 792, rotate, cropBox: crop },
        ]);
        const task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const viewBox = (crop ?? LETTER) as PdfBox;
        expect(page.view).toEqual(viewBox);
        for (const scale of [1, 1.5]) {
          const vp = page.getViewport({ scale });
          const ours = viewportGeometry({ viewBox, scale, rotation: rotate });
          const theirs = geometryFromViewport(vp);
          close(ours.transform, theirs.transform);
          expect(ours.width).toBeCloseTo(theirs.width);
          expect(ours.height).toBeCloseTo(theirs.height);
          const [sx, sy] = pdfToScreenPoint(theirs, 100, 200);
          close([sx, sy], vp.convertToViewportPoint(100, 200));
          close(screenToPdfPoint(theirs, sx, sy), vp.convertToPdfPoint(sx, sy));
        }
        await task.destroy();
      });
    }
  }

  it('honours userUnit and rejects odd rotations', () => {
    const g = viewportGeometry({
      viewBox: LETTER,
      scale: 1,
      rotation: 0,
      userUnit: 2,
    });
    expect(g.width).toBe(1224);
    expect(() =>
      viewportGeometry({ viewBox: LETTER, scale: 1, rotation: 45 }),
    ).toThrow();
    expect(
      viewportGeometry({ viewBox: LETTER, scale: 1, rotation: -90 }).width,
    ).toBe(792);
  });
});

describe('PDF ↔ screen rectangles', () => {
  const rect = { x: 72, y: 120, w: 180, h: 36 };

  it('puts a bottom-left PDF rect near the bottom of an unrotated page', () => {
    const g = viewportGeometry({ viewBox: LETTER, scale: 1, rotation: 0 });
    expect(pdfRectToScreen(g, rect)).toEqual({
      left: 72,
      top: 792 - 120 - 36,
      width: 180,
      height: 36,
    });
  });

  it('swaps width and height on a 90° page', () => {
    const g = viewportGeometry({ viewBox: LETTER, scale: 2, rotation: 90 });
    expect(g.width).toBe(1584);
    const s = pdfRectToScreen(g, rect);
    expect(s).toEqual({ left: 240, top: 144, width: 72, height: 360 });
  });

  it('round-trips through every rotation and an offset crop box', () => {
    for (const rotation of [0, 90, 180, 270]) {
      const g = viewportGeometry({
        viewBox: OFFSET_CROP,
        scale: 1.37,
        rotation,
      });
      const back = screenRectToPdf(g, pdfRectToScreen(g, rect));
      close([back.x, back.y, back.w, back.h], [rect.x, rect.y, rect.w, rect.h]);
      close(pdfPageBox(g), OFFSET_CROP);
    }
  });
});

describe('clampPdfRect / roundPdfRect', () => {
  it('pulls a rect back inside the page and shrinks oversize rects', () => {
    expect(clampPdfRect({ x: 600, y: -5, w: 40, h: 20 }, LETTER)).toEqual({
      x: 572,
      y: 0,
      w: 40,
      h: 20,
    });
    expect(clampPdfRect({ x: 10, y: 10, w: 900, h: 10 }, LETTER).w).toBe(612);
    expect(clampPdfRect({ x: 0, y: 0, w: 10, h: 10 }, OFFSET_CROP)).toEqual({
      x: 36,
      y: 18,
      w: 10,
      h: 10,
    });
  });

  it('rounds to two decimals', () => {
    expect(roundPdfRect({ x: 1.23456, y: 2.005, w: 3, h: 4.999 })).toEqual({
      x: 1.23,
      y: 2.01,
      w: 3,
      h: 5,
    });
  });
});

describe('clampOutputScale / fitScale', () => {
  it('keeps the device ratio when the canvas is small', () => {
    expect(clampOutputScale(612, 792, 2)).toBe(2);
  });

  it('caps a large canvas at about 5 MP', () => {
    const s = clampOutputScale(1800, 2330, 3);
    expect(1800 * s * 2330 * s).toBeLessThanOrEqual(5_000_001);
    expect(s).toBeLessThan(3);
  });

  it('falls back to 1 for a missing ratio and handles empty pages', () => {
    expect(clampOutputScale(100, 100, 0)).toBe(1);
    expect(clampOutputScale(0, 0, 2)).toBe(2);
  });

  it('fits to the container but not past the max width', () => {
    expect(fitScale(612, 306)).toBe(0.5);
    expect(fitScale(612, 2000, 918)).toBe(1.5);
    expect(fitScale(0, 100)).toBe(1);
  });
});
