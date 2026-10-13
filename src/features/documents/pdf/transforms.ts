/** Affine matrix `[a, b, c, d, e, f]` as used by pdf.js viewports. */
export type Matrix = [number, number, number, number, number, number];

/**
 * A rendered page's mapping between PDF user space and CSS pixels inside the
 * page box (origin top-left), taken from a pdf.js `PageViewport`.
 */
export interface PageGeometry {
  transform: Matrix;
  width: number;
  height: number;
}

/** Rectangle in PDF points, unrotated user space, origin bottom-left. */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectangle in CSS pixels relative to the page box's top-left corner. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Page box in PDF user space: `[xMin, yMin, xMax, yMax]`. */
export type PdfBox = [number, number, number, number];

export const MAX_CANVAS_PIXELS = 5_000_000;

const ROTATIONS: Record<number, [number, number, number, number]> = {
  0: [1, 0, 0, -1],
  90: [0, 1, 1, 0],
  180: [-1, 0, 0, 1],
  270: [0, -1, -1, 0],
};

/**
 * Builds the same geometry pdf.js computes for
 * `page.getViewport({ scale, rotation })`, without needing pdf.js.
 */
export function viewportGeometry({
  viewBox,
  scale,
  rotation,
  userUnit = 1,
}: {
  viewBox: PdfBox;
  scale: number;
  rotation: number;
  userUnit?: number;
}): PageGeometry {
  const s = scale * userUnit;
  const r = ((rotation % 360) + 360) % 360;
  const rot = ROTATIONS[r];
  if (!rot) throw new Error(`Invalid rotation ${rotation}`);
  const [a, b, c, d] = rot;
  const [x0, y0, x1, y1] = viewBox;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const swapped = a === 0;
  const offX = Math.abs((swapped ? cy - y0 : cx - x0) * s);
  const offY = Math.abs((swapped ? cx - x0 : cy - y0) * s);
  return {
    transform: [
      a * s,
      b * s,
      c * s,
      d * s,
      offX - a * s * cx - c * s * cy,
      offY - b * s * cx - d * s * cy,
    ],
    width: (swapped ? y1 - y0 : x1 - x0) * s,
    height: (swapped ? x1 - x0 : y1 - y0) * s,
  };
}

/** Wraps a pdf.js `PageViewport` (or anything shaped like one). */
export function geometryFromViewport(viewport: {
  transform: number[];
  width: number;
  height: number;
}): PageGeometry {
  const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = viewport.transform;
  return {
    transform: [a, b, c, d, e, f],
    width: viewport.width,
    height: viewport.height,
  };
}

/** PDF point → CSS pixel inside the page box. */
export function pdfToScreenPoint(
  g: PageGeometry,
  x: number,
  y: number,
): [number, number] {
  const [a, b, c, d, e, f] = g.transform;
  return [a * x + c * y + e, b * x + d * y + f];
}

/** CSS pixel inside the page box → PDF point. */
export function screenToPdfPoint(
  g: PageGeometry,
  sx: number,
  sy: number,
): [number, number] {
  const [a, b, c, d, e, f] = g.transform;
  const det = a * d - b * c;
  return [
    (d * (sx - e) - c * (sy - f)) / det,
    (a * (sy - f) - b * (sx - e)) / det,
  ];
}

/** PDF rectangle → CSS rectangle in the rendered (possibly rotated) page. */
export function pdfRectToScreen(g: PageGeometry, r: PdfRect): ScreenRect {
  const [ax, ay] = pdfToScreenPoint(g, r.x, r.y);
  const [bx, by] = pdfToScreenPoint(g, r.x + r.w, r.y + r.h);
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

/** CSS rectangle in the rendered page → PDF rectangle (origin bottom-left). */
export function screenRectToPdf(g: PageGeometry, r: ScreenRect): PdfRect {
  const [ax, ay] = screenToPdfPoint(g, r.left, r.top);
  const [bx, by] = screenToPdfPoint(g, r.left + r.width, r.top + r.height);
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.abs(bx - ax),
    h: Math.abs(by - ay),
  };
}

/** The page box in PDF user space, recovered from the geometry. */
export function pdfPageBox(g: PageGeometry): PdfBox {
  const r = screenRectToPdf(g, {
    left: 0,
    top: 0,
    width: g.width,
    height: g.height,
  });
  return [r.x, r.y, r.x + r.w, r.y + r.h];
}

/** Keeps a PDF rectangle inside a page box, shrinking it if it is too big. */
export function clampPdfRect(r: PdfRect, box: PdfBox): PdfRect {
  const [x0, y0, x1, y1] = box;
  const w = Math.min(Math.max(r.w, 0), x1 - x0);
  const h = Math.min(Math.max(r.h, 0), y1 - y0);
  return {
    x: Math.min(Math.max(r.x, x0), x1 - w),
    y: Math.min(Math.max(r.y, y0), y1 - h),
    w,
    h,
  };
}

/** Rounds every coordinate to `decimals` places (PDF points). */
export function roundPdfRect(r: PdfRect, decimals = 2): PdfRect {
  const k = 10 ** decimals;
  const round = (n: number) => Math.round(n * k) / k;
  return { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) };
}

/**
 * Device-pixel ratio to render a `cssWidth`×`cssHeight` page at, reduced so the
 * canvas stays within `maxPixels`.
 */
export function clampOutputScale(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxPixels: number = MAX_CANVAS_PIXELS,
): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const area = cssWidth * cssHeight;
  if (area <= 0) return dpr;
  return Math.min(dpr, Math.sqrt(maxPixels / area));
}

/**
 * Viewport scale that fits a page `pageWidth` points wide (after rotation)
 * into `containerWidth` CSS pixels, never wider than `maxWidth`.
 */
export function fitScale(
  pageWidth: number,
  containerWidth: number,
  maxWidth = Infinity,
): number {
  if (pageWidth <= 0 || containerWidth <= 0) return 1;
  return Math.min(containerWidth, maxWidth) / pageWidth;
}
